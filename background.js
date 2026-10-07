"use strict";

// General filtering is independent of the existing YouTube debugger fallback.
if (typeof importScripts === "function") importScripts("general/background.js");

const PROTOCOL_VERSION = "1.3";
const activeClicks = new Map();
const elapsed = (since) => Math.round(performance.now() - since);
const unavailableTarget = (error) => /No (?:tab|target|document) with (?:given )?id|Debugger is not attached to (?:the )?tab|Detached while handling command|Receiving end does not exist|message port closed/i
  .test(String(error?.message || error));
const cancelledResponse = () => ({ ok: true, clicked: false, cancelled: true, reason: "target-unavailable" });

function reply(sendResponse, response) {
  // Closing/reloading the original tab can invalidate the reply channel.
  // Never let that transport error become an unhandled Promise rejection.
  try { sendResponse(response); } catch { /* The original document no longer receives responses. */ }
}

async function dispatchTrustedClick(sender, requestId) {
  const target = { tabId: sender.tab.id };
  const timings = {};
  const startedAt = performance.now();
  let attachedHere = false;
  let clicked = false;
  let cancelled = false;
  try {
    const attachAt = performance.now();
    try {
      await chrome.debugger.attach(target, PROTOCOL_VERSION);
      attachedHere = true;
    } catch (error) {
      if (String(error?.message).includes("Another debugger is already attached")) {
        throw new Error("YouTube 탭의 개발자 도구 또는 다른 디버거 연결을 닫은 뒤 다시 시도하세요.");
      }
      throw error;
    }
    timings.attachMs = elapsed(attachAt);

    const resolveAt = performance.now();
    const point = await chrome.tabs.sendMessage(target.tabId,
      { type: "RESOLVE_SKIP_BUTTON", requestId },
      sender.documentId ? { documentId: sender.documentId } : { frameId: 0 });
    timings.coordinatesMs = elapsed(resolveAt);
    if (point?.ok && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      const inputAt = performance.now();
      // A click needs press + release; mouseMoved adds an unnecessary round trip.
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mousePressed", x: point.x, y: point.y,
        button: "left", buttons: 1, clickCount: 1,
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mouseReleased", x: point.x, y: point.y,
        button: "left", buttons: 0, clickCount: 1,
      });
      timings.inputMs = elapsed(inputAt);
      clicked = true;
    }
  } finally {
    if (attachedHere) {
      const detachAt = performance.now();
      // Detach before replying. Surface errors instead of reporting false success.
      try {
        await chrome.debugger.detach(target);
      } catch (error) {
        // Chrome may already have detached because the tab closed or the user cancelled.
        if (!unavailableTarget(error)) throw error;
        cancelled = true;
      }
      timings.detachMs = elapsed(detachAt);
    }
  }
  timings.workerMs = elapsed(startedAt);
  return cancelled ? { ...cancelledResponse(), timings } : { ok: true, clicked, timings };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CLICK_SKIP_BUTTON" || !Number.isInteger(sender.tab?.id) ||
      sender.frameId !== 0 || !/^https:\/\/(www\.|m\.)?youtube\.com\//.test(sender.url || "")) {
    return false;
  }
  if (!Number.isInteger(message.requestId) || message.requestId < 1) {
    reply(sendResponse, { ok: false, error: "잘못된 클릭 요청" });
    return false;
  }
  const tabId = sender.tab.id;
  if (activeClicks.has(tabId)) {
    reply(sendResponse, { ok: false, error: "이미 클릭 처리 중입니다." });
    return false;
  }
  const operation = dispatchTrustedClick(sender, message.requestId);
  activeClicks.set(tabId, operation);
  const finish = (response) => {
    if (activeClicks.get(tabId) === operation) activeClicks.delete(tabId);
    reply(sendResponse, response);
  };
  operation.then(finish, (error) => finish(unavailableTarget(error)
    ? cancelledResponse() : { ok: false, error: String(error?.message || error) }));
  return true;
});
