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
      // Match known advertising campaigns, preserving normal provider pages.
      if (['pandalive.co.kr', 'www.pandalive.co.kr'].includes(url.hostname.toLowerCase()) &&
          /^\/evt\/heye\d+(?:&|\/|$)/i.test(url.pathname)) return true;
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
  function cosmeticPolicy(href, rules) {
    const result = { generic: true, specific: true, matched: 0 };
    let url;
    try { url = new URL(href); } catch { return result; }
    if (!supported(url)) return result;
    // Credentials are not part of a hostname anchor in filter syntax.
    url.username = ''; url.password = '';
    for (const rule of rules) {
      if (!domainRule(url.hostname, rule.domains)) continue;
      if (!new RegExp(rule.regex, rule.flags).test(url.href)) continue;
      result.matched++;
      if (rule.modes.includes('generic') || rule.modes.includes('all')) result.generic = false;
      if (rule.modes.includes('specific') || rule.modes.includes('all')) result.specific = false;
    }
    return result;
  }
  // Standalone test export; production bundles embed the value lexically.
  globalThis.__YAS_GENERAL_POLICY_V3__ = Object.freeze({ hostMatches, enabled, adUrl, domainRule, cosmeticPolicy });
})();
