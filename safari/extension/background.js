browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'YAS_SAFARI_INIT' || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) ||
      !/^https:\/\/(www\.|m\.)?youtube\.com\//.test(sender.url || sender.tab.url || '')) return false;
  // Safari ignores content_scripts.world; use its supported scripting API instead.
  return browser.scripting.executeScript({
    target: { tabId: sender.tab.id, frameIds: [0] }, world: 'MAIN', injectImmediately: true,
    files: ['media-core.js','controls.js','anti-adblock.js','prevention.js','buffering-recovery.js','early.js'],
  }).then(() => ({ ok: true }), () => ({ ok: false, error: 'Safari 페이지 스크립트를 실행하지 못했습니다.' }));
});
