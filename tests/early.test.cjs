const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../early.js"), "utf8");

function harness(before = "") {
  const context = vm.createContext({ console });
  vm.runInContext(`
    window = globalThis;
    clock = 1000;
    performance = { now: () => clock };
    microtasks = []; timers = new Map(); nextTimer = 0;
    queueMicrotask = fn => microtasks.push(fn);
    setTimeout = fn => { timers.set(++nextTimer, fn); return nextTimer; };
    clearTimeout = id => timers.delete(id);
    flush = () => { let n = 0; while (microtasks.length) {
      if (++n > 30) throw Error('Scan loop'); microtasks.shift()();
    }};
    mutations = [];
    MutationObserver = class { constructor(fn) { mutations.push(fn); } observe() {} disconnect() {} };
    mutate = () => { for (const fn of mutations) fn(); flush(); };
    listeners = new Map(); docListeners = new Map();
    calls = []; buttons = []; state = -1; showing = false; presenting = 1;
    player = {
      listeners,
      isConnected: true,
      matches: () => showing,
      querySelectorAll: () => buttons,
      getAdState: () => state,
      getPresentingPlayerType: () => presenting,
      getOptions: () => ['executeCommand'],
      setOption: (module, name, params) => calls.push({ kind: 'command', module, name, params }),
      onAdUxClicked: (kind, id) => calls.push({ kind: 'layout', event: kind, id }),
      addEventListener(event, fn) { this.listeners.set(event, fn); },
      removeEventListener(event, fn) { if (this.listeners.get(event) === fn) this.listeners.delete(event); },
    };
    document = { documentElement: { dataset: {} }, querySelector: () => player,
      addEventListener: (event, fn) => docListeners.set(event, fn) };
    emit = (event, payload) => listeners.get(event)?.(payload);
    update = (id = 'layout-1', commands = null, modern = false) => ({
      actionType: 1,
      content: { componentType: modern ? 'player-overlay-layout' : 'player-overlay', layoutId: id,
        renderer: modern ? { skipOrPreview: { skipAdViewModel: { skippableState: { skipAdButtonViewModel: {} } } } }
          : { skipOrPreviewRenderer: { skipAdRenderer: { skippableRenderer: { skipButtonRenderer:
            commands ? { adRendererCommands: { clickCommand: commands } } : {} } } } } },
    });
    end = () => { state = -1; showing = false; presenting = 1; emit('onAdEnd'); };
    stats = () => youtubeAutoSkip.getStats();
    makeButton = (disabled = false, ariaDisabled = false) => {
      const b = { isConnected: true, disabled, dataset: {}, clicks: 0,
        getAttribute: () => ariaDisabled ? 'true' : null,
        click() { this.clicks++; this.isConnected = false; } };
      buttons.push(b); return b;
    };
    originalParse = JSON.parse;
  `, context);
  if (before) vm.runInContext(before, context);
  vm.runInContext(source, context);
  vm.runInContext("flush()", context);
  return expression => vm.runInContext(expression, context);
}

test("injects a reusable skipAd without changing JSON or original ad responses", () => {
  const run = harness();
  assert.equal(run("typeof youtubeAutoSkip.skipAd"), "function");
  assert.equal(run("JSON.parse === originalParse"), true);
  assert.equal(run('JSON.parse(\'{"adSlots":[1]}\').adSlots[0]'), 1);
});

test("ad start calls a native skip API immediately with no button or worker", () => {
  const run = harness("player.skipAd = () => { calls.push({kind:'native'}); end(); }");
  run("clock = 1001; emit('onAdStart'); flush()");
  assert.equal(run("calls[0].kind"), "native");
  assert.equal(run("stats().detectionToFirstAttemptMs"), 0);
  assert.equal(run("stats().preRenderClicks"), 0);
  assert.equal(run("stats().adEndsAfterJsAttempt"), 1);
});

test("binds the inner movie player rather than its earlier #player wrapper", () => {
  const run = harness(`
    wrapper = { ...player, listeners: new Map(), matches: () => false,
      getAdState: undefined, getPresentingPlayerType: undefined,
      onAdUxClicked: undefined };
    document.querySelector = selector => selector.includes(',') || selector === '#player' ? wrapper : player;
    player.skipAd = () => { calls.push({kind:'native'}); end(); };
  `);
  run("emit('onAdStart'); flush()");
  assert.equal(run("calls.length"), 1);
  assert.equal(run("stats().detectedAds"), 1);
  assert.equal(run("wrapper.listeners.size"), 0);
});

test("binds an html5 player before falling back to the outer wrapper", () => {
  const run = harness(`
    wrapper = { ...player, listeners: new Map(), matches: () => false,
      getAdState: undefined, getPresentingPlayerType: undefined,
      onAdUxClicked: undefined };
    document.querySelector = selector => selector === '#movie_player' ? null
      : selector === '.html5-video-player' ? player : wrapper;
    player.skipAd = () => calls.push({kind:'native'});
  `);
  run("presenting = 2; mutate()");
  assert.equal(run("calls.length"), 1);
  assert.equal(run("stats().detectedAds"), 1);
});

test("discovers a movie player mounted later inside an existing wrapper", () => {
  const run = harness(`
    mounted = false;
    wrapper = { ...player, listeners: new Map(), matches: () => false,
      getAdState: undefined, getPresentingPlayerType: undefined,
      onAdUxClicked: undefined };
    document.querySelector = selector => mounted && selector !== '#player' && !selector.includes(',')
      ? player : selector === '#player' || selector.includes(',') ? wrapper : null;
    player.skipAd = () => calls.push({kind:'native'});
  `);
  assert.equal(run("listeners.size"), 0);
  run("mounted = true; mutate(); emit('onAdStart'); flush()");
  assert.equal(run("calls.length"), 1);
  assert.equal(run("stats().detectedAds"), 1);
});

test("manual skipAd never runs during content playback", () => {
  const run = harness("player.skipAd = () => calls.push({kind:'native'})");
  assert.equal(run("youtubeAutoSkip.skipAd()"), false);
  assert.equal(run("calls.length"), 0);
});

test("legacy UI metadata executes only END commands with the original layout ID before DOM", () => {
  const run = harness();
  run(`emit('onAdUxUpdate', [update('actual-layout', { commandExecutorCommand: { commands: [
    { adLifecycleCommand: { action: 'END_LINEAR_AD', extra: 'keep' } },
    { urlEndpoint: { url: 'https://example.com' } }, { pingingEndpoint: { url: 'tracking' } },
    { adLifecycleCommand: { action: 'START_LINEAR_AD' } },
  ] } })]);`);
  assert.equal(run("calls[0].kind"), "command");
  assert.equal(run("calls[0].params.layoutId"), "actual-layout");
  assert.equal(run("calls[0].params.command.commandExecutorCommand.commands.length"), 1);
  assert.equal(run("calls[0].params.command.commandExecutorCommand.commands[0].adLifecycleCommand.extra"), "keep");
  assert.equal(run("calls[1].event"), "skip-button");
  assert.equal(run("buttons.length"), 0);
});

test("modern UI uses a known skip layout without needing any DOM node", () => {
  const run = harness();
  run("emit('onAdUxUpdate', [update('modern-id', null, true)])");
  assert.equal(run("calls.length"), 1);
  assert.equal(run("calls[0].id"), "modern-id");
});

test("ignores malformed, non-skip and advertiser-only UI metadata", () => {
  const run = harness();
  run(`emit('onAdUxUpdate', [null, {actionType:1,content:{layoutId:'x',componentType:'visit-advertiser',renderer:{}}},
    {actionType:1,content:{layoutId:'',componentType:'skip-button',renderer:{}}},
    {actionType:1,content:{layoutId:'no-skip',componentType:'player-overlay',renderer:{}}}]);
    emit('onAdUxUpdate', {});`);
  assert.equal(run("calls.length"), 0);
});

test("a removed layout is never used again", () => {
  const run = harness();
  run("emit('onAdUxUpdate', [update()]); emit('onAdUxUpdate', [{...update(), actionType:3}]); clock += 300; youtubeAutoSkip.skipAd()");
  assert.equal(run("calls.length"), 1);
});

test("limits retries per layout but a different ad is attempted immediately", () => {
  const run = harness();
  run("emit('onAdUxUpdate', [update()]); youtubeAutoSkip.skipAd(); emit('onAdUxUpdate', [update('layout-2')])");
  assert.equal(run("calls.length"), 2);
  run("clock += 250; youtubeAutoSkip.skipAd()");
  assert.equal(run("calls.length"), 4);
});

test("ignored or throwing JS routes fall through to an enabled button", () => {
  const run = harness("player.onAdUxClicked = () => { throw Error('Rejected'); }");
  run("b = makeButton(); emit('onAdUxUpdate', [update()]); flush()");
  assert.equal(run("b.clicks"), 1);
  assert.equal(run("stats().preRenderClicks"), 1);
});

test("a synchronous ad end avoids a second command or button click", () => {
  const run = harness("player.setOption = () => { calls.push({kind:'command'}); end(); }");
  run("b = makeButton(); emit('onAdUxUpdate', [update('x', {adLifecycleCommand:{action:'END_LINEAR_AD_PLACEMENT'}})]); flush()");
  assert.equal(run("calls.length"), 1);
  assert.equal(run("b.clicks"), 0);
});

test("SPA reset forgets old layout IDs without attributing a JS success", () => {
  const run = harness();
  run("emit('onAdUxUpdate', [update()]); docListeners.get('yt-navigate-finish')(); clock += 300; flush(); youtubeAutoSkip.skipAd()");
  assert.equal(run("calls.length"), 1);
  assert.equal(run("stats().adEndsAfterJsAttempt"), 0);
});

test("rebinds listeners when the player is replaced", () => {
  const run = harness();
  run("emit('onAdUxUpdate', [update()]); oldListeners = listeners; listeners = new Map(); player = {...player, listeners}; mutate(); emit('onAdUxUpdate', [update('new-player')])");
  assert.equal(run("oldListeners.size"), 0);
  assert.equal(run("calls.at(-1).id"), "new-player");
});

test("presenting player type detects ads even when getAdState returns -1", () => {
  const run = harness("player.skipAd = () => calls.push({kind:'native'})");
  run("presenting = 2; emit('presentingplayerstatechange'); flush()");
  assert.equal(run("calls.length"), 1);
});

test("does not click disabled or aria-disabled buttons before their semantic readiness", () => {
  const run = harness();
  run("state = 1; b = makeButton(true); a = makeButton(false,true); mutate()");
  assert.equal(run("b.clicks + a.clicks"), 0);
  run("b.disabled = false; mutate()");
  assert.equal(run("b.clicks"), 1);
});

test("duplicate injection retains the same function and listener registrations", () => {
  const run = harness();
  run("originalSkip = youtubeAutoSkip.skipAd; originalSize = listeners.size");
  run(source);
  assert.equal(run("youtubeAutoSkip.skipAd === originalSkip && listeners.size === originalSize"), true);
});

test("does not treat an API call that was ignored as an observed ad end", () => {
  const run = harness();
  run("emit('onAdUxUpdate', [update()]); flush()");
  assert.equal(run("stats().jsAttempts"), 1);
  assert.equal(run("stats().adEndsAfterJsAttempt"), 0);
});

test("ignored promise rejections from an optional native API do not block fallback", async () => {
  const run = harness("player.skipAd = () => Promise.reject(Error('Rejected'))");
  run("state = 1; b = makeButton(); mutate()");
  await Promise.resolve();
  assert.equal(run("b.clicks"), 1);
});

test("newly available END commands bypass the previous layout retry delay", () => {
  const run = harness();
  run("emit('onAdUxUpdate', [update()]); emit('onAdUxUpdate', [{...update('layout-1', {adLifecycleCommand:{action:'END_LINEAR_AD'}}), actionType:2}])");
  assert.equal(run("calls.filter(c => c.kind === 'command').length"), 1);
});

test("an updated overlay without skip metadata forgets the previous skip route", () => {
  const run = harness();
  run("emit('onAdUxUpdate', [update()]); emit('onAdUxUpdate', [{actionType:2,content:{layoutId:'layout-1',componentType:'player-overlay',renderer:{}}}]); clock += 300; youtubeAutoSkip.skipAd()");
  assert.equal(run("calls.length"), 1);
});
