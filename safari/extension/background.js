'use strict';
const youtubeURL = value => /^https:\/\/(www\.|m\.)?youtube\.com\//.test(value || '');
let popupMatch;
const popupReady = typeof fetch === 'function' && browser.runtime.getURL ? Promise.all(['popup-rules.json', 'popup-hosts.json'].map(async file => {
  const response = await fetch(browser.runtime.getURL(file));
  if (!response.ok) throw Error('Focus 필터를 읽지 못했습니다.');
  return response.json();
})).then(([rules, hosts]) => { popupMatch = globalThis.__YAS_GENERAL_POLICY_V3__.popupMatcher(rules, new Set(hosts)); }) : Promise.resolve();
popupReady.catch(() => {});
let rulesReady = Promise.resolve();
function syncRules() {
  rulesReady = rulesReady.catch(() => {}).then(async () => {
    const settings = await browser.storage.local.get({ globalEnabled: true, disabledSites: [], siteFeatures: {} });
    const old = await browser.declarativeNetRequest.getDynamicRules();
    // Safari supports allowAllRequests for main_frame only. Never block navigation.
    const exceptions = globalThis.__YAS_GENERAL_POLICY_V3__.networkExceptions(settings);
    if (exceptions.length > 500) throw Error('사이트별 예외가 너무 많습니다.');
    const addRules = settings.globalEnabled ? exceptions.map(({domain, excluded}, i) => ({
      id: 1000000 + i, priority: 1000000, action: { type: 'allowAllRequests' },
      condition: { requestDomains: [domain], ...(excluded.length ? { excludedRequestDomains: excluded } : {}), resourceTypes: ['main_frame'] },
    })) : [];
    await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.filter(r => r.id >= 1000000 && r.id < 1000500).map(r => r.id), addRules });
    await browser.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: settings.globalEnabled ? ['general_ads'] : [], disableRulesetIds: settings.globalEnabled ? [] : ['general_ads'] });
    await browser.storage.local.remove('generalError');
  }).catch(error => browser.storage.local.set({ generalError: String(error.message || error) }));
  return rulesReady;
}
browser.runtime.onInstalled.addListener(syncRules);
browser.runtime.onStartup.addListener(syncRules);
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.globalEnabled || changes.disabledSites || changes.siteFeatures) syncRules();
  // Relay preferences: Safari content scripts don't always receive storage.onChanged.
  browser.tabs.query({}).then(tabs => Promise.all(tabs.map(t => browser.tabs.sendMessage(t.id, { type: 'YAS_SETTINGS_CHANGED' }).catch(() => {})))).catch(() => {});
});
syncRules();
browser.runtime.onMessage.addListener((message, sender) => {
  const page = sender.url || sender.tab?.url || '';
  if (message?.type === 'FOCUS_SITE_FEATURES' && sender.id === browser.runtime.id && !sender.tab && typeof message.host === 'string' && message.host.length <= 253) {
    return browser.storage.local.get({ globalEnabled: true, disabledSites: [], siteFeatures: {} }).then(settings => globalThis.__YAS_GENERAL_POLICY_V3__.featurePreferences(message.host, settings));
  }
  if (message?.type === 'YAS_SYNC_RULES' && sender.id === browser.runtime.id) return syncRules().then(() => ({ ok: true }));
  if (message?.type === 'FOCUS_SHOW_PLAYBACK' && sender.id === browser.runtime.id && !sender.tab) {
    return browser.tabs.query({ active: true, currentWindow: true }).then(async tabs => {
      const tab = tabs[0];
      if (!Number.isInteger(tab?.id) || !youtubeURL(tab.url)) return { ok: false, error: '먼저 YouTube 영상을 열어 주세요.' };
      try {
        await browser.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['youtube-main.js'] });
        const result = await browser.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => {
          document.dispatchEvent(new Event('focus-show-playback'));
          return { ok: !!document.getElementById('yas-safari-tools') };
        } });
        return result[0]?.result?.ok ? { ok: true } : { ok: false, error: '본영상을 재생한 뒤 다시 열어 주세요.' };
      } catch(e) { return { ok: false, error: String(e.message || e) }; }
    });
  }
  if (message?.type === 'YAS_DIAGNOSE' && sender.id === browser.runtime.id && !sender.tab) {
    return browser.tabs.query({ active: true, currentWindow: true }).then(async tabs => {
      const tab = tabs[0];
      if (!Number.isInteger(tab?.id) || !/^https?:\/\//.test(tab.url || '')) return { error: '웹사이트에서 사용하세요. 사이트 접근 권한도 확인하세요.' };
      try {
        if (youtubeURL(tab.url)) await browser.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['youtube-main.js'] });
        const results = await browser.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => ({
          bootstrap: JSON.parse(document.documentElement?.dataset.yasSafariBootstrapStatus || 'null'),
          startup: JSON.parse(document.documentElement?.dataset.yasSafariStartupStatus || 'null'),
          media: JSON.parse(document.documentElement?.dataset.yasSafariMediaStatus || 'null'),
          prevention: JSON.parse(document.documentElement?.dataset.youtubeAutoSkipPreventionStatus || 'null'),
          recovery: JSON.parse(document.documentElement?.dataset.youtubeAutoSkipRecoveryStatus || 'null'),
          antiAdblock: JSON.parse(document.documentElement?.dataset.youtubeAutoSkipAntiAdblockStatus || 'null'),
          skip: JSON.parse(document.documentElement?.dataset.youtubeAutoSkipEarlyStatus || 'null'),
          streaming: JSON.parse(document.documentElement?.dataset.youtubeAutoSkipStreamingStatus || 'null'),
          panel: !!document.getElementById('yas-safari-tools'),
          videos: document.querySelectorAll('video').length,
          playback: [...document.querySelectorAll('video')].map(v => ({
            currentTime: Math.round(v.currentTime * 1000) / 1000,
            duration: Number.isFinite(v.duration) ? v.duration : null,
            paused: v.paused, muted: v.muted, volume: v.volume, readyState: v.readyState,
            networkState: v.networkState, bufferedRanges: v.buffered.length,
            videoWidth: v.videoWidth, videoHeight: v.videoHeight, sourcePresent: !!v.currentSrc,
            presentationMode: v.webkitPresentationMode || null,
          })),
          general: JSON.parse(document.documentElement?.dataset.yasGeneralStatus || 'null'),
          popup: JSON.parse(document.documentElement?.dataset.yasPopupStatus || 'null'),
          // Redacted structural evidence: no page text, cookies or query values.
          adCandidates: [...document.querySelectorAll('a[href]:has(img), iframe')].map(node => {
            const box = node.getBoundingClientRect();
            const url = value => { try { const u = new URL(value, location.href); return { origin: u.origin, path: u.pathname, queryKeys: [...u.searchParams.keys()] }; } catch { return null; } };
            return { tag: node.tagName, id: node.id, className: node.className, visible: box.width > 0 && box.height > 0,
              top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height), target: node.target || null,
              url: url(node.href || node.src), parent: { tag: node.parentElement?.tagName, id: node.parentElement?.id, className: node.parentElement?.className } };
          }).filter(node => node.visible && node.top < innerHeight * 2).slice(0, 24),
        }) });
        const result = results[0]?.result;
        if (!result) return { error: '페이지 진단 결과가 없습니다.' };
        result.youtube = youtubeURL(tab.url);
        result.networkEnabled = (await browser.declarativeNetRequest.getEnabledRulesets()).includes('general_ads');
        return result;
      } catch(e) { return { error: String(e.message || e) }; }
    });
  }
  if (!Number.isInteger(sender.tab?.id) || !/^https?:\/\//.test(page)) return false;
  if (message?.type === 'YAS_FRAME_CONTEXT') {
    let host; try { host = new URL(sender.tab.url || page).hostname; } catch {}
    return Promise.resolve({ host });
  }
  if (message?.type === 'YAS_AD_CANDIDATES' && sender.id === browser.runtime.id && Array.isArray(message.urls) && message.urls.length <= 300 && message.urls.every(u => typeof u === 'string' && u.length <= 4096)) {
    return popupReady.then(async () => {
      const settings = await browser.storage.local.get({ globalEnabled: true, disabledSites: [], siteFeatures: {} });
      const topHost = new URL(sender.tab.url || page).hostname;
      if (!popupMatch || !globalThis.__YAS_GENERAL_POLICY_V3__.features(topHost, settings).banners) return { matches: [] };
      return { matches: message.urls.filter(url => popupMatch(url, page)) };
    }).catch(error => ({ matches: [], error: String(error.message || error) }));
  }
  if (message?.type === 'YAS_GENERAL_CSS' && !youtubeURL(page) && typeof message.css === 'string' && message.css.length <= 2000000 && typeof message.remove === 'boolean') {
    const details = { target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, css: message.css, origin: 'USER' };
    return (message.remove ? browser.scripting.removeCSS(details) : browser.scripting.insertCSS(details)).then(() => ({ ok: true }), e => ({ ok: false, error: String(e.message || e) }));
  }
  const youtube = message?.type === 'YAS_SAFARI_INIT' && sender.frameId === 0 && youtubeURL(page);
  const general = message?.type === 'YAS_GENERAL_INIT' && !youtubeURL(page);
  if (!youtube && !general) return false;
  if (youtube) {
    return browser.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, world: 'MAIN', injectImmediately: true,
      func: () => !!window[Symbol.for('youtube-auto-skip.safari-startup')] && !!window.youtubeAutoSkipBufferingRecovery && !!window.youtubeAutoSkip,
    }).then(async result => {
      if (result?.[0]?.result === true) return { ok: true, source: 'document-start' };
      await browser.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, world: 'MAIN', injectImmediately: true, files: ['youtube-main.js'] });
      return { ok: true, source: 'background-fallback' };
    }).catch(e => ({ ok: false, error: String(e.message || e) }));
  }
  const files = ['general-main.js'];
  return browser.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, world: 'MAIN', injectImmediately: true, files })
    .then(() => ({ ok: true }), e => ({ ok: false, error: String(e.message || e) }));
});

// Safari may open an empty tab first and navigate it afterward. Track only tabs
// with a real opener; never close an unrelated tab or a normal login destination.
const pendingPopups = new Map();
async function inspectPopup(id, url) {
  const candidate = pendingPopups.get(id);
  if (!candidate || Date.now() - candidate.created > 10000) { pendingPopups.delete(id); return; }
  try {
    await popupReady;
    const source = await browser.tabs.get(candidate.opener);
    const settings = await browser.storage.local.get({ globalEnabled: true, disabledSites: [], siteFeatures: {} });
    if (pendingPopups.get(id) !== candidate || !source.url || !popupMatch) return;
    if (globalThis.__YAS_GENERAL_POLICY_V3__.features(new URL(source.url).hostname, settings).popups && popupMatch(url, source.url)) {
      pendingPopups.delete(id); await browser.tabs.remove(id);
    }
  } catch { /* Missing site access or unsupported tab APIs must not affect navigation. */ }
}
browser.tabs?.onCreated?.addListener(tab => {
  if (!Number.isInteger(tab.openerTabId) || !Number.isInteger(tab.id)) return;
  if (pendingPopups.size >= 256) pendingPopups.delete(pendingPopups.keys().next().value);
  const candidate = { opener: tab.openerTabId, created: Date.now() };
  pendingPopups.set(tab.id, candidate);
  inspectPopup(tab.id, tab.url || '').catch(() => {});
  setTimeout(() => { if (pendingPopups.get(tab.id) === candidate) pendingPopups.delete(tab.id); }, 10000);
});
browser.tabs?.onUpdated?.addListener((id, change, tab) => {
  if (!pendingPopups.has(id)) return;
  const url = change.url || tab.url || '';
  inspectPopup(id, url).then(() => {
    if (change.status === 'complete' && /^https?:\/\//.test(url)) pendingPopups.delete(id);
  }).catch(() => {});
});
browser.tabs?.onRemoved?.addListener(id => pendingPopups.delete(id));
