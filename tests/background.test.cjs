const assert = require("node:assert/strict");
const { test } = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../background.js"), "utf8");
const sender = { tab: { id: 7 }, frameId: 0, documentId: "original-document",
  url: "https://www.youtube.com/watch?v=test" };

function harness({ fail, errors = {}, replyError, point = { ok: true, x: 123, y: 456 }, attachGate } = {}) {
  const calls = [];
  let listener;
  const chrome = {
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    tabs: { async sendMessage(tabId, message, options) {
      calls.push({ step: "resolve", tabId, message, options });
      if (errors.resolve) throw new Error(errors.resolve);
      if (fail === "resolve") throw new Error("document gone");
      return point;
    } },
    debugger: {
      async attach(target) {
        calls.push({ step: "attach", target });
        if (attachGate) await attachGate;
        if (errors.attach) throw new Error(errors.attach);
        if (fail === "attach") throw new Error("Another debugger is already attached");
      },
      async sendCommand(target, method, params) {
        calls.push({ step: params.type, target, method, params });
        if (errors[params.type]) throw new Error(errors[params.type]);
        if (fail === params.type) throw new Error("input failed");
      },
      async detach(target) {
        calls.push({ step: "detach", target });
        if (errors.detach) throw new Error(errors.detach);
        if (fail === "detach") throw new Error("detach failed");
      },
    },
  };
  vm.runInNewContext(source, { chrome, performance });
  return { calls, listener, send(requestId = 1, from = sender) {
    return new Promise((resolve) => {
      listener({ type: "CLICK_SKIP_BUTTON", requestId }, from, (response) => {
        calls.push({ step: "response" });
        resolve(response);
        if (replyError) throw new Error(replyError);
      });
    });
  } };
}

test("refreshes coordinates after attach, sends only press/release, detaches before replying", async () => {
  const h = harness();
  const result = await h.send();
  assert.equal(result.ok, true);
  assert.equal(result.clicked, true);
  assert.deepEqual(h.calls.map(c => c.step),
    ["attach", "resolve", "mousePressed", "mouseReleased", "detach", "response"]);
  assert.equal(h.calls[1].options.documentId, sender.documentId);
  assert.equal(h.calls[1].message.requestId, 1);
  for (const call of h.calls.filter(c => c.params)) {
    assert.equal(call.params.x, 123);
    assert.equal(call.params.y, 456);
  }
  for (const key of ["attachMs", "coordinatesMs", "inputMs", "detachMs", "workerMs"]) {
    assert.equal(Number.isFinite(result.timings[key]), true);
  }
});

test("a removed button never produces input, but still detaches", async () => {
  const h = harness({ point: { ok: false } });
  const result = await h.send();
  assert.equal(result.clicked, false);
  assert.deepEqual(h.calls.map(c => c.step), ["attach", "resolve", "detach", "response"]);
});

for (const failure of ["resolve", "mousePressed", "mouseReleased"]) {
  test("detaches when " + failure + " fails and permits the next request", async () => {
    const h = harness({ fail: failure });
    assert.equal((await h.send()).ok, false);
    assert.equal(h.calls.at(-2).step, "detach");
    assert.equal((await h.send(2)).ok, false);
    assert.equal(h.calls.filter(c => c.step === "attach").length, 2);
  });
}

test("an attach conflict does not detach somebody else's debugger", async () => {
  const h = harness({ fail: "attach" });
  assert.equal((await h.send()).ok, false);
  assert.deepEqual(h.calls.map(c => c.step), ["attach", "response"]);
});

test("detach failure is reported as failure", async () => {
  const h = harness({ fail: "detach" });
  assert.equal((await h.send()).error, "detach failed");
});

test("duplicate requests are rejected instead of queueing obsolete clicks", async () => {
  let unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  const h = harness({ attachGate: gate });
  const first = h.send();
  assert.equal((await h.send(2)).ok, false);
  assert.equal(h.calls.filter(c => c.step === "attach").length, 1);
  unblock();
  assert.equal((await first).ok, true);
  assert.equal((await h.send(3)).ok, true);
});

test("different tabs can proceed independently", async () => {
  const h = harness();
  const results = await Promise.all([h.send(), h.send(2, { ...sender, tab: { id: 8 } })]);
  assert.equal(results.every(r => r.ok), true);
  assert.equal(h.calls.filter(c => c.step === "detach").length, 2);
});

test("invalid coordinates are not clicked", async () => {
  const h = harness({ point: { ok: true, x: NaN, y: 4 } });
  assert.equal((await h.send()).clicked, false);
  assert.equal(h.calls.some(c => c.params), false);
});

test("accepts only the YouTube main frame and positive request IDs", () => {
  const h = harness();
  for (const from of [
    { ...sender, url: "https://www.youtube.com.evil.example/" },
    { ...sender, frameId: 1 }, { ...sender, tab: undefined },
  ]) {
    assert.equal(h.listener({ type: "CLICK_SKIP_BUTTON", requestId: 1 }, from, () => {}), false);
  }
  let response;
  assert.equal(h.listener({ type: "CLICK_SKIP_BUTTON", requestId: 0 }, sender,
    r => { response = r; }), false);
  assert.equal(response.ok, false);
  assert.equal(h.calls.length, 0);
});

for (const closedAt of ['attach', 'resolve', 'mousePressed', 'mouseReleased', 'detach']) {
  test('a tab closed during ' + closedAt + ' cancels normally and clears the pending request', async () => {
    const h = harness({ errors: { [closedAt]: 'No tab with given id 7.' } });
    const result = await h.send();
    assert.equal(result.cancelled, true);
    assert.equal(result.clicked, false);
    assert.equal(result.error, undefined);
    await h.send(2);
    assert.equal(h.calls.filter(c => c.step === 'attach').length, 2);
  });
}

test('an already detached target is cancelled without reporting a click', async () => {
  const h = harness({ errors: { detach: 'Debugger is not attached to the tab with id: 7.' } });
  assert.equal((await h.send()).cancelled, true);
});

test('navigation that removes the original receiving document cancels the click', async () => {
  const h = harness({ errors: { resolve: 'Could not establish connection. Receiving end does not exist.' } });
  const result = await h.send();
  assert.equal(result.cancelled, true);
  assert.equal(h.calls.some(c => c.params), false);
  assert.equal(h.calls.some(c => c.step === 'detach'), true);
});

test('a closed reply channel never produces an unhandled rejection or blocks the next request', async () => {
  const h = harness({ replyError: 'No tab with given id 7.' });
  assert.equal((await h.send()).clicked, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await h.send(2)).clicked, true);
  assert.equal(h.calls.filter(c => c.step === 'attach').length, 2);
});
