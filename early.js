(() => {
  "use strict";

  const VERSION = "2.6.1";
  const marker = Symbol.for("youtube-auto-skip.early");
  if (window[marker] === VERSION) return;
  window[marker] = VERSION;
  const SKIP_SELECTOR = "button.ytp-skip-ad-button, button.ytp-ad-skip-button, " +
    "button.ytp-ad-skip-button-modern, .ytp-skip-ad > button, .ytp-ad-skip-button-slot button";
  const OVERLAYS = new Set(["player-overlay", "player-overlay-layout", "mini-app-player-overlay-layout", "skip-button"]);
  const stats = { version: VERSION, detectedAds: 0, jsAttempts: 0, adEndsAfterJsAttempt: 0,
    preRenderClicks: 0, lastPath: "ready", lastJsPath: null, lastDetection: null, detectionToFirstAttemptMs: null,
    playerId: null, eventsBound: false };
  const layouts = new Map();
  let player = null;
  let eventsPlayer = null;
  let adSignal = false;
  let detectedAt = null;
  let jsAttempted = false;
  let nativeAttemptAt = -Infinity;
  let inSkip = false;
  let scanScheduled = false;
  let pollTimer;
  let lastButton = null;
  let lastButtonAt = -Infinity;

  function publish() {
    if (document.documentElement) {
      document.documentElement.dataset.youtubeAutoSkipEarlyStatus = JSON.stringify(stats);
    }
  }

  function playerAdActive() {
    if (!player) return false;
    if (player.matches(".ad-showing, .ad-interrupting")) return true;
    try {
      // Some current ad modules always return -1; presenting player type 2 is an ad.
      const state = player.getAdState?.();
      return (Number.isFinite(state) && state >= 0) || player.getPresentingPlayerType?.() === 2;
    } catch { return false; }
  }

  function adActive() { return !!player && (adSignal || playerAdActive()); }

  function detect(source) {
    if (detectedAt !== null) return;
    detectedAt = performance.now();
    stats.detectedAds++;
    stats.lastDetection = source;
    stats.detectionToFirstAttemptMs = null;
    publish();
  }

  function resetAd(observedEnd = false) {
    if (observedEnd && jsAttempted) {
      stats.adEndsAfterJsAttempt++;
      stats.lastPath = "ad-end-after-js-attempt";
    }
    adSignal = false;
    detectedAt = null;
    jsAttempted = false;
    nativeAttemptAt = -Infinity;
    lastButton = null;
    layouts.clear();
    publish();
  }

  function endCommands(command, depth = 0, budget = { remaining: 32 }) {
    if (!command || typeof command !== "object" || depth > 4 || --budget.remaining < 0) return [];
    const lifecycle = command.adLifecycleCommand;
    if (lifecycle && ["END_LINEAR_AD", "END_LINEAR_AD_PLACEMENT"].includes(lifecycle.action)) {
      return [{ adLifecycleCommand: lifecycle }];
    }
    const commands = command.commandExecutorCommand?.commands;
    return Array.isArray(commands)
      ? commands.slice(0, 16).flatMap(item => endCommands(item, depth + 1, budget)) : [];
  }

  function skipRenderer(content) {
    if (!OVERLAYS.has(content?.componentType)) return null;
    const renderer = content.renderer;
    if (!renderer || typeof renderer !== "object") return null;
    return renderer.skipOrPreviewRenderer?.skipAdRenderer?.skippableRenderer?.skipButtonRenderer ||
      renderer.skipOrPreview?.skipAdViewModel?.skippableState?.skipAdButtonViewModel ||
      renderer.skipButton?.skipButtonRenderer || renderer.skipAdButton?.skipAdButtonViewModel ||
      (content.componentType === "skip-button" ? renderer : null);
  }

  function onUxUpdate(payload) {
    const updates = Array.isArray(payload) ? payload : payload?.detail;
    if (!Array.isArray(updates)) return;
    let hasSkipLayout = false;
    for (const update of updates.slice(0, 32)) {
      const content = update?.content;
      const id = content?.layoutId;
      if (typeof id !== "string" || !id || id.length > 512) continue;
      if (update.actionType === 3) {
        layouts.delete(id);
        continue;
      }
      if (update.actionType !== 1 && update.actionType !== 2) continue;
      const renderer = skipRenderer(content);
      if (!renderer) {
        if (OVERLAYS.has(content?.componentType)) layouts.delete(id);
        continue;
      }
      const commands = endCommands(renderer.adRendererCommands?.clickCommand || renderer.interaction?.onTap);
      const previous = layouts.get(id);
      layouts.set(id, { commands, lastAttemptAt: commands.length && !previous?.commands.length
        ? -Infinity : previous?.lastAttemptAt ?? -Infinity });
      // These updates are emitted as an ad overlay enters, before its DOM is built.
      hasSkipLayout = true;
      if (layouts.size > 16) layouts.delete(layouts.keys().next().value);
    }
    if (hasSkipLayout && layouts.size) {
      adSignal = true;
      detect("player-ad-ui");
      skipAd("player-ad-ui");
    } else if (!layouts.size && !playerAdActive()) {
      adSignal = false;
    }
    scheduleScan();
  }

  function attempt(path, fn) {
    stats.jsAttempts++;
    stats.lastPath = path;
    stats.lastJsPath = path;
    if (stats.detectionToFirstAttemptMs === null) {
      stats.detectionToFirstAttemptMs = Number((performance.now() - detectedAt).toFixed(2));
    }
    jsAttempted = true;
    publish();
    try {
      const result = fn();
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch { /* A changing internal API must never block button fallback. */ }
  }

  // Returns whether JS was attempted, not whether YouTube accepted it.
  // Injected once at document_start; no worker message, debugger attach, or per-ad injection.
  function skipAd(source = "manual") {
    bindPlayer();
    if (inSkip || !adActive()) return false;
    detect(source);
    inSkip = true;
    const before = stats.jsAttempts;
    try {
      if (typeof player.skipAd === "function" && performance.now() - nativeAttemptAt >= 250) {
        nativeAttemptAt = performance.now();
        attempt("js-native-skip", () => player.skipAd());
      }
      for (const [id, layout] of [...layouts]) {
        if (layouts.get(id) !== layout) continue;
        if (!adActive()) break;
        if (performance.now() - layout.lastAttemptAt < 250) continue;
        layout.lastAttemptAt = performance.now();
        if (layout.commands.length && typeof player.setOption === "function") {
          let supported = false;
          try { supported = player.getOptions?.("ad")?.includes("executeCommand") === true; } catch {}
          if (supported) attempt("js-end-ad-command", () => player.setOption("ad", "executeCommand", {
            command: { commandExecutorCommand: { commands: layout.commands } }, layoutId: id,
          }));
        }
        if (!adActive() || !layouts.has(id)) break;
        if (typeof player.onAdUxClicked === "function") {
          attempt("js-layout-skip", () => player.onAdUxClicked("skip-button", id));
        }
      }
      if (!adActive() && detectedAt !== null) resetAd(true);
    } finally { inSkip = false; }
    return stats.jsAttempts > before;
  }

  function scan() {
    bindPlayer();
    if (adActive()) {
      detect("player-state");
      skipAd("player-state");
      if (adActive()) {
        // Semantic enabled state suffices; do not wait for CSS/layout/paint.
        const button = [...player.querySelectorAll(SKIP_SELECTOR)].find(node =>
          node.isConnected && !node.disabled && node.getAttribute("aria-disabled") !== "true");
        if (button && (button !== lastButton || performance.now() - lastButtonAt >= 250)) {
          lastButton = button;
          lastButtonAt = performance.now();
          button.dataset.youtubeAutoSkipEarlyAt = String(Date.now());
          stats.preRenderClicks++;
          stats.lastPath = "pre-render-button";
          publish();
          try { button.click(); } catch {}
        }
      }
    } else if (detectedAt !== null) resetAd(true);
    clearTimeout(pollTimer);
    pollTimer = setTimeout(scheduleScan, adActive() ? 50 : 1000);
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    queueMicrotask(() => { scanScheduled = false; scan(); });
  }

  function onStart() {
    adSignal = true;
    detect("player-ad-start");
    skipAd("player-ad-start");
    scheduleScan();
  }
  function onEnd() { resetAd(true); scheduleScan(); }
  function onProgress() { onStart(); }
  function onState() { if (playerAdActive()) skipAd("player-state-event"); scheduleScan(); }
  const handlers = { onAdStart: onStart, onAdEnd: onEnd, onAdStateChange: onState,
    onStateChange: onState, presentingplayerstatechange: onState,
    onAdUxUpdate: onUxUpdate, onAdPlaybackProgress: onProgress };
  const observer = new MutationObserver(scheduleScan);

  function bindPlayer() {
    // A comma selector picks the first DOM match, often the outer #player wrapper.
    // The JS API and ad state belong to the inner movie player.
    const next = document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player") || document.querySelector("#player");
    if (next !== player) {
      observer.disconnect();
      if (eventsPlayer) for (const [event, handler] of Object.entries(handlers)) {
        try { eventsPlayer.removeEventListener(event, handler); } catch {}
      }
      eventsPlayer = null;
      player = next;
      stats.playerId = player?.id || null;
      stats.eventsBound = false;
      resetAd();
      if (player) observer.observe(player, { childList: true, subtree: true, attributes: true,
        attributeFilter: ["class", "style", "disabled", "aria-disabled", "hidden"] });
    }
    if (player && eventsPlayer !== player && (typeof player.getAdState === "function" ||
        typeof player.onAdUxClicked === "function" || typeof player.skipAd === "function")) {
      eventsPlayer = player;
      for (const [event, handler] of Object.entries(handlers)) {
        try { player.addEventListener(event, handler); } catch {}
      }
      stats.eventsBound = true;
      publish();
    }
  }

  window.youtubeAutoSkip = Object.freeze({ version: VERSION, skipAd,
    getStats: () => ({ ...stats }) });

  function start() {
    if (!document.documentElement) { setTimeout(start, 0); return; }
    publish();
    new MutationObserver(() => {
      if (!player?.isConnected || eventsPlayer !== player) scheduleScan();
    }).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("yt-navigate-finish", () => { resetAd(); scheduleScan(); });
    document.addEventListener("visibilitychange", scheduleScan);
    scheduleScan();
  }
  start();
})();
