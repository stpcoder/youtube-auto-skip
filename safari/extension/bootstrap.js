(() => {
  const report = result => {
    const write = () => {
      if (document.documentElement) document.documentElement.dataset.yasSafariBootstrapStatus = JSON.stringify(result);
      else setTimeout(write, 10);
    };
    write();
  };
  browser.runtime.sendMessage({ type: 'YAS_SAFARI_INIT' }).then(report,
    () => report({ ok: false, error: 'YouTube에 대한 Safari 확장 접근 권한을 확인해 주세요.' }));
})();
