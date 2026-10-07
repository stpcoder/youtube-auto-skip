// Independent URL-scoped policy; AdGuard's prevent-window-open is the design reference.
(() => {
  const hostMatches = (host, domain) => host === domain || host.endsWith('.' + domain);
  const supported = url => ['http:', 'https:'].includes(url.protocol);
  function enabled(host, settings = {}) {
    return settings.globalEnabled !== false && !(settings.disabledSites || []).some(d => hostMatches(host, d));
  }
  function adUrl(value, base, hosts) {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value, base);
      if (!supported(url)) return false;
      let host = url.hostname.toLowerCase();
      while (host.includes('.')) {
        if (hosts.has(host)) return true;
        host = host.slice(host.indexOf('.') + 1);
      }
    } catch { /* Native navigation handles invalid URLs itself. */ }
    return false;
  }
  function domainRule(host, domains) {
    const positive = domains.filter(d => !d.startsWith('~'));
    return !domains.some(d => d.startsWith('~') && hostMatches(host, d.slice(1))) &&
      (!positive.length || positive.some(d => hostMatches(host, d)));
  }
  globalThis[Symbol.for('yas.general.policy')] = Object.freeze({ hostMatches, enabled, adUrl, domainRule });
})();
