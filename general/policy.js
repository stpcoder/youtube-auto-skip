// Independent URL-scoped policy; AdGuard's prevent-window-open is the design reference.
(() => {
  const hostMatches = (host, domain) => host === domain || host.endsWith('.' + domain);
  const supported = url => ['http:', 'https:'].includes(url.protocol);
  function enabled(host, settings = {}) {
    return settings.globalEnabled !== false && !(settings.disabledSites || []).some(d => hostMatches(host, d));
  }
  const featureDefaults = Object.freeze({ providers: true, banners: true, popups: true });
  const validHost = host => typeof host === 'string' && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(host);
  function featurePreferences(host, settings = {}) {
    const result = { ...featureDefaults };
    const overrides = settings.siteFeatures && typeof settings.siteFeatures === 'object' ? settings.siteFeatures : {};
    for (const domain of Object.keys(overrides).filter(d => validHost(d) && hostMatches(host, d)).sort((a,b) => a.length-b.length)) {
      const values = overrides[domain];
      for (const key of Object.keys(result)) if (typeof values?.[key] === 'boolean') result[key] = values[key];
    }
    return result;
  }
  function features(host, settings = {}) {
    const result = featurePreferences(host, settings);
    if (!enabled(host, settings)) for (const key of Object.keys(result)) result[key] = false;
    return result;
  }
  function networkExceptions(settings = {}) {
    const domains = [...new Set([...(settings.disabledSites || []), ...Object.keys(settings.siteFeatures || {})])].filter(validHost);
    return domains.filter(d => !features(d, settings).providers).map(domain => ({
      domain,
      // A child can opt back in without undoing a parent's network exception.
      excluded: domains.filter(d => d !== domain && hostMatches(d, domain) && features(d, settings).providers),
    }));
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
  function popupMatcher(rules = [], hosts = new Set()) {
    // Compile lazily: ordinary page loads need not initialize thousands of regexes.
    let compiled;
    const cache = new Map();
    return (value, source) => {
      if (typeof value !== 'string') return false;
      let url, origin;
      try {
        url = new URL(value, source); origin = new URL(source);
        if (!supported(url) || !supported(origin)) return false;
        url.username = ''; url.password = '';
      } catch { return false; }
      const key = origin.hostname + ' ' + url.href;
      if (cache.has(key)) return cache.get(key);
      const remember = value => { if (cache.size >= 1024) cache.delete(cache.keys().next().value); cache.set(key, value); return value; };
      compiled ||= rules.map(r => ({ ...r, test: new RegExp(r.regex, r.flags) }));
      for (const rule of compiled) {
        if (!rule.exception) continue;
        if (!domainRule(origin.hostname, rule.domains) || !rule.test.test(url.href)) continue;
        return remember(false);
      }
      return remember(adUrl(url.href, origin.href, hosts) || compiled.some(rule => !rule.exception && domainRule(origin.hostname, rule.domains) && rule.test.test(url.href)));
    };
  }
  // Standalone test export; production bundles embed the value lexically.
  globalThis.__YAS_GENERAL_POLICY_V3__ = Object.freeze({ hostMatches, enabled, featurePreferences, features, networkExceptions, adUrl, domainRule, cosmeticPolicy, popupMatcher });
})();
