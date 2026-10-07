(() => {
  "use strict";

  // Independent, bounded implementation of the eafg request condition in
  // uAssets experimental.txt. The four quick-fixes modes increased startup
  // latency in our live checks; they are intentionally not deployed here.
  // This recovery module does not suppress messages, patch SABR bytes,
  // or accelerate global timers. Cosmetic filtering is independent of it.
  const VERSION = "2.6.1";
  const KEY = Symbol.for("youtube-auto-skip.buffering-recovery");
  if (window[KEY]) return;
  window[KEY] = VERSION;
  const stringify = JSON.stringify;
  const MODES = ["eafg"];
  const WINDOW_MS = 12000;
  const COOLDOWN_MS = 1250;
  const stats = { version: VERSION, hookInstalled: false, eventsBound: false,
    sessions: 0, reloadAttempts: 0, originalReloads: 0, requestTransforms: 0, hookErrors: 0,
    stage: "idle", lastStrategy: null, lastTrigger: null,
    noticeToPlayingMs: null, attemptToPlayingMs: null };
  let session = null;
  let binding = null;
  let navigating = false;
  let queued = false;

  function publish() {
    try {
      if (document.documentElement) document.documentElement.dataset.youtubeAutoSkipRecoveryStatus = stringify(stats);
    } catch {}
  }
  function stop(reason) {
    if (!session || session.stopped) return;
    session.stopped = true;
    session.mode = null;
    restoreClientMarker();
    stats.stage = reason;
    publish();
  }
  function markUserAgent(value, mode) {
    return value.replace(/; (?:channel|lactmilli|instream|yahi|eafg)(?=[;)])/g, "")
      .replace(/(Mozilla\/5\.0 \([^)]+)/, `$1; ${mode}`);
  }
  function restoreClientMarker() {
    if (session?.client && session.client.userAgent === session.markedUserAgent) {
      try { session.client.userAgent = session.originalUserAgent; } catch { stats.hookErrors++; }
    }
  }
  function setClientMarker(mode) {
    const client = window.ytcfg?.data_?.INNERTUBE_CONTEXT?.client;
    if (!client || typeof client.userAgent !== "string") return;
    if (session.client !== client) {
      restoreClientMarker();
      session.client = client;
      session.originalUserAgent = client.userAgent;
    }
    session.markedUserAgent = markUserAgent(session.originalUserAgent, mode);
    try { client.userAgent = session.markedUserAgent; } catch { stats.hookErrors++; }
  }
  function watchId() {
    try {
      const url = new URL(location.href);
      return url.hostname === "www.youtube.com" && url.pathname === "/watch" && !url.searchParams.has("list") ? url.searchParams.get("v") : null;
    } catch { return null; }
  }
  function premium() {
    return window.ytInitialData?.topbar?.desktopTopbarRenderer?.logo?.topbarLogoRenderer?.iconImage?.iconType === "YOUTUBE_PREMIUM_LOGO" ||
      document.getElementById("masthead")?.getAttribute("logo-type") === "YOUTUBE_PREMIUM_LOGO";
  }
  function isAd(player, nerds) {
    return player.classList?.contains("ad-showing") || player.classList?.contains("ad-interrupting") ||
      player.getPresentingPlayerType?.() === 2 || nerds?.debug_info?.startsWith("SSAP, AD");
  }
  function playing(player, video) {
    return !isAd(player, player.getStatsForNerds?.()) && !video.paused && video.readyState >= 2 && video.buffered.length > 0;
  }
  function retryableError(response) {
    const screen = response.playabilityStatus?.errorScreen;
    if (response.playabilityStatus?.status !== "UNPLAYABLE" || screen?.playerErrorMessageRenderer?.playerCaptchaViewModel) return false;
    const runs = screen?.playerErrorMessageRenderer?.subreason?.runs ??
      screen?.playerInterstitialRenderer?.content?.interstitialViewModel?.description?.commandRuns;
    const text = stringify(runs ?? []);
    return text.includes("WEB_PAGE_TYPE_UNKNOWN") && text.includes("https://support.google.com/youtube/answer/3037019");
  }
  function restoreOriginal(reason) {
    const current = session;
    stop(reason);
    // One unmodified reload prevents a rejected alternative from leaving the
    // user on an error screen. It cannot replenish the retry budget.
    if (!current || !current.attempts || current.restored) return;
    current.restored = true;
    stats.originalReloads++;
    publish();
    try { current.player.loadVideoById(current.id, current.start); }
    catch { stats.hookErrors++; publish(); }
  }
  function markPlaying() {
    if (!session || session.stopped || binding?.player !== session.player || watchId() !== session.id || navigating) return;
    try {
      if (!playing(binding.player, binding.video)) return;
      const now = performance.now();
      stats.noticeToPlayingMs = session.noticeAt === null ? null : Math.round(now - session.noticeAt);
      stats.attemptToPlayingMs = session.attemptAt === null ? null : Math.round(now - session.attemptAt);
      stop(session.attempts ? "playback-observed-after-retry" : "playing-without-retry");
    } catch { stats.hookErrors++; }
  }
  function unbind() {
    if (!binding) return;
    try { binding.player.removeEventListener("onSnackbarMessage", binding.notice); } catch {}
    try { binding.video.removeEventListener("playing", binding.play); } catch {}
    binding = null;
    stats.eventsBound = false;
  }
  function bind(player, video) {
    if (binding?.player === player && binding.video === video) return;
    unbind();
    const current = { player, video };
    current.notice = value => {
      // Ignore events retained by an old player and non-interruption messages.
      if (binding !== current) return;
      if (value !== 1 && value?.messageId !== 1) return;
      const id = watchId();
      if (!id) return;
      current.noticeId = id;
      current.noticeAt = performance.now();
      if (session?.id === id && !session.stopped) {
        session.pendingNotice = true;
        if (session.noticeAt === null) session.noticeAt = current.noticeAt;
      }
      schedule();
    };
    current.play = markPlaying;
    binding = current;
    try {
      player.addEventListener("onSnackbarMessage", current.notice);
      stats.eventsBound = true;
    } catch { stats.hookErrors++; }
    video.addEventListener("playing", current.play);
  }

  function scan() {
    try {
      const id = watchId();
      if (!id) { restoreClientMarker(); unbind(); session = null; stats.stage = "not-watch-page"; publish(); return; }
      const player = document.getElementById("movie_player");
      const video = player?.querySelector("video");
      if (!player || !video || typeof player.loadVideoById !== "function") return;
      bind(player, video);
      if (navigating) return;
      const response = player.getPlayerResponse?.();
      if (response?.videoDetails?.videoId !== id) return; // SPA still has the previous video.
      if (!session || session.id !== id) {
        restoreClientMarker();
        const start = Number(response.playerConfig?.playbackStartConfig?.startSeconds ?? player.getCurrentTime?.() ?? 0);
        session = { id, player, start: Number.isFinite(start) && start >= 0 ? start : 0,
          born: performance.now(), attemptAt: null,
          noticeAt: binding.noticeId === id ? binding.noticeAt : null, pendingNotice: binding.noticeId === id,
          attempts: 0, mode: null, stopped: false };
        stats.sessions++;
        stats.stage = "watching-initial-buffer";
        stats.lastStrategy = stats.lastTrigger = stats.noticeToPlayingMs = stats.attemptToPlayingMs = null;
        publish();
      }
      // A replacement player is not a new retry budget for the same navigation.
      session.player = player;
      bind(player, video);
      if (session.stopped) return;
      const now = performance.now();
      const nerds = player.getStatsForNerds?.();
      if (premium() || response.videoDetails.isLive || response.videoDetails.isLiveContent || video.duration === Infinity) return stop("excluded-live-or-premium");
      if (player.getPlayerState?.() === 2) return stop("user-paused");
      // loadVideoById retains the previous response while its next fetch is
      // pending. Never treat that old UNPLAYABLE object as the new attempt's
      // failure; doing so cuts off a potentially valid request.
      const staleError = session.attempts > 0 && response === session.responseBeforeAttempt && retryableError(response);
      const retryError = session.attempts > 0 && !staleError && retryableError(response);
      if (staleError) {
        if (now - session.born >= WINDOW_MS) restoreOriginal("expired-restored");
        return;
      }
      if (response.playabilityStatus?.status && response.playabilityStatus.status !== "OK" && !retryError) return stop("playability-error");
      if (isAd(player, nerds)) return; // Leave ad handling to early.js.
      markPlaying();
      if (session.stopped) return;
      // Before metadata, currentTime can still be 0 even for a ?t=42 URL.
      const pendingStart = video.readyState === 0 && video.buffered.length === 0 && video.currentTime === 0;
      if (!pendingStart && Math.abs(video.currentTime - session.start) > 0.75) return stop("position-changed");
      if (now - session.born >= WINDOW_MS) return retryError ? restoreOriginal("expired-restored") : stop("expired");
      if (session.attemptAt !== null && now - session.attemptAt < COOLDOWN_MS) return;
      const buffering = player.getPlayerStateObject?.()?.isBuffering === true || player.getPlayerState?.() === 3;
      const empty = buffering && video.readyState < 2 && video.buffered.length === 0 &&
        nerds?.buffer_health_seconds === "0.00 s" && nerds?.resolution === "0x0";
      if (!empty && !retryError) return;
      // The event is primary. Strict empty-state fallback covers a missed event,
      // without wrapping every Map.has / Array.push / Promise.then on the page.
      if (!retryError && !session.pendingNotice && (session.attempts > 0 || now - session.born < 1800)) return;
      if (session.attempts >= MODES.length) return restoreOriginal("exhausted-restored");
      session.mode = MODES[session.attempts++];
      session.responseBeforeAttempt = response;
      setClientMarker(session.mode);
      session.attemptAt = now;
      stats.lastStrategy = session.mode;
      stats.lastTrigger = retryError ? "known-retry-playability-error" : session.pendingNotice ? "interruption-and-empty-buffer" : "sustained-initial-empty-buffer";
      session.pendingNotice = false;
      stats.reloadAttempts++;
      stats.stage = "retrying";
      publish();
      // Setting the mode before invoking the player also covers synchronous
      // serialization. Keep the content position; never seek over the intro.
      try { player.loadVideoById(id, session.start); }
      catch { stats.hookErrors++; restoreOriginal("reload-error-restored"); }
    } catch {
      stats.hookErrors++;
      if (session && performance.now() - session.born >= WINDOW_MS) stop("scan-error");
      publish();
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; scan(); });
  }

  // Only plain data playback requests are eligible. Accessors / custom toJSON /
  // replacers keep their native semantics and are not inspected or cloned.
  function dataRecord(value) {
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
    return Object.values(Object.getOwnPropertyDescriptors(value)).every(d => "value" in d) && !("toJSON" in value);
  }
  function transform(value) {
    if (!session?.mode || session.stopped || navigating || watchId() !== session.id || !dataRecord(value)) return value;
    if (value.videoId !== session.id || !Object.hasOwn(value, "attestationRequest") || !value.attestationRequest) return value;
    const context = value.context, playback = value.playbackContext;
    if (!dataRecord(context) || !dataRecord(playback)) return value;
    const client = context.client, content = playback.contentPlaybackContext;
    if (!dataRecord(client) || !dataRecord(content) || client.clientName !== "WEB" || typeof client.userAgent !== "string") return value;
    const mode = session.mode;
    const nextClient = { ...client };
    // This is the Innertube context marker, NOT the browser/network User-Agent.
    nextClient.userAgent = markUserAgent(client.userAgent, mode);
    const nextContent = { ...content };
    if (typeof nextContent.referer !== "string") return value;
    nextContent.referer = nextContent.referer.replace(/(?:#reloadxhr)?$/, "#reloadxhr");
    const nextPlayback = { ...playback, contentPlaybackContext: nextContent };
    const next = { ...value, context: { ...context, client: nextClient }, playbackContext: nextPlayback };
    next.params = "eAFgAQ";
    return next;
  }
  try {
    JSON.stringify = function(value, replacer, space) {
      let next = value;
      if (replacer === undefined || replacer === null) {
        try { next = transform(value); } catch { stats.hookErrors++; }
      }
      const result = Reflect.apply(stringify, this, [next, replacer, space]);
      if (next !== value) { stats.requestTransforms++; publish(); }
      return result;
    };
    stats.hookInstalled = true;
  } catch { stats.hookErrors++; }
  window.youtubeAutoSkipBufferingRecovery = Object.freeze({ getStats: () => ({ ...stats }) });
  document.addEventListener("yt-navigate-start", () => {
    navigating = true;
    restoreClientMarker();
    if (session) session.mode = null;
    if (binding) binding.noticeId = null;
    schedule();
  });
  document.addEventListener("yt-navigate-finish", () => { navigating = false; schedule(); });
  document.addEventListener("DOMContentLoaded", schedule);
  window.addEventListener("popstate", schedule);
  // Bounded polling while waiting for player APIs/initial data, inexpensive idle
  // checks afterward. No document-wide mutation observer is necessary here.
  function tick() { scan(); setTimeout(tick, watchId() && (!session || !session.stopped) ? 100 : 1000); }
  publish();
  tick();
})();
