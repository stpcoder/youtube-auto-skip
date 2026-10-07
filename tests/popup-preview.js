(async()=>{
  const locale=new URL(location.href).searchParams.get('lang')||'en';
  const folder=({'pt-BR':'pt_BR',pt_BR:'pt_BR',en:'en',id:'id',ko:'ko'})[locale]||'en';
  window.__YAS_PREVIEW_LANGUAGE__=folder.replace('_','-');
  window.__YAS_PREVIEW_MESSAGES__=await(await fetch(`../_locales/${folder}/messages.json`)).json();
  window.__YAS_PREVIEW_MANIFEST__=await(await fetch('../manifest.json')).json();
  const html=await(await fetch('../general/popup.html')).text();
  document.querySelector('iframe').srcdoc=html.replace('<link','<base href="/general/"><script src="/tests/popup-fixture.js"></script><link');
})();
