(() => {
  'use strict';
  let scheduled = false;
  const clicked = new WeakMap();
  const scan = () => {
    scheduled = false;
    for (const button of document.querySelectorAll('button.ytp-skip-ad-button,button.ytp-ad-skip-button,button.ytp-ad-skip-button-modern,.ytp-skip-ad > button,button.ytm-ad-skip-button')) {
      if (button.disabled || button.getAttribute('aria-disabled') === 'true' || button.closest('[hidden],[inert],[aria-hidden="true"]')) continue;
      if (Date.now() - (clicked.get(button) || 0) < 250) continue;
      if (button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden') { clicked.set(button, Date.now()); button.click(); }
    }
  };
  const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(scan); } };
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['disabled','aria-disabled','aria-hidden','class','hidden'] });
  document.addEventListener('yt-navigate-finish', schedule); schedule();
})();
