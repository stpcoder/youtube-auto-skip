(() => {
  'use strict';
  const key = Symbol.for('yas.general.popup');
  if (window[key]) return;
  const policy = globalThis.__YAS_GENERAL_POLICY_V3__;
  const hosts = new Set(globalThis.__YAS_GENERAL_DATA_V3__.popupHosts);
  const popupMatch = policy.popupMatcher(globalThis.__YAS_GENERAL_POPUP_RULES_V3__ || [], hosts);
  const nativeOpen = window.open;
  // Wait for the isolated script's preferences; a paused site must stay paused during startup.
  const stats = { version: '3.0.4', blockedOpen: 0, blockedLinks: 0, enabled: false };
  window[key] = stats;
  const publish = () => { if (document.documentElement) document.documentElement.dataset.yasPopupStatus = JSON.stringify(stats); };
  window.addEventListener('message', e => {
    if (e.source === window && e.data?.type === 'YAS_GENERAL_STATE' && typeof e.data.enabled === 'boolean') {
      stats.enabled = e.data.enabled; publish();
    }
  });
  window.open = function(...args) {
    if (stats.enabled && popupMatch(args[0], location.href)) {
      stats.blockedOpen++; publish(); return null;
    }
    // Do not coerce object arguments twice or alter target/features/return value.
    return Reflect.apply(nativeOpen, this, args);
  };
  document.addEventListener('click', event => {
    if (!stats.enabled || event.defaultPrevented) return;
    const anchor = event.target?.closest?.('a[href]');
    if (anchor && (anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey) &&
        popupMatch(anchor.href, location.href)) {
      event.preventDefault(); event.stopImmediatePropagation(); stats.blockedLinks++; publish();
    }
  }, true);
  publish();
})();
