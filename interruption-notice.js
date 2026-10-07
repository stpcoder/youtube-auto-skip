(() => {
  "use strict";

  // Visual filtering only: do not intercept onSnackbarMessage, reload media,
  // or remove notification nodes. YouTube reuses these nodes for other notices.
  const VERSION = "2.6.1";
  const KEY = Symbol.for("youtube-auto-skip.interruption-notice");
  if (window[KEY]) return;
  window[KEY] = VERSION;

  const RENDERERS = [
    "yt-notification-action-renderer",
    "ytd-notification-action-renderer",
    "ytm-notification-action-renderer",
  ].join(",");
  const MARKER = "data-youtube-auto-skip-interruption";
  const MESSAGES = new Set([
    "동영상 끊김 현상이 발생하나요?",
    "Experiencing interruptions?",
  ]);
  const stats = { version: VERSION, hiddenMatches: 0, restoredNotices: 0 };

  function publish() {
    if (document.documentElement) {
      document.documentElement.dataset.youtubeAutoSkipNoticeStatus = JSON.stringify(stats);
    }
  }

  function update(renderer) {
    if (!renderer.isConnected) return;
    // The actual YouTube toast's message is #text; button text is separate.
    // An unknown layout must remain visible, rather than matching all text.
    const message = renderer.querySelector("#text");
    const text = (message?.textContent || "").replace(/\s+/gu, " ").trim();
    const marked = renderer.getAttribute(MARKER) === "true";
    if (MESSAGES.has(text)) {
      if (!marked) {
        renderer.setAttribute(MARKER, "true");
        stats.hiddenMatches++;
      }
    } else if (marked) {
      renderer.removeAttribute(MARKER);
      stats.restoredNotices++;
    }
  }

  function collect(node, renderers, descendants) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    const parentRenderer = element?.closest(RENDERERS);
    if (parentRenderer) renderers.add(parentRenderer);
    if (descendants && node.querySelectorAll) {
      for (const renderer of node.querySelectorAll(RENDERERS)) renderers.add(renderer);
    }
  }

  const observer = new MutationObserver(records => {
    const renderers = new Set();
    for (const record of records) {
      collect(record.target, renderers, false);
      for (const node of record.addedNodes || []) collect(node, renderers, true);
    }
    for (const renderer of renderers) update(renderer);
    if (renderers.size || !document.documentElement?.dataset.youtubeAutoSkipNoticeStatus) publish();
  });
  // Child/text changes also cover SPA insertion, text-node edits and reuse.
  // No polling and no attribute observation of our own marker or diagnostics.
  observer.observe(document, { childList: true, characterData: true, subtree: true });
  const initial = new Set();
  collect(document, initial, true);
  for (const renderer of initial) update(renderer);
  publish();
})();
