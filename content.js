(() => {
  "use strict";

  const VERSION = "2.6.1";
  const SKIP_SELECTOR = [
    ".ytp-skip-ad-button", ".ytp-skip-ad > button",
    ".ytp-ad-skip-button", ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-slot button", ".ytp-skip-ad-button__text",
  ].join(",");
  const DOM_CLICK_GRACE_MS = 80;
  const TRUSTED_RETRY_MS = 250;
  const ERROR_BACKOFF_MS = 2000;
  let currentButton = null;
  let pendingClick = null;
  let requestSequence = 0;
  let scanScheduled = false;
  let pollTimer;
  let player;

  function findClickTarget(element) {
    return element.closest("button, [role='button']") || element;
  }

  function getClickPoint(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected ||
        element.matches(":disabled") ||
        element.closest("[hidden], [inert], [aria-hidden='true'], [aria-disabled='true']")) {
      return null;
    }
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return null;
    }
    if (getComputedStyle(element).pointerEvents === "none") return null;
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(innerWidth, rect.right);
    const bottom = Math.min(innerHeight, rect.bottom);
    if (right - left <= 4 || bottom - top <= 4) return null;
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    return hit && element.contains(hit) ? { x, y } : null;
  }

  function findCurrentSkipButton() {
    for (const candidate of (player || document).querySelectorAll(SKIP_SELECTOR)) {
      const target = findClickTarget(candidate);
      if (getClickPoint(target)) return target;
    }
    return null;
  }

  function report(result) {
    document.documentElement.dataset.youtubeAutoSkipLastResult = JSON.stringify(result);
    console.info("[YouTube Auto Skip]", result);
  }

  function requestTrustedClick(state) {
    const requestId = ++requestSequence;
    const requestedAt = performance.now();
    pendingClick = { requestId, state };
    state.nextTrustedAt = requestedAt + TRUSTED_RETRY_MS;
    try {
      chrome.runtime.sendMessage({ type: "CLICK_SKIP_BUTTON", requestId }, (response) => {
        const error = chrome.runtime.lastError?.message || response?.error;
        pendingClick = null;
        if (error) {
          state.nextTrustedAt = performance.now() + ERROR_BACKOFF_MS;
          console.warn("[YouTube Auto Skip] 실제 클릭 실패:", error);
        } else {
          report({
            path: "trusted",
            clicked: response?.clicked === true,
            cancelled: response?.cancelled === true,
            ...(response?.reason ? { reason: response.reason } : {}),
            detectionToResponseMs: Math.round(performance.now() - state.detectedAt),
            requestMs: Math.round(performance.now() - requestedAt),
            ...response?.timings,
          });
        }
        scheduleScan();
      });
    } catch (error) {
      pendingClick = null;
      state.nextTrustedAt = performance.now() + ERROR_BACKOFF_MS;
      console.warn("[YouTube Auto Skip] 확장 프로그램과 YouTube 탭을 새로고침하세요.", error.message);
    }
  }

  function clickSkipButton() {
    const target = findCurrentSkipButton();
    if (currentButton && currentButton.target !== target) {
      if (!currentButton.trustedAttempted) {
        report({ path: "dom", buttonCleared: true,
          detectionToClearMs: Math.round(performance.now() - currentButton.detectedAt) });
      }
      currentButton = null;
    }
    if (target && !currentButton) {
      const now = performance.now();
      const earlyAge = Date.now() - Number(target.dataset.youtubeAutoSkipEarlyAt || 0);
      const earlyClicked = earlyAge >= 0 && earlyAge < 250;
      const grace = earlyClicked ? Math.max(0, DOM_CLICK_GRACE_MS - earlyAge) : DOM_CLICK_GRACE_MS;
      currentButton = { target, detectedAt: now, nextTrustedAt: now + grace,
        trustedAttempted: false };
      // No worker wake-up, debugger attachment, or Chrome banner on this path.
      try {
        if (!earlyClicked) target.click();
      } catch (error) {
        console.warn("[YouTube Auto Skip] 페이지 클릭 실패:", error.message);
      }
      setTimeout(scheduleScan, grace);
    } else if (target && !pendingClick && performance.now() >= currentButton.nextTrustedAt) {
      currentButton.trustedAttempted = true;
      requestTrustedClick(currentButton);
    }
    clearTimeout(pollTimer);
    const adActive = currentButton || player?.matches(".ad-showing, .ad-interrupting");
    pollTimer = setTimeout(scheduleScan, adActive ? 50 : 1000);
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    queueMicrotask(() => {
      scanScheduled = false;
      clickSkipButton();
    });
  }

  // Re-read after attach: Chrome's infobar can move the player.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "RESOLVE_SKIP_BUTTON") return false;
    const attempt = pendingClick;
    const point = attempt?.requestId === message.requestId &&
      currentButton === attempt.state &&
      findCurrentSkipButton() === attempt.state.target
      ? getClickPoint(attempt.state.target) : null;
    sendResponse(point ? { ok: true, ...point } : { ok: false });
    return false;
  });

  const playerObserver = new MutationObserver(scheduleScan);
  function bindPlayer() {
    const nextPlayer = document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player") || document.querySelector("#player");
    if (nextPlayer === player) return;
    playerObserver.disconnect();
    player = nextPlayer;
    currentButton = null;
    playerObserver.observe(player || document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["class", "style", "disabled", "aria-disabled", "hidden", "inert", "aria-hidden"],
    });
    scheduleScan();
  }

  function start() {
    if (!document.documentElement) {
      setTimeout(start, 10);
      return;
    }
    document.documentElement.dataset.youtubeAutoSkipVersion = VERSION;
    console.info("[YouTube Auto Skip] v" + VERSION + " 실행 중");
    // Only discovery observes the whole page; attribute scans stay in the player.
    new MutationObserver(bindPlayer).observe(document.documentElement, {
      childList: true, subtree: true,
    });
    bindPlayer();
    scheduleScan();
    document.addEventListener("yt-navigate-finish", () => {
      currentButton = null;
      bindPlayer();
      scheduleScan();
    });
    document.addEventListener("visibilitychange", scheduleScan);
    window.addEventListener("resize", scheduleScan);
  }

  start();
})();
