(() => {
  'use strict';
  const policy = globalThis[Symbol.for('yas.general.policy')];
  const host = location.hostname;
  const customSelectors = [
    '.floating-mtop-banner:has(#floating_mtop a[href^="https://www.pandalive.co.kr/evt/"])',
    '[id^="enter_"]:has(> iframe[src^="//ad.ad4989.co.kr/"])',
    '[id^="enter_"]:has(> iframe[src^="https://ad.ad4989.co.kr/"])',
    '[id^="enter_"]:has(> iframe[src^="http://ad.ad4989.co.kr/"])',
  ];
  let css = '', inserted = '', topHost = host, pending = Promise.resolve();
  const stats = { version: '3.0.0', enabled: true, selectors: 0, unsupportedSelectors: 0, error: null };
  const publish = () => { if (document.documentElement) document.documentElement.dataset.yasGeneralStatus = JSON.stringify(stats); };
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
    stats.error = null; publish();
  }
  const schedule = () => { pending = pending.catch(() => {}).then(update).catch(e => { stats.error = String(e.message || e); publish(); }); };
  chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') schedule(); });
  (async () => {
    const context = await chrome.runtime.sendMessage({ type: 'YAS_FRAME_CONTEXT' });
    topHost = context?.host || host;
    const response = await fetch(chrome.runtime.getURL('filters/cosmetic.json'));
    if (!response.ok) throw Error('필터를 읽지 못했습니다.');
    const rules = (await response.json()).filter(r => policy.domainRule(host, r.domains));
    const exceptions = new Set(rules.filter(r => r.exception).map(r => r.selector));
    const selectors = new Set([...customSelectors, ...rules.filter(r => !r.exception && !exceptions.has(r.selector)).map(r => r.selector)]);
    const valid = [];
    for (const selector of selectors) {
      if (CSS.supports(`selector(${selector})`)) valid.push(selector); else stats.unsupportedSelectors++;
    }
    stats.selectors = valid.length;
    // Individual rules keep a bad selector from invalidating every other rule.
    css = valid.map(s => `${s}{display:none!important}`).join('\n');
    schedule();
  })().catch(e => { stats.error = String(e.message || e); publish(); });
})();
