const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../buffering-recovery.js"), "utf8");

function harness(before = "") {
  const context = vm.createContext({ URL, console });
  vm.runInContext(`
    window = globalThis;
    now = 0; Date.now = () => 1700000000000 + now;
    performance = { now: () => now };
    jobs = []; timers = []; listeners = {};
    queueMicrotask = fn => jobs.push(fn);
    setTimeout = fn => { timers.push(fn); return timers.length; };
    addEventListener = () => {};
    location = { href: 'https://www.youtube.com/watch?v=content' };
    videoListeners = {}; playerListeners = {};
    video = { readyState: 0, buffered: { length: 0 }, paused: false, currentTime: 0, duration: 100,
      addEventListener: (name, fn) => { videoListeners[name] = fn; },
      removeEventListener: (name, fn) => { if (videoListeners[name] === fn) delete videoListeners[name]; } };
    response = { videoDetails: { videoId: 'content' }, playabilityStatus: { status: 'OK' },
      playerConfig: { playbackStartConfig: { startSeconds: 0 } } };
    nerds = { buffer_health_seconds: '0.00 s', resolution: '0x0' };
    state = 3; ad = false; reloads = []; requests = []; originals = [];
    request = () => ({ videoId: response.videoDetails.videoId, attestationRequest: { omitBotguardData: true },
      context: { client: { clientName: 'WEB', userAgent: 'Mozilla/5.0 (Test) Safari/1', clientScreen: 'WATCH' } },
      playbackContext: { contentPlaybackContext: { referer: location.href, lactMilliseconds: '0' } },
      unrelated: { retained: true } });
    player = { classList: { contains: () => ad }, querySelector: () => video,
      getPlayerResponse: () => response, getStatsForNerds: () => nerds,
      getPlayerState: () => state, getPlayerStateObject: () => ({ isBuffering: state === 3 }),
      getPresentingPlayerType: () => ad ? 2 : 1,
      addEventListener: (name, fn) => { playerListeners[name] = fn; },
      removeEventListener: (name, fn) => { if (playerListeners[name] === fn) delete playerListeners[name]; },
      loadVideoById: (id, start) => { reloads.push([id, start]); const body = request();
        originals.push(body); requests.push(JSON.parse(JSON.stringify(body))); } };
    dataset = {};
    document = { documentElement: { dataset },
      getElementById: id => id === 'movie_player' ? player : null,
      addEventListener: (name, fn) => { listeners[name] = fn; } };
    drain = () => { while (jobs.length) jobs.shift()(); };
    tick = ms => { now += ms; const fn = timers.shift(); if (fn) fn(); drain(); };
    notice = () => { playerListeners.onSnackbarMessage?.(1); drain(); };
    stats = () => youtubeAutoSkipBufferingRecovery.getStats();
  `, context);
  vm.runInContext(before, context);
  vm.runInContext(source, context);
  return { run: expr => vm.runInContext(expr, context), json: expr => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context)) };
}

test("interruption with an empty initial buffer changes the request before reloading at the same position", () => {
  const h = harness();
  h.run("notice()");
  assert.deepEqual(h.json("reloads"), [["content", 0]]);
  assert.equal(h.run("requests[0].params"), "eAFgAQ");
  assert.equal(h.run("requests[0].context.client.clientScreen"), "WATCH");
  assert.equal(h.run("requests[0].context.client.userAgent"), "Mozilla/5.0 (Test; eafg) Safari/1");
  assert.equal(h.run("requests[0].playbackContext.contentPlaybackContext.referer.endsWith('#reloadxhr')"), true);
  assert.equal(h.run("requests[0].playbackContext.contentPlaybackContext.lactMilliseconds"), "0");
  assert.equal(h.run("originals[0].context.client.clientScreen"), "WATCH");
  assert.equal(h.run("originals[0].playbackContext.contentPlaybackContext.lactMilliseconds"), "0");
  assert.equal(h.run("stats().requestTransforms"), 1);
});

test("tries eafg once, then restores the original request once and stops", () => {
  const h = harness();
  h.run("notice(); notice(); tick(1250); notice(); tick(1250); notice(); tick(1250); notice(); tick(1250)");
  assert.equal(h.run("reloads.length"), 2);
  assert.equal(h.run("requests[0].params"), "eAFgAQ");
  assert.equal(h.run("stats().stage"), "exhausted-restored");
  assert.equal(h.run("stats().originalReloads"), 1);
  assert.equal(h.run("requests[1].params"), undefined);
  h.run("tick(20000); notice()");
  assert.equal(h.run("reloads.length"), 2);
  assert.equal(h.run("JSON.parse(JSON.stringify(request())).params"), undefined);
});

test("missing notice uses only sustained strict initial empty-buffer fallback", () => {
  const h = harness();
  h.run("tick(1799)");
  assert.equal(h.run("reloads.length"), 0);
  h.run("tick(1)");
  assert.equal(h.run("reloads.length"), 1);
  assert.equal(h.run("stats().lastTrigger"), "sustained-initial-empty-buffer");
});

for (const [name, change] of Object.entries({
  buffered: "video.buffered.length = 1",
  decoded: "video.readyState = 2",
  "real resolution": "nerds.resolution = '1920x1080'",
  "nonempty nerds": "nerds.buffer_health_seconds = '0.20 s'",
  "not buffering": "state = 1",
  advertisement: "ad = true",
  paused: "state = 2; video.paused = true",
  "user seek": "video.currentTime = 5",
  live: "response.videoDetails.isLive = true",
  "playability error": "response.playabilityStatus.status = 'LOGIN_REQUIRED'",
  premium: "ytInitialData = { topbar: { desktopTopbarRenderer: { logo: { topbarLogoRenderer: { iconImage: { iconType: 'YOUTUBE_PREMIUM_LOGO' } } } } } }",
  "previous SPA response": "response.videoDetails.videoId = 'previous'",
  shorts: "location.href = 'https://www.youtube.com/shorts/content'",
  playlist: "location.href = 'https://www.youtube.com/watch?v=content&list=playlist'",
})) {
  test(`does not reload ${name}`, () => {
    const h = harness(change);
    h.run("notice(); tick(2000)");
    assert.equal(h.run("reloads.length"), 0);
  });
}

test("native playing stops further transformations; timings describe observations, not causal success", () => {
  const h = harness();
  h.run("notice(); now = 200; video.readyState = 4; video.buffered.length = 1; state = 1; videoListeners.playing()");
  assert.equal(h.run("stats().stage"), "playback-observed-after-retry");
  assert.equal(h.run("stats().noticeToPlayingMs"), 200);
  assert.equal(h.run("stats().attemptToPlayingMs"), 200);
  h.run("tick(5000); notice(); other = JSON.parse(JSON.stringify(request()))");
  assert.equal(h.run("reloads.length"), 1);
  assert.equal(h.run("other.params"), undefined);
});

test("already playing content is never reloaded even if a stale interruption arrives", () => {
  const h = harness("video.readyState = 4; video.buffered.length = 1; state = 1");
  h.run("notice(); state = 3; video.readyState = 0; video.buffered.length = 0; tick(3000)");
  assert.equal(h.run("reloads.length"), 0);
  assert.equal(h.run("stats().stage"), "playing-without-retry");
});

test("keeps URL start offsets rather than seeking over content", () => {
  const h = harness("response.playerConfig.playbackStartConfig.startSeconds = 42; video.currentTime = 42");
  h.run("notice()");
  assert.deepEqual(h.json("reloads"), [["content", 42]]);
});

test("different-video navigation has a fresh budget but cannot transform old video requests", () => {
  const h = harness();
  h.run("notice(); oldNotice = playerListeners.onSnackbarMessage; listeners['yt-navigate-start'](); location.href = 'https://www.youtube.com/watch?v=next'; oldNotice(1); drain()");
  assert.equal(h.run("reloads.length"), 1);
  h.run("response.videoDetails.videoId = 'next'; listeners['yt-navigate-finish'](); drain(); notice()");
  assert.equal(h.run("stats().sessions"), 2);
  assert.deepEqual(h.json("reloads"), [["content", 0], ["next", 0]]);
  h.run("other = request(); other.videoId = 'content'");
  assert.equal(h.run("JSON.parse(JSON.stringify(other)).params"), undefined);
});

test("same-video navigation does not reset retry budget", () => {
  const h = harness();
  h.run("notice(); listeners['yt-navigate-start'](); listeners['yt-navigate-finish'](); drain(); tick(2000); notice()");
  assert.equal(h.run("stats().sessions"), 1);
  assert.equal(h.run("stats().stage"), "exhausted-restored");
});

test("expires even if an interruption arrives after the initial window", () => {
  const h = harness();
  h.run("tick(12000); notice()");
  assert.equal(h.run("stats().stage"), "expired");
  assert.equal(h.run("reloads.length"), 0);
});

test("loadVideoById errors stop retries and clear the request mode", () => {
  const h = harness("player.loadVideoById = () => { throw new Error('unavailable'); }");
  h.run("notice(); tick(3000)");
  assert.equal(h.run("stats().stage"), "reload-error-restored");
  assert.equal(h.run("stats().hookErrors"), 2);
  assert.equal(h.run("JSON.parse(JSON.stringify(request())).params"), undefined);
});

test("serialization preserves unrelated requests, replacers, custom toJSON, exceptions and source objects", () => {
  const h = harness();
  h.run("notice(); body = request(); body.videoId = 'unrelated'");
  assert.equal(h.run("JSON.parse(JSON.stringify(body)).params"), undefined);
  h.run("body = request(); delete body.attestationRequest");
  assert.equal(h.run("JSON.parse(JSON.stringify(body)).params"), undefined);
  h.run("body = request(); body.context.client.clientName = 'ANDROID'");
  assert.equal(h.run("JSON.parse(JSON.stringify(body)).params"), undefined);
  assert.equal(h.run("JSON.parse(JSON.stringify(request(), (k, v) => v)).params"), undefined);
  assert.equal(h.run("JSON.stringify(request(), ['videoId'])"), '{"videoId":"content"}');
  assert.equal(h.run("JSON.stringify({ toJSON() { return 'custom'; } })"), '"custom"');
  h.run("body = request(); Object.freeze(body); Object.freeze(body.context.client)");
  assert.equal(h.run("JSON.parse(JSON.stringify(body)).params"), "eAFgAQ");
  assert.equal(h.run("body.context.client.clientScreen"), "WATCH");
  assert.throws(() => h.run("JSON.stringify(1n)"), /BigInt/);
  assert.throws(() => h.run("body = {}; body.self = body; JSON.stringify(body)"), /circular/i);
});

test("does not evaluate custom request getters twice", () => {
  const h = harness();
  h.run("notice(); accesses = 0; body = request(); Object.defineProperty(body.context, 'client', { enumerable: true, get() { accesses++; return { clientName: 'WEB' }; } }); JSON.stringify(body)");
  assert.equal(h.run("accesses"), 1);
});

test("duplicate injection preserves one serialization wrapper and timer", () => {
  const h = harness();
  h.run("savedStringify = JSON.stringify");
  h.run(source);
  assert.equal(h.run("JSON.stringify === savedStringify"), true);
  assert.equal(h.run("timers.length"), 1);
});

test("the specific upstream UNPLAYABLE error restores the original request", () => {
  const h = harness();
  h.run(`notice(); response = { ...response, playabilityStatus: { status: 'UNPLAYABLE', errorScreen: {
    playerInterstitialRenderer: { content: { interstitialViewModel: { description: { commandRuns: [{
      commandMetadata: { webCommandMetadata: { webPageType: 'WEB_PAGE_TYPE_UNKNOWN', url: 'https://support.google.com/youtube/answer/3037019' } }
    }] } } } } } } }; state = -1; video.paused = true; tick(1250)`);
  assert.equal(h.run("stats().stage"), "exhausted-restored");
  h.run("response.playabilityStatus.status = 'LOGIN_REQUIRED'; tick(1250)");
  assert.equal(h.run("stats().stage"), "exhausted-restored");
  assert.equal(h.run("reloads.length"), 2);
});

test("does not replenish the budget after an error and original-request restoration", () => {
  const h = harness();
  h.run(`notice(); response = { ...response, playabilityStatus: { status: 'UNPLAYABLE', errorScreen: {
    playerErrorMessageRenderer: { subreason: { runs: [{ url: 'https://support.google.com/youtube/answer/3037019', webPageType: 'WEB_PAGE_TYPE_UNKNOWN' }] } }
  } } }; tick(1250); tick(1250); tick(1250)`);
  assert.equal(h.run("reloads.length"), 2);
  assert.equal(h.run("stats().lastStrategy"), "eafg");
});

test("restores the internal client marker after playback without changing the browser UA", () => {
  const h = harness("ytcfg = { data_: { INNERTUBE_CONTEXT: { client: { userAgent: 'Mozilla/5.0 (Test) Safari/1' } } } }");
  h.run("notice()");
  assert.equal(h.run("ytcfg.data_.INNERTUBE_CONTEXT.client.userAgent"), "Mozilla/5.0 (Test; eafg) Safari/1");
  h.run("video.readyState = 4; video.buffered.length = 1; videoListeners.playing()");
  assert.equal(h.run("ytcfg.data_.INNERTUBE_CONTEXT.client.userAgent"), "Mozilla/5.0 (Test) Safari/1");
});

test("an interruption arriving before current player response is ready is retained", () => {
  const h = harness("response.videoDetails.videoId = 'previous'");
  h.run("notice(); response.videoDetails.videoId = 'content'; tick(250)");
  assert.equal(h.run("reloads.length"), 1);
  assert.equal(h.run("stats().lastTrigger"), "interruption-and-empty-buffer");
});

test("preserves a start offset while the native video still has no metadata", () => {
  const h = harness("response.playerConfig.playbackStartConfig.startSeconds = 42");
  h.run("notice()");
  assert.deepEqual(h.json("reloads"), [["content", 42]]);
});

test("a CAPTCHA-bearing error is not treated as the fake-buffering retry error", () => {
  const h = harness();
  h.run(`notice(); response = { ...response, playabilityStatus: { status: 'UNPLAYABLE', errorScreen: {
    playerErrorMessageRenderer: { playerCaptchaViewModel: {}, subreason: { runs: [{ url: 'https://support.google.com/youtube/answer/3037019', webPageType: 'WEB_PAGE_TYPE_UNKNOWN' }] } }
  } } }; tick(1250)`);
  assert.equal(h.run("reloads.length"), 1);
  assert.equal(h.run("stats().stage"), "playability-error");
});

test("does not overwrite another component's later client userAgent change", () => {
  const h = harness("ytcfg = { data_: { INNERTUBE_CONTEXT: { client: { userAgent: 'Mozilla/5.0 (Test)' } } } }");
  h.run("notice(); ytcfg.data_.INNERTUBE_CONTEXT.client.userAgent = 'external'; video.readyState = 4; video.buffered.length = 1; videoListeners.playing()");
  assert.equal(h.run("ytcfg.data_.INNERTUBE_CONTEXT.client.userAgent"), "external");
});
