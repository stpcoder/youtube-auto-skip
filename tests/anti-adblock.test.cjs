const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../anti-adblock.js"), "utf8");

function harness(before = "") {
  const listeners = {};
  const historyCalls = [];
  const context = vm.createContext({ console, URL, setInterval: () => 1 });
  vm.runInContext(`
    window = globalThis;
    location = { href: 'https://www.youtube.com/watch?v=content' };
    document = {
      documentElement: { dataset: {} },
      addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    };
    window.addEventListener = (name, fn) => { (windowListeners[name] ||= []).push(fn); };
    windowListeners = {};
    listeners = globalThis.listeners;
    history = {
      pushState(...args) { historyCalls.push(['pushState', args]); return 'pushed'; },
      replaceState(...args) { historyCalls.push(['replaceState', args]); return 'replaced'; },
    };
    historyCalls = globalThis.historyCalls;
    MutationObserver = class { observe() {} disconnect() {} };
  `, context);
  // Expose the test-side containers after the fixture declarations.
  context.listeners = listeners;
  context.historyCalls = historyCalls;
  if (before) vm.runInContext(before, context);
  vm.runInContext(source, context);
  return {
    run: expression => vm.runInContext(expression, context),
    listeners,
    windowListeners: context.windowListeners,
    historyCalls,
  };
}

test("installs a locked google_ad_status guard and blocks overwrites", () => {
  const h = harness();
  assert.equal(h.run("window.google_ad_status"), 1);
  assert.equal(h.run("Object.getOwnPropertyDescriptor(window, 'google_ad_status').configurable"), false);
  h.run("window.google_ad_status = 0");
  assert.equal(h.run("window.google_ad_status"), 1);
  assert.equal(h.run("youtubeAutoSkipAntiAdblock.getStats().blockedWrites"), 1);
  assert.equal(h.run("youtubeAutoSkipAntiAdblock.getStats().guardInstalled"), true);
  assert.equal(h.run("youtubeAutoSkipAntiAdblock.getStats().mode"), "locked");
});

test("reasserts on navigation without forcing a page reload", () => {
  const h = harness();
  assert.equal(h.run("history.pushState({}, '', '/watch?v=next')"), "pushed");
  h.listeners["yt-navigate-finish"][0]();
  h.windowListeners.popstate[0]();
  assert.equal(h.run("window.google_ad_status"), 1);
  assert.equal(h.run("youtubeAutoSkipAntiAdblock.getStats().navigationSignals"), 4);
  assert.equal(h.run("typeof location.reload"), "undefined");
  assert.deepEqual(h.historyCalls.map(([name]) => name), ["pushState"]);
});

test("does not replace an already non-configurable property", () => {
  const h = harness("Object.defineProperty(window, 'google_ad_status', { configurable: false, enumerable: true, value: 0, writable: false })");
  assert.equal(h.run("window.google_ad_status"), 0);
  assert.equal(h.run("youtubeAutoSkipAntiAdblock.getStats().guardInstalled"), false);
  assert.equal(h.run("youtubeAutoSkipAntiAdblock.getStats().mode"), "existing");
});

test("duplicate injection does not wrap history twice", () => {
  const h = harness();
  h.run("originalPushState = history.pushState; originalStats = youtubeAutoSkipAntiAdblock.getStats");
  h.run(source);
  assert.equal(h.run("history.pushState === originalPushState"), true);
  assert.equal(h.run("youtubeAutoSkipAntiAdblock.getStats === originalStats"), true);
});
