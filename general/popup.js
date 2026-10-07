(() => {
  const language = chrome.i18n.getUILanguage();
  const text = (key, substitutions = []) => chrome.i18n.getMessage(key, substitutions.map(String));
  const number = value => Number(value).toLocaleString(language);
  document.documentElement.lang = language;
  document.title = text('actionTitle');
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = text(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-aria]')) element.setAttribute('aria-label', text(element.dataset.i18nAria));
  const globalControl = document.getElementById('enabled'), siteControl = document.getElementById('site-enabled');
  const status = document.getElementById('status'), pageState = document.getElementById('page-state'), reload = document.getElementById('reload-page');
  let host = '', settings, tab;
  const youtube = () => /(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(host);
  const reportError = e => { status.textContent = text('applyError', [e.message || e]); };
  async function checkPage() {
    pageState.dataset.error = 'false';
    if (!host) { pageState.textContent = text('webPageOnly'); return; }
    if (youtube()) { pageState.textContent = text('youtubePage'); return; }
    if (!settings.globalEnabled || !siteControl.checked) { pageState.textContent = text('siteOff'); return; }
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'YAS_GENERAL_STATUS' }, { frameId: 0 });
      if (!result) throw Error(text('noFilterResponse'));
      if (result.error) { pageState.dataset.error = 'true'; pageState.textContent = text('pageFilterError', [result.error]); }
      else if (result.ready) pageState.textContent = result.mode === 'site-only'
        ? text('siteOnly')
        : result.matchedExceptions
          ? text('exceptionsApplied', [number(result.selectors)])
          : result.applied
            ? text('pageFiltersApplied', [number(result.selectors)])
            : text('noPageRules');
      else pageState.textContent = text('filtersPreparing');
    } catch {
      pageState.dataset.error = 'true';
      pageState.textContent = text('pageNeedsReload');
    }
  }
  async function refresh() {
    settings = await chrome.storage.local.get({ globalEnabled: true, disabledSites: [], generalError: null });
    globalControl.checked = settings.globalEnabled;
    const pausedParent = settings.disabledSites.find(d => host !== d && host.endsWith('.' + d));
    siteControl.checked = !pausedParent && !settings.disabledSites.includes(host);
    siteControl.disabled = !host || !settings.globalEnabled || !!pausedParent || youtube();
    status.textContent = settings.generalError ? text('rulesError', [settings.generalError]) : pausedParent ? text('parentPaused', [pausedParent]) : text('refreshHint');
    await checkPage();
  }
  globalControl.addEventListener('change', () => chrome.storage.local.set({ globalEnabled: globalControl.checked }).then(refresh).catch(reportError));
  siteControl.addEventListener('change', () => {
    const sites = new Set(settings.disabledSites);
    if (siteControl.checked) sites.delete(host); else sites.add(host);
    chrome.storage.local.set({ disabledSites: [...sites].slice(0,1000) }).then(refresh).catch(reportError);
  });
  reload.addEventListener('click', () => {
    reload.disabled = true;
    chrome.tabs.reload(tab.id).then(() => { pageState.textContent = text('pageReloaded'); }, e => { reload.disabled = false; reportError(e); });
  });
  (async () => {
    document.getElementById('version').textContent = chrome.runtime.getManifest().version;
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try { const u = new URL(tab?.url); if (['http:', 'https:'].includes(u.protocol)) host = u.hostname; } catch {}
    document.getElementById('host').textContent = host || text('unsupportedPage');
    reload.disabled = !host;
    await refresh();
    const data = await (await fetch(chrome.runtime.getURL('filters/provenance.json'))).json();
    document.getElementById('rules').textContent = text('networkRules', [number(data.networkRules)]);
  })().catch(reportError);
})();
