(() => {
  const text = (key, substitutions = []) => chrome.i18n.getMessage(key, substitutions);
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.title = text('actionTitle');
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = text(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-aria]')) {
    element.setAttribute('aria-label', text(element.dataset.i18nAria));
  }
  const globalControl = document.getElementById('enabled'), siteControl = document.getElementById('site-enabled');
  const status = document.getElementById('status');
  let host = '', settings;
  async function refresh() {
    settings = await chrome.storage.local.get({ globalEnabled: true, disabledSites: [], generalError: null });
    globalControl.checked = settings.globalEnabled;
    const pausedParent = settings.disabledSites.find(d => host !== d && host.endsWith('.' + d));
    siteControl.checked = !pausedParent && !settings.disabledSites.includes(host);
    siteControl.disabled = !host || !settings.globalEnabled || !!pausedParent || /(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(host);
    status.textContent = settings.generalError ? text('rulesError', [settings.generalError]) : pausedParent ? text('parentPaused', [pausedParent]) : text('refreshHint');
  }
  globalControl.addEventListener('change', async () => {
    await chrome.storage.local.set({ globalEnabled: globalControl.checked }); await refresh();
  });
  siteControl.addEventListener('change', async () => {
    const sites = new Set(settings.disabledSites);
    if (siteControl.checked) sites.delete(host); else sites.add(host);
    await chrome.storage.local.set({ disabledSites: [...sites].slice(0,1000) }); await refresh();
  });
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try { const u = new URL(tab?.url); if (['http:', 'https:'].includes(u.protocol)) host = u.hostname; } catch {}
    document.getElementById('host').textContent = host || text('unsupportedPage');
    await refresh();
    const data = await (await fetch(chrome.runtime.getURL('filters/provenance.json'))).json();
    document.getElementById('rules').textContent = text('networkRules', [data.networkRules.toLocaleString(chrome.i18n.getUILanguage())]);
  })().catch(e => { status.textContent = text('settingsError', [e.message]); });
})();
