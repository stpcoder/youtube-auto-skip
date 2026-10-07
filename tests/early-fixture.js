const fixture = { requests: [], results: [], listener: null, jsCalls: [], jsAction: null };
window.chrome = window.chrome || {};
chrome.runtime = {
  onMessage: { addListener(fn) { fixture.listener = fn; } },
  sendMessage(message, callback) {
    fixture.requests.push(message);
    setTimeout(() => {
      fixture.listener({ type: "RESOLVE_SKIP_BUTTON", requestId: message.requestId }, {}, point => {
        if (point.ok) document.elementFromPoint(point.x, point.y)?.closest("button")?.remove();
        callback({ ok: true, clicked: point.ok, timings: { detachMs: 0 } });
      });
    }, 20);
  },
};
const player = document.querySelector("#movie_player");
let adState = -1;
let presenting = 1;
player.getAdState = () => adState;
player.getPresentingPlayerType = () => presenting;
player.getOptions = () => ["executeCommand"];
player.setOption = (module, name, params) => {
  fixture.jsCalls.push({ path: "command", module, name, params });
  fixture.jsAction?.();
};
player.onAdUxClicked = (event, layoutId) => {
  fixture.jsCalls.push({ path: "layout", event, layoutId });
  fixture.jsAction?.();
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const emit = (event, detail) => player.dispatchEvent(new CustomEvent(event, { detail }));
const end = () => { adState = -1; presenting = 1; player.classList.remove("ad-showing"); emit("onAdEnd"); };
function update(id, commands, modern = false) {
  return { actionType: 1, content: { componentType: modern ? "player-overlay-layout" : "player-overlay", layoutId: id,
    renderer: modern ? { skipOrPreview: { skipAdViewModel: { skippableState: { skipAdButtonViewModel: {} } } } }
      : { skipOrPreviewRenderer: { skipAdRenderer: { skippableRenderer: { skipButtonRenderer:
        commands ? { adRendererCommands: { clickCommand: commands } } : {} } } } } } };
}
function expect(value, message) { if (!value) throw new Error(message); }
async function until(predicate, timeout = 1000) {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) throw new Error("시간 초과");
    await wait(5);
  }
}
async function check(name, fn) {
  try { fixture.results.push({ name, ok: true, detail: await fn() }); }
  catch (error) { fixture.results.push({ name, ok: false, error: error.message }); }
  const result = fixture.results.at(-1);
  const li = document.createElement("li");
  li.className = result.ok ? "pass" : "fail";
  li.textContent = (result.ok ? "PASS " : "FAIL ") + name + " — " + (result.detail || result.error || "확인");
  document.querySelector("#results").append(li);
  delete player.skipAd;
  fixture.jsAction = null;
  player.replaceChildren();
  end();
  await wait(30);
}
function makeButton(onClick) {
  const button = document.createElement("button");
  button.className = "ytp-skip-ad-button";
  button.textContent = "건너뛰기";
  button.addEventListener("click", onClick || (() => button.remove()));
  return button;
}
window.addEventListener("load", async () => {
  await check("컴포넌트 생성 전에 skipAd() 1회 주입 · 원본 데이터 유지", () => {
    expect(window.injectedBeforeComponent, "플레이어 생성 후 주입됨");
    expect(ytInitialPlayerResponse.adPlacements.length === 1, "원본 광고 데이터 변경됨");
    expect(ytInitialPlayerResponse.captions.keep, "자막 변경됨");
  });
  await check("광고 시작 JS 이벤트 → skipAd() · 버튼 없이 종료 · 디버거 없음", () => {
    const before = fixture.requests.length;
    let latency;
    player.skipAd = () => { latency = performance.now() - start; end(); };
    const start = performance.now();
    emit("onAdStart");
    expect(latency !== undefined, "시작 이벤트에서 즉시 실행되지 않음");
    expect(fixture.requests.length === before, "디버거 요청 발생");
    return latency.toFixed(2) + "ms · DOM 버튼 0개";
  });
  await check("광고 레이아웃 JS 이벤트 → END_LINEAR_AD · 버튼 생성 전 종료", () => {
    const before = fixture.jsCalls.length;
    let latency;
    fixture.jsAction = () => { latency = performance.now() - start; end(); };
    const start = performance.now();
    emit("onAdUxUpdate", [update("legacy-live-layout", { commandExecutorCommand: { commands: [
      { adLifecycleCommand: { action: "END_LINEAR_AD" } },
      { urlEndpoint: { url: "https://example.com" } },
    ] } })]);
    expect(latency !== undefined, "종료 명령이 즉시 실행되지 않음");
    expect(fixture.jsCalls.length === before + 1, "종료 후 중복 실행됨");
    expect(fixture.jsCalls.at(-1).params.command.commandExecutorCommand.commands.length === 1, "다른 명령 실행됨");
    expect(!player.querySelector("button"), "버튼을 기다림");
    return latency.toFixed(2) + "ms · 원래 layoutId 사용";
  });
  await check("현행 ViewModel 광고 → 내부 skip-button 이벤트 · 버튼 생성 불필요", () => {
    fixture.jsAction = end;
    emit("onAdUxUpdate", [update("modern-live-layout", null, true)]);
    expect(fixture.jsCalls.at(-1).layoutId === "modern-live-layout", "현행 layoutId 누락");
    expect(!player.querySelector("button"), "버튼을 기다림");
  });
  await check("JS 종료가 무시되면 숨겨진 버튼을 첫 페인트 전 클릭", async () => {
    let painted = false;
    let clickedAfterPaint;
    let latency;
    const before = fixture.requests.length;
    const button = makeButton(() => {
      clickedAfterPaint = painted;
      latency = performance.now() - start;
      button.remove();
    });
    button.style.display = "none";
    const start = performance.now();
    requestAnimationFrame(() => { painted = true; });
    emit("onAdUxUpdate", [update("ignored-layout")]);
    player.append(button);
    await until(() => latency !== undefined);
    expect(!clickedAfterPaint, "첫 페인트를 기다림");
    expect(fixture.requests.length === before, "숨겨진 버튼에 디버거 요청 발생");
    return latency.toFixed(2) + "ms · display:none 상태";
  });
  await check("비활성 버튼은 활성화 직후 렌더링 전에 클릭", async () => {
    adState = 1;
    const button = makeButton();
    button.style.visibility = "hidden";
    button.disabled = true;
    player.append(button);
    await wait(80);
    expect(button.isConnected, "disabled 버튼 클릭됨");
    button.disabled = false;
    await until(() => !button.isConnected);
  });
  await check("getAdState가 -1이어도 광고 플레이어 타입으로 감지", async () => {
    const button = makeButton();
    button.style.display = "none";
    player.append(button);
    await wait(30);
    expect(button.isConnected, "본문 재생 중 클릭됨");
    presenting = 2;
    emit("presentingplayerstatechange");
    await until(() => !button.isConnected);
  });
  await check("JS와 DOM 클릭 모두 무시되면 약 80ms 뒤 기존 보조 클릭 1회", async () => {
    let clicks = 0;
    const before = fixture.requests.length;
    const button = makeButton(() => { clicks++; });
    const start = performance.now();
    emit("onAdUxUpdate", [update("trusted-fallback")]);
    player.append(button);
    await until(() => !button.isConnected);
    expect(clicks === 1, "MAIN / isolated 클릭 중복");
    expect(fixture.requests.length === before + 1, "보조 요청 중복 또는 누락");
    return (performance.now() - start).toFixed(1) + "ms · 모의 보조 경로 완료";
  });
  await check("본문 재생 중 수동 skipAd() 실행해도 종료 명령 없음", () => {
    const before = fixture.jsCalls.length;
    expect(youtubeAutoSkip.skipAd() === false, "본문에서 실행됨");
    expect(fixture.jsCalls.length === before, "본문 종료 명령 실행됨");
  });
  await check("삭제된 광고 layoutId는 재사용하지 않음", async () => {
    emit("onAdUxUpdate", [update("obsolete-layout")]);
    emit("onAdUxUpdate", [{ ...update("obsolete-layout"), actionType: 3 }]);
    const before = fixture.jsCalls.length;
    await wait(270);
    youtubeAutoSkip.skipAd();
    expect(fixture.jsCalls.length === before, "삭제된 ID 재사용됨");
  });
  window.earlyFixtureResults = fixture.results;
  document.querySelector("#status").textContent =
    fixture.results.every(result => result.ok) ? "모든 검사 통과" : "실패한 검사 있음";
});
