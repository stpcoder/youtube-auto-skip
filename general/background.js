'use strict';
importScripts('general/rule-data.js', 'general/policy.js');
const generalPolicy = globalThis.__YAS_GENERAL_POLICY_V3__;
const popupAdHosts = new Set(globalThis.__YAS_GENERAL_DATA_V3__.popupHosts);
const popupMatch = generalPolicy.popupMatcher(globalThis.__YAS_GENERAL_POPUP_RULES_V3__ || [], popupAdHosts);
const createdPopupTabs = new Map();
let generalSettings = { globalEnabled: false, disabledSites: [] }, generalSync = Promise.resolve();

function syncGeneralRules() {
  generalSync = generalSync.catch(() => {}).then(async () => {
    generalSettings = await chrome.storage.local.get({ globalEnabled: true, disabledSites: [], siteFeatures: {} });
    const old = await chrome.declarativeNetRequest.getDynamicRules();
    const exceptions = generalPolicy.networkExceptions(generalSettings);
    if (exceptions.length > 500) throw Error('Too many site exceptions');
    const addRules = generalSettings.globalEnabled ? exceptions.map(({domain, excluded}, i) => ({
      id: 1000000 + i, priority: 100000,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: [domain], ...(excluded.length ? { excludedRequestDomains: excluded } : {}), resourceTypes: ['main_frame', 'sub_frame'] },
    })) : [];
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.filter(r => r.id >= 1000000 && r.id < 1001000).map(r => r.id), addRules });
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: generalSettings.globalEnabled ? ['general_ads'] : [],
      disableRulesetIds: generalSettings.globalEnabled ? [] : ['general_ads'],
    });
    await chrome.storage.local.remove('generalError');
  }).catch(async error => {
    await chrome.storage.local.set({ generalError: String(error.message || error) });
  });
  return generalSync;
}
chrome.runtime.onInstalled.addListener(syncGeneralRules);
chrome.runtime.onStartup.addListener(syncGeneralRules);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.globalEnabled || changes.disabledSites || changes.siteFeatures)) syncGeneralRules();
});
syncGeneralRules();

function tabHost(tab) {
  try { return new URL(tab.url).hostname; } catch { return ''; }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id) ||
      !/^https?:\/\//.test(sender.url || '')) return false;
  if (message?.type === 'YAS_FRAME_CONTEXT') {
    reply({ host: tabHost(sender.tab) }); return false;
  }
  if (message?.type === 'YAS_AD_CANDIDATES' && Array.isArray(message.urls) && message.urls.length <= 300 && message.urls.every(u => typeof u === 'string' && u.length <= 4096)) {
    generalSync.then(() => reply({ matches: generalPolicy.features(tabHost(sender.tab), generalSettings).banners ? message.urls.filter(url => popupMatch(url, sender.url)) : [] })).catch(() => reply({ matches: [] }));
    return true;
  }
  if (message?.type !== 'YAS_GENERAL_CSS' || typeof message.css !== 'string' ||
      message.css.length > 2000000 || typeof message.remove !== 'boolean') return false;
  const details = { target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, css: message.css, origin: 'USER' };
  const operation = message.remove ? chrome.scripting.removeCSS(details) : chrome.scripting.insertCSS(details);
  operation.then(() => reply({ ok: true }), e => reply({ ok: false, error: String(e.message || e) }));
  return true;
});

async function closeAdPopup(tabId, url) {
  const popup = createdPopupTabs.get(tabId);
  if (!popup || Date.now() - popup.created > 10000) { createdPopupTabs.delete(tabId); return; }
  await popup.ready;
  await generalSync;
  if (createdPopupTabs.get(tabId) !== popup) return;
  if (!generalPolicy.features(popup.sourceHost, generalSettings).popups || !popupMatch(url, popup.sourceURL)) return;
  createdPopupTabs.delete(tabId);
  try { await chrome.tabs.remove(tabId); } catch { /* Already closed by the user. */ }
}
chrome.webNavigation.onCreatedNavigationTarget.addListener(async details => {
  const popup = { created: Date.now(), sourceHost: '', sourceURL: '', ready: null };
  createdPopupTabs.set(details.tabId, popup);
  if (createdPopupTabs.size > 256) createdPopupTabs.delete(createdPopupTabs.keys().next().value);
  popup.ready = (async () => {
    await generalSync;
    const source = await chrome.tabs.get(details.sourceTabId);
    popup.sourceHost = tabHost(source); popup.sourceURL = source.url;
  })();
  try {
    await popup.ready;
    await closeAdPopup(details.tabId, details.url);
    setTimeout(() => { if (createdPopupTabs.get(details.tabId) === popup) createdPopupTabs.delete(details.tabId); }, 10000);
  } catch { if (createdPopupTabs.get(details.tabId) === popup) createdPopupTabs.delete(details.tabId); }
});
chrome.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId === 0 && createdPopupTabs.has(details.tabId)) closeAdPopup(details.tabId, details.url).catch(() => createdPopupTabs.delete(details.tabId));
});
chrome.webNavigation.onCommitted.addListener(details => {
  // Once a legitimate destination is loaded, never close that tab later.
  const popup = createdPopupTabs.get(details.tabId);
  if (details.frameId === 0 && popup) popup.ready.then(() => {
    if (createdPopupTabs.get(details.tabId) === popup && !popupMatch(details.url, popup.sourceURL)) createdPopupTabs.delete(details.tabId);
  }).catch(() => createdPopupTabs.delete(details.tabId));
});
chrome.tabs.onRemoved.addListener(tabId => createdPopupTabs.delete(tabId));
