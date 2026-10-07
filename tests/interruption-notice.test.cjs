const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../interruption-notice.js"), "utf8");
const marker = "data-youtube-auto-skip-interruption";
const message = "동영상 끊김 현상이 발생하나요?";

class Element {
  constructor(tag, text = "", id = "") {
    this.tag = tag; this.textContent = text; this.id = id;
    this.nodeType = 1; this.isConnected = true;
    this.children = []; this.attributes = new Map(); this.dataset = {};
  }
  append(child) { child.parentElement = this; this.children.push(child); return child; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) { return selector === "#text" ? this.id === "text" : selector.split(",").includes(this.tag); }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function harness(initial = [], rootAvailable = true) {
  const root = new Element("html"), observers = [];
  const document = { nodeType: 9, documentElement: rootAvailable ? root : null,
    querySelectorAll: selector => root.querySelectorAll(selector) };
  const toast = (text = message, tag = "yt-notification-action-renderer") => {
    const renderer = new Element(tag);
    renderer.append(new Element("yt-formatted-string", text, "text"));
    renderer.append(new Element("button", "이유 알아보기"));
    return renderer;
  };
  for (const text of initial) root.append(toast(text));
  const context = vm.createContext({ window: {}, document,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; }
    } });
  const run = () => vm.runInContext(source, context);
  const mutate = (target, addedNodes = []) => observers[0].callback([{ target, addedNodes }]);
  run();
  return { root, document, observers, toast, mutate, run,
    stats: () => JSON.parse(root.dataset.youtubeAutoSkipNoticeStatus) };
}

test("hides an already present exact interruption notice and records only counters", () => {
  const h = harness([message]);
  assert.equal(h.root.children[0].getAttribute(marker), "true");
  assert.deepEqual(h.stats(), { version: "2.6.1", hiddenMatches: 1, restoredNotices: 0 });
});

for (const tag of ["yt-notification-action-renderer", "ytd-notification-action-renderer", "ytm-notification-action-renderer"]) {
  test(`detects a newly inserted ${tag} without rescanning all document text`, () => {
    const h = harness(), n = h.root.append(h.toast(message, tag));
    h.mutate(h.root, [n]);
    assert.equal(n.getAttribute(marker), "true");
  });
}

test("leaves unrelated playback errors, saved notifications and similar text visible", () => {
  const h = harness(["동영상을 재생할 수 없습니다.", "재생목록에 저장했습니다.", `${message} 다른 오류입니다.`]);
  assert.equal(h.root.children.some(n => n.getAttribute(marker)), false);
  assert.equal(h.stats().hiddenMatches, 0);
});

test("does not match comments, captions, dialogs or a notice's action button", () => {
  const h = harness();
  const comment = h.root.append(new Element("ytd-comment-view-model", message));
  const caption = h.root.append(new Element("div", message, "text"));
  const notice = h.root.append(h.toast("저장했습니다."));
  notice.children[1].textContent = message;
  h.mutate(h.root, [comment, caption, notice]);
  assert.equal(h.stats().hiddenMatches, 0);
});

test("restores a reused notification node, preserving all page-owned attributes", () => {
  const h = harness([message]), n = h.root.children[0];
  n.setAttribute("style", "display: block; color: red");
  n.setAttribute("aria-hidden", "false");
  n.children[0].textContent = "네트워크 연결을 확인하세요.";
  h.mutate(n.children[0]);
  assert.equal(n.getAttribute(marker), null);
  assert.equal(n.getAttribute("style"), "display: block; color: red");
  assert.equal(n.getAttribute("aria-hidden"), "false");
  assert.equal(h.stats().restoredNotices, 1);
});

test("handles character-data updates and whitespace in the known message", () => {
  const h = harness(), n = h.root.append(h.toast(" ")); h.mutate(h.root, [n]);
  n.children[0].textContent = "  동영상\n끊김 현상이 발생하나요?  ";
  h.mutate({ nodeType: 3, parentElement: n.children[0] });
  assert.equal(n.getAttribute(marker), "true");
});

test("removing the message restores the notification rather than hiding an unknown layout", () => {
  const h = harness([message]), n = h.root.children[0];
  n.children.shift(); h.mutate(n);
  assert.equal(n.getAttribute(marker), null);
});

test("collects notification descendants in late SPA containers", () => {
  const h = harness(), container = h.root.append(new Element("ytd-popup-container"));
  const n = container.append(h.toast("Experiencing interruptions?"));
  h.mutate(h.root, [container]);
  assert.equal(n.getAttribute(marker), "true");
  assert.equal(container.getAttribute(marker), null);
});

test("starts safely before documentElement exists and publishes when it arrives", () => {
  const h = harness([], false);
  h.document.documentElement = h.root;
  const n = h.root.append(h.toast());
  h.mutate(h.document, [h.root]);
  assert.equal(n.getAttribute(marker), "true");
  assert.equal(h.stats().hiddenMatches, 1);
});

test("duplicate injection and repeated mutations do not multiply observers or counters", () => {
  const h = harness([message]); h.run(); h.mutate(h.root.children[0]);
  assert.equal(h.observers.length, 1);
  assert.equal(h.stats().hiddenMatches, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.observers[0].options)),
    { childList: true, characterData: true, subtree: true });
});

test("ignores disconnected notifications", () => {
  const h = harness(), n = h.toast(); n.isConnected = false;
  h.mutate(h.root, [n]);
  assert.equal(n.getAttribute(marker), null);
});

test("manifest installs cosmetic files separately from MAIN playback recovery", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));
  const isolated = manifest.content_scripts.find(s => s.js.includes("interruption-notice.js"));
  assert.equal(manifest.version, "3.0.4");
  assert.equal(isolated.world, undefined);
  assert.equal(isolated.run_at, "document_start");
  assert.ok(isolated.css.includes("interruption-notice.css"));
  assert.ok(manifest.content_scripts.some(s => s.world === "MAIN" && s.js.includes("buffering-recovery.js")));
});
