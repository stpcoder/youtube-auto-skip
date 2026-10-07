(() => {
  "use strict";

  // The companion userscript in RemoveAdblockThing primarily prevents
  // YouTube's page-side adblock signal from being overwritten. Keep that
  // concern separate from response pruning: this does not alter media
  // requests, force a reload, or hide real player errors.
  const VERSION = "2.6.1";
  const marker = Symbol.for("youtube-auto-skip.anti-adblock");
  if (window[marker]) return;
  window[marker] = VERSION;

  const STATUS_NAME = "google_ad_status";
  const stats = {
    version: VERSION,
    guardInstalled: false,
    mode: "uninstalled",
    navigationSignals: 0,
    blockedWrites: 0,
    reassertions: 0,
    hooks: [],
    hookErrors: 0,
    lastReason: null,
  };

  function publish() {
    if (document.documentElement) {
      document.documentElement.dataset.youtubeAutoSkipAntiAdblockStatus =
        JSON.stringify(stats);
    }
  }

  function setStatus(reason, countAsReassertion = false) {
    stats.lastReason = reason;
    if (countAsReassertion) stats.reassertions++;
    try {
      window[STATUS_NAME] = 1;
    } catch {
      stats.hookErrors++;
    }
    publish();
  }

  function installGuard() {
    const descriptor = Object.getOwnPropertyDescriptor(window, STATUS_NAME);

    // Prefer the same page-side signal used by the reference userscript, but
    // do not reload the SPA when the URL changes. A reload would repeat the
    // server's initial media wait and can make the reported symptom worse.
    if (!descriptor || descriptor.configurable !== false) {
      try {
        Object.defineProperty(window, STATUS_NAME, {
          configurable: false,
          enumerable: descriptor?.enumerable ?? true,
          get() { return 1; },
          set(value) {
            if (value !== 1) stats.blockedWrites++;
            stats.lastReason = "blocked-write";
            publish();
          },
        });
        stats.guardInstalled = true;
        stats.mode = "locked";
      } catch {
        stats.hookErrors++;
      }
    } else {
      // A page or another userscript may have created a non-configurable
      // property first. Preserve its descriptor and only reassert when it is
      // writable or has a setter; never throw over the page's own state.
      try {
        if ("value" in descriptor && descriptor.writable) {
          Reflect.set(window, STATUS_NAME, 1);
          stats.guardInstalled = window[STATUS_NAME] === 1;
          stats.mode = stats.guardInstalled ? "existing-writable" : "existing";
        } else {
          stats.guardInstalled = window[STATUS_NAME] === 1;
          stats.mode = stats.guardInstalled ? "existing-readonly" : "existing";
          if (descriptor.set) Reflect.set(window, STATUS_NAME, 1);
        }
      } catch {
        stats.hookErrors++;
      }
    }

    setStatus("startup");
  }

  function signal(reason) {
    stats.navigationSignals++;
    setStatus(reason, stats.mode !== "locked" && stats.mode !== "existing-readonly");
  }

  function hookHistory(method) {
    try {
      const original = history[method];
      if (typeof original !== "function") return;
      history[method] = function (...args) {
        signal("history." + method + ".before");
        const result = Reflect.apply(original, this, args);
        signal("history." + method + ".after");
        return result;
      };
      stats.hooks.push("history." + method);
    } catch {
      stats.hookErrors++;
    }
  }

  installGuard();

  for (const method of ["pushState", "replaceState"]) hookHistory(method);
  for (const event of ["yt-navigate-start", "yt-page-data-updated", "yt-navigate-finish"]) {
    try {
      document.addEventListener(event, () => signal(event), true);
      stats.hooks.push("document." + event);
    } catch {
      stats.hookErrors++;
    }
  }
  try {
    window.addEventListener("popstate", () => signal("popstate"), true);
    stats.hooks.push("window.popstate");
  } catch {
    stats.hookErrors++;
  }

  // A locked descriptor cannot be overwritten, so do not wake a timer for it.
  // This fallback is only for a pre-existing writable descriptor.
  if (stats.mode !== "locked" && stats.mode !== "existing-readonly" &&
      typeof setInterval === "function") {
    setInterval(() => signal("keep-alive"), 500);
  }

  window.youtubeAutoSkipAntiAdblock = Object.freeze({
    version: VERSION,
    getStats: () => ({ ...stats, hooks: [...stats.hooks] }),
  });
  publish();
  if (!document.documentElement) {
    const observer = new MutationObserver(() => {
      if (document.documentElement) {
        publish();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true });
  }
})();
