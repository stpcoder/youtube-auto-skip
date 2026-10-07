(() => {
  'use strict';
  const policy = globalThis.__YAS_GENERAL_POLICY_V3__;
  const cosmeticPolicies = globalThis.__YAS_COSMETIC_POLICY_V3__ || [];
  const host = location.hostname;
  const customSelectors = [
    '.floating-mtop-banner:has(#floating_mtop a[href^="https://www.pandalive.co.kr/evt/"])',
    '[id^="enter_"]:has(> iframe[src^="//ad.ad4989.co.kr/"])',
    '[id^="enter_"]:has(> iframe[src^="https://ad.ad4989.co.kr/"])',
    '[id^="enter_"]:has(> iframe[src^="http://ad.ad4989.co.kr/"])',
  ];
  let css = '', inserted = '', topHost = host, pending = Promise.resolve();
  const stats = { version: '3.0.4', enabled: true, ready: false, applied: false, selectors: 0, siteSelectors: 0, mode: 'general', genericAllowed: true, specificAllowed: true, matchedExceptions: 0, skippedSelectors: 0, unsupportedSelectors: 0, error: null };
  const publish = () => { if (document.documentElement) document.documentElement.dataset.yasGeneralStatus = JSON.stringify(stats); };
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id === chrome.runtime.id && message?.type === 'YAS_GENERAL_STATUS') reply({ ...stats, host });
    return false;
  });
  if (!policy) { stats.error = '공통 광고 정책이 연결되지 않았습니다. 확장과 페이지를 새로고침해 주세요.'; publish(); return; }
  async function update() {
    const settings = await chrome.storage.local.get({ globalEnabled: true, disabledSites: [] });
    stats.enabled = policy.enabled(topHost, settings);
    window.postMessage({ type: 'YAS_GENERAL_STATE', enabled: stats.enabled }, '*');
    const desired = stats.enabled ? css : '';
    if (inserted !== desired) {
      if (inserted) {
        const result = await chrome.runtime.sendMessage({ type: 'YAS_GENERAL_CSS', css: inserted, remove: true });
        if (!result?.ok) throw Error(result?.error || '스타일 해제 실패');
        inserted = '';
      }
      if (desired) {
        const result = await chrome.runtime.sendMessage({ type: 'YAS_GENERAL_CSS', css: desired, remove: false });
        if (!result?.ok) throw Error(result?.error || '스타일 적용 실패');
        inserted = desired;
      }
    }
    stats.applied = !!inserted;
    stats.error = null; publish();
  }
  const schedule = () => { pending = pending.catch(() => {}).then(update).catch(e => { stats.error = String(e.message || e); publish(); }); };
  chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') schedule(); });
  (async () => {
    const context = await chrome.runtime.sendMessage({ type: 'YAS_FRAME_CONTEXT' });
    topHost = context?.host || host;
    schedule(); // Publish popup preferences before the larger cosmetic file finishes loading.
    const matchedSites = (globalThis.__YAS_GENERAL_SITE_RULES_V3__ || []).filter(r => policy.domainRule(host, r.domains));
    const cosmeticOnly = matchedSites.some(r => r.cosmeticOnly);
    stats.mode = cosmeticOnly ? 'site-only' : 'general';
    const hidePolicy = policy.cosmeticPolicy(location.href, cosmeticPolicies);
    stats.genericAllowed = hidePolicy.generic;
    stats.specificAllowed = hidePolicy.specific;
    stats.matchedExceptions = hidePolicy.matched;
    let rules = [];
    if (!cosmeticOnly) {
      const response = await fetch(chrome.runtime.getURL('filters/cosmetic.json'));
      if (!response.ok) throw Error('필터를 읽지 못했습니다.');
      rules = (await response.json()).filter(r => policy.domainRule(host, r.domains));
    }
    const exceptions = new Set(rules.filter(r => r.exception).map(r => r.selector));
    const siteSelectors = hidePolicy.specific ? matchedSites.flatMap(r => r.selectors) : [];
    stats.siteSelectors = siteSelectors.length;
    const selectedRules = rules.filter(r => {
      if (r.exception || exceptions.has(r.selector)) return false;
      const specific = r.domains.some(d => !d.startsWith('~'));
      const allowed = specific ? hidePolicy.specific : hidePolicy.generic;
      if (!allowed) stats.skippedSelectors++;
      return allowed;
    });
    // Exact built-in ad-provider/campaign rules are not ambiguous generic class
    // names. Keep them with generichide; elemhide disables them as well.
    const explicit = hidePolicy.generic || hidePolicy.specific ? customSelectors : [];
    const selectors = new Set([...explicit, ...siteSelectors, ...selectedRules.map(r => r.selector)].filter(s => !exceptions.has(s)));
    const valid = [];
    for (const selector of selectors) {
      if (CSS.supports(`selector(${selector})`)) valid.push(selector); else stats.unsupportedSelectors++;
    }
    stats.selectors = valid.length;
    // Individual rules keep a bad selector from invalidating every other rule.
    css = valid.map(s => `${s}{display:none!important}`).join('\n');
    stats.ready = true;
    schedule();
  })().catch(e => { stats.error = String(e.message || e); publish(); });
})();
