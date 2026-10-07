(() => {
  "use strict";

  const VERSION = "2.6.1";
  const marker = Symbol.for("youtube-auto-skip.prevention");
  if (window[marker]) return;
  window[marker] = VERSION;
  const parse = JSON.parse;
  const stringify = JSON.stringify;
  const AD_FIELDS = ["adPlacements", "adSlots", "playerAds"];
  const WRAPPERS = ["playerResponse", "raw_player_response", "player_response"];
  const HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com"]);
  const stats = { version: VERSION, responsesPruned: 0, fieldsRemoved: 0,
    initialResponses: 0, fetchResponses: 0, xhrResponses: 0,
    lastPath: "ready", lastTransformMs: null, hooks: [], hookErrors: 0 };
  const xhrCache = new WeakMap();

  function publish() {
    if (document.documentElement) {
      document.documentElement.dataset.youtubeAutoSkipPreventionStatus = stringify(stats);
    }
  }

  function playerEndpoint(value) {
    if (typeof value !== "string" || !value) return false;
    try {
      const url = new URL(value, location.href);
      return url.protocol === "https:" && HOSTS.has(url.hostname) &&
        (/^\/youtubei\/v\d+\/(?:player|get_watch|next)$/.test(url.pathname) ||
          /^\/(?:watch|playlist)$/.test(url.pathname));
    } catch { return false; }
  }

  function isPlayerResponse(value) {
    return value && typeof value === "object" && !Array.isArray(value) &&
      typeof value.videoDetails?.videoId === "string" &&
      value.videoDetails.videoId.length > 0 &&
      (value.playabilityStatus && typeof value.playabilityStatus === "object" ||
        value.streamingData && typeof value.streamingData === "object");
  }

  // Visit only known player envelopes. Do not walk arbitrary page/account data.
  function prune(value, depth = 0, budget = { remaining: 96 }) {
    if (!value || typeof value !== "object" || depth > 3 || --budget.remaining < 0) return 0;
    let removed = 0;
    if (isPlayerResponse(value)) {
      for (const key of AD_FIELDS) {
        if (!Object.hasOwn(value, key)) continue;
        try { if (Reflect.deleteProperty(value, key)) removed++; } catch {}
      }
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 64)) removed += prune(item, depth + 1, budget);
    } else {
      for (const key of WRAPPERS) {
        const child = value[key];
        if (typeof child === "string" && child.length <= 8 * 1024 * 1024 &&
            /"(?:adPlacements|adSlots|playerAds)"\s*:/.test(child)) {
          try {
            const parsed = parse(child);
            const count = prune(parsed, depth + 1, budget);
            if (count && Reflect.set(value, key, stringify(parsed))) removed += count;
          } catch {}
        } else if (child && typeof child === "object") {
          removed += prune(child, depth + 1, budget);
        }
      }
    }
    return removed;
  }

  function record(removed, path, startedAt) {
    if (!removed) return;
    stats.responsesPruned++;
    stats.fieldsRemoved += removed;
    stats[path + "Responses"]++;
    stats.lastPath = path;
    stats.lastTransformMs = Number((performance.now() - startedAt).toFixed(2));
    publish();
  }

  function pruneObject(value, path) {
    const startedAt = performance.now();
    try { record(prune(value), path, startedAt); } catch {}
    return value;
  }

  function pruneText(text, path) {
    if (typeof text !== "string" || text.length > 8 * 1024 * 1024 ||
        !/"(?:adPlacements|adSlots|playerAds)"\s*:/.test(text)) return text;
    const startedAt = performance.now();
    // Preserve the optional anti-XSSI prefix used by watch/playlist responses.
    const prefix = text.match(/^\s*\)\]\}'[^\r\n]*(?:\r?\n)/)?.[0] || "";
    const body = text.slice(prefix.length);
    if (!/^\s*[\[{]/.test(body)) return text;
    try {
      const value = parse(body);
      const removed = prune(value);
      if (!removed) return text;
      const result = prefix + stringify(value);
      record(removed, path, startedAt);
      return result;
    } catch { return text; }
  }

  function hookGlobal(name) {
    const descriptor = Object.getOwnPropertyDescriptor(window, name);
    if (descriptor && (!descriptor.configurable || descriptor.writable === false ||
        descriptor.get && !descriptor.set)) { stats.hookErrors++; return; }
    let value = descriptor?.value;
    const read = () => descriptor?.get ? Reflect.apply(descriptor.get, window, []) : value;
    Object.defineProperty(window, name, {
      configurable: true, enumerable: descriptor?.enumerable ?? true,
      get: read,
      set(next) {
        pruneObject(next, "initial");
        if (descriptor?.set) Reflect.apply(descriptor.set, window, [next]);
        else value = next;
      },
    });
    pruneObject(read(), "initial");
    stats.hooks.push(name);
  }

  for (const name of ["ytInitialPlayerResponse", "playerResponse"]) {
    try { hookGlobal(name); } catch { stats.hookErrors++; }
  }

  // Native fetch, Response identity, URL, headers, clone and body state stay intact.
  // Only consumption of responses from YouTube player endpoints is transformed.
  for (const method of ["json", "text"]) {
    try {
      const original = Response.prototype[method];
      if (typeof original !== "function") continue;
      const descriptor = Object.getOwnPropertyDescriptor(Response.prototype, method);
      Object.defineProperty(Response.prototype, method, { ...descriptor,
        value: function (...args) {
          const targeted = playerEndpoint(this.url);
          const result = Reflect.apply(original, this, args);
          return targeted ? result.then(value => method === "json"
            ? pruneObject(value, "fetch") : pruneText(value, "fetch")) : result;
        },
      });
      stats.hooks.push("Response." + method);
    } catch { stats.hookErrors++; }
  }

  for (const property of ["response", "responseText"]) {
    try {
      const prototype = XMLHttpRequest.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
      if (!descriptor?.get || !descriptor.configurable) continue;
      Object.defineProperty(prototype, property, { ...descriptor,
        get: function () {
          // Invoke the native getter first, preserving InvalidStateError behavior.
          const value = Reflect.apply(descriptor.get, this, []);
          if (this.readyState !== 4 || !playerEndpoint(this.responseURL)) return value;
          if (property === "response" && this.responseType === "json") {
            return pruneObject(value, "xhr");
          }
          if (typeof value !== "string") return value;
          const cached = xhrCache.get(this);
          if (cached?.original === value && cached.url === this.responseURL) return cached.result;
          const result = pruneText(value, "xhr");
          xhrCache.set(this, { original: value, result, url: this.responseURL });
          return result;
        },
      });
      stats.hooks.push("XHR." + property);
    } catch { stats.hookErrors++; }
  }

  window.youtubeAutoSkipPrevention = Object.freeze({ version: VERSION,
    getStats: () => ({ ...stats, hooks: [...stats.hooks] }) });
  publish();
  if (!document.documentElement) {
    const observer = new MutationObserver(() => {
      if (document.documentElement) { publish(); observer.disconnect(); }
    });
    observer.observe(document, { childList: true });
  }
})();

// YouTube's streamed get_watch reader calls JSON.parse for each complete frame,
// bypassing Response.json/text. Match that exact envelope after native parsing;
// ordinary JSON takes a constant-time check, with no text scan or second parse.
(() => {
  "use strict";
  const VERSION = "2.6.1";
  const marker = Symbol.for("youtube-auto-skip.streaming-prevention");
  if (window[marker]) return;
  const originalParse = JSON.parse;
  const TYPE = "STREAMING_WATCH_RESPONSE_TYPE_PLAYER_RESPONSE";
  const fields = ["adPlacements", "adSlots", "playerAds"];
  const stats = { version: VERSION, responsesPruned: 0, fieldsRemoved: 0,
    lastTransformMs: null, hookInstalled: false };
  function publish() {
    if (document.documentElement) {
      document.documentElement.dataset.youtubeAutoSkipStreamingStatus = JSON.stringify(stats);
    }
  }
  function guardedParse(text, reviver) {
    // Preserve native coercion, parse errors, reviver calls and their results.
    const value = Reflect.apply(originalParse, this, arguments);
    if (typeof text !== "string" || typeof reviver === "function" ||
        !value || typeof value !== "object" || !Object.hasOwn(value, "responseType") ||
        value.responseType !== TYPE || !Object.hasOwn(value, "playerResponse")) return value;
    const player = value.playerResponse;
    if (!player || typeof player !== "object" || Array.isArray(player) ||
        typeof player.videoDetails?.videoId !== "string" || !player.videoDetails.videoId ||
        !(player.playabilityStatus && typeof player.playabilityStatus === "object" ||
          player.streamingData && typeof player.streamingData === "object")) return value;
    const startedAt = performance.now();
    let removed = 0;
    for (const field of fields) {
      if (!Object.hasOwn(player, field)) continue;
      try { if (Reflect.deleteProperty(player, field)) removed++; } catch {}
    }
    if (removed) {
      stats.responsesPruned++;
      stats.fieldsRemoved += removed;
      stats.lastTransformMs = Number((performance.now() - startedAt).toFixed(2));
      publish();
    }
    return value;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(JSON, "parse");
    Object.defineProperty(JSON, "parse", { ...descriptor, value: guardedParse });
    window[marker] = VERSION;
    stats.hookInstalled = true;
  } catch {}
  window.youtubeAutoSkipStreamingPrevention = Object.freeze({ version: VERSION,
    getStats: () => ({ ...stats }) });
  publish();
  if (!document.documentElement) {
    const observer = new MutationObserver(() => {
      if (document.documentElement) { publish(); observer.disconnect(); }
    });
    observer.observe(document, { childList: true });
  }
})();
