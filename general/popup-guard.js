(() => {
  'use strict';
  const key = Symbol.for('yas.general.popup');
  if (window[key]) return;
  const policy = window[Symbol.for('yas.general.policy')];
  const hosts = new Set(window[Symbol.for('yas.general.data')].popupHosts);
  const nativeOpen = window.open;
  const stats = { version: '3.0.0', blockedOpen: 0, blockedLinks: 0, enabled: true };
  window[key] = stats;
  const publish = () => { if (document.documentElement) document.documentElement.dataset.yasPopupStatus = JSON.stringify(stats); };
  window.addEventListener('message', e => {
    if (e.source === window && e.data?.type === 'YAS_GENERAL_STATE' && typeof e.data.enabled === 'boolean') {
      stats.enabled = e.data.enabled; publish();
    }
  });
  window.open = function(...args) {
    if (stats.enabled && policy.adUrl(args[0], location.href, hosts)) {
      stats.blockedOpen++; publish(); return null;
    }
    // Do not coerce object arguments twice or alter target/features/return value.
    return Reflect.apply(nativeOpen, this, args);
  };
  document.addEventListener('click', event => {
    if (!stats.enabled || event.defaultPrevented) return;
    const anchor = event.target?.closest?.('a[href]');
    if (anchor && (anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey) &&
        policy.adUrl(anchor.href, location.href, hosts)) {
      event.preventDefault(); event.stopImmediatePropagation(); stats.blockedLinks++; publish();
    }
  }, true);
  publish();
})();
