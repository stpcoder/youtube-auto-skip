'use strict';
importScripts('general/rule-data.js', 'general/policy.js');
const generalPolicy = globalThis[Symbol.for('yas.general.policy')];
const popupAdHosts = new Set(globalThis[Symbol.for('yas.general.data')].popupHosts);
const createdPopupTabs = new Map();
let generalSettings = {}, generalSync = Promise.resolve();

function syncGeneralRules() {
  generalSync = generalSync.catch(() => {}).then(async () => {
    generalSettings = await chrome.storage.local.get({ globalEnabled: true, disabledSites: [] });
    const old = await chrome.declarativeNetRequest.getDynamicRules();
    const addRules = generalSettings.globalEnabled ? generalSettings.disabledSites.map((domain, i) => ({
      id: 1000000 + i, priority: 100000,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: [domain], resourceTypes: ['main_frame', 'sub_frame'] },
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
  if (area === 'local' && (changes.globalEnabled || changes.disabledSites)) syncGeneralRules();
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
  if (!generalPolicy.enabled(popup.sourceHost, generalSettings) || !generalPolicy.adUrl(url, url, popupAdHosts)) return;
  createdPopupTabs.delete(tabId);
  try { await chrome.tabs.remove(tabId); } catch { /* Already closed by the user. */ }
}
chrome.webNavigation.onCreatedNavigationTarget.addListener(async details => {
  const popup = { created: Date.now(), sourceHost: '', ready: null };
  createdPopupTabs.set(details.tabId, popup);
  if (createdPopupTabs.size > 256) createdPopupTabs.delete(createdPopupTabs.keys().next().value);
  popup.ready = (async () => {
    await generalSync;
    popup.sourceHost = tabHost(await chrome.tabs.get(details.sourceTabId));
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
  if (details.frameId === 0 && !generalPolicy.adUrl(details.url, details.url, popupAdHosts)) createdPopupTabs.delete(details.tabId);
});
chrome.tabs.onRemoved.addListener(tabId => createdPopupTabs.delete(tabId));
