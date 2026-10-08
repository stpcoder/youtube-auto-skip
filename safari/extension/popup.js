(() => {
  'use strict';
  const global = document.querySelector('#global'), site = document.querySelector('#site');
  const status = document.querySelector('#status'), playback = document.querySelector('#playback');
  const featureInputs = [...document.querySelectorAll('[data-feature]')];
  let host = '', settings;
  function show(message = '') { status.textContent = message; status.hidden = !message; }
  async function load() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    host = '';
    try { const url = new URL(tabs[0]?.url); if (/^https?:$/.test(url.protocol)) host = url.hostname; } catch {}
    settings = await browser.storage.local.get({ globalEnabled: true, disabledSites: [], siteFeatures: {}, generalError: null });
    global.checked = settings.globalEnabled; global.disabled = false; site.disabled = !host;
    site.checked = !!host && !settings.disabledSites.some(d => host === d || host.endsWith('.' + d));
    site.setAttribute('aria-label', host ? `이 사이트에서 적용하기: ${host}` : '이 사이트에서 적용하기');
    const features = await browser.runtime.sendMessage({ type: 'FOCUS_SITE_FEATURES', host });
    for (const input of featureInputs) { input.checked = features?.[input.dataset.feature] !== false; input.disabled = !host; }
    playback.hidden = !/^https:\/\/(www\.|m\.)?youtube\.com\/watch\?/.test(tabs[0]?.url || '');
    show(settings.generalError || (!host ? 'Safari에서 사이트 접근을 허용해 주세요.' : ''));
  }
  async function save(event) {
    global.disabled = site.disabled = true;
    for (const input of featureInputs) input.disabled = true;
    try {
      const patch = {};
      if (event?.target === global) patch.globalEnabled = global.checked;
      if (event?.target === site) {
        const disabledSites = settings.disabledSites.filter(d => !(host === d || host.endsWith('.' + d)));
        if (host && !site.checked) disabledSites.push(host);
        patch.disabledSites = disabledSites;
      }
      if (host && event?.target?.dataset.feature) patch.siteFeatures = { ...settings.siteFeatures,
        [host]: Object.fromEntries(featureInputs.map(input => [input.dataset.feature, input.checked])) };
      await browser.storage.local.set(patch);
      await browser.runtime.sendMessage({ type: 'YAS_SYNC_RULES' }); await load();
      show(settings.generalError || '저장했어요. 페이지를 새로고침하면 적용돼요.');
    } catch(e) { try { await load(); } catch {} show(String(e.message || e)); }
    finally { global.disabled = false; site.disabled = !host; for (const input of featureInputs) input.disabled = !host; }
  }
  global.addEventListener('change', save); site.addEventListener('change', save);
  for (const input of featureInputs) input.addEventListener('change', save);
  playback.addEventListener('click', async () => {
    playback.disabled = true;
    try {
      const result = await browser.runtime.sendMessage({ type: 'FOCUS_SHOW_PLAYBACK' });
      show(result?.ok ? '화면 오른쪽 아래의 재생 버튼을 사용하세요.' : result?.error || '먼저 YouTube 영상을 열어 주세요.');
    } catch(e) { show(String(e.message || e)); }
    finally { playback.disabled = false; }
  });
  document.querySelector('#diagnose').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      const result = await browser.runtime.sendMessage({ type: 'YAS_DIAGNOSE' });
      const output = document.querySelector('#diagnostics'); output.hidden = false; output.textContent = JSON.stringify(result, null, 2);
      const summary = document.querySelector('#summary'); summary.hidden = !!result?.error;
      const media = result?.media, current = result?.playback?.[0];
      summary.textContent = result?.youtube ?
        (media ? `Focus 실행 중${current ? ` · ${current.paused ? '일시정지' : '재생 중'}` : ''}` : 'Focus가 시작되지 않았어요. 접근 권한을 확인해 주세요.') :
        (result?.general?.applied ? '이 페이지에 적용됐어요.' :
          result?.general?.features && Object.values(result.general.features).some(Boolean) ? '선택한 기능을 적용 중이에요.' :
          result?.general?.features ? '이 사이트에서 적용이 꺼져 있어요.' : '이 페이지에는 아직 적용되지 않았어요.');
      show(result?.error || '');
    } catch(e) { show(String(e.message || e)); }
    finally { document.querySelector('#diagnose').disabled = false; }
  });
  load().catch(e => show(String(e.message || e)));
})();
