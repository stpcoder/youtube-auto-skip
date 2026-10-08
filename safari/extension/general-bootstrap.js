(() => {
  browser.runtime.sendMessage({ type: 'YAS_GENERAL_INIT' }).then(result => {
    if (document.documentElement) document.documentElement.dataset.yasGeneralBootstrapStatus = JSON.stringify(result);
    window.dispatchEvent(new Event('yas-settings-refresh'));
  }).catch(() => {});
})();
