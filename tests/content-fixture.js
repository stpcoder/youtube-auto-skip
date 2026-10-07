// Standalone local fixture: no YouTube requests or real debugger attachments.
const fixture = { results: [], requests: [], resolves: [], mode: "complete", listener: null };
window.chrome = window.chrome || {};
chrome.runtime = {
  onMessage: { addListener(fn) { fixture.listener = fn; } },
  sendMessage(message, callback) {
    const request = { ...message, at: performance.now(), mode: fixture.mode };
    fixture.requests.push(request);
    setTimeout(() => {
      const player = document.querySelector("#movie_player");
      if (request.mode === "move") player.style.transform = "translateY(-36px)";
      fixture.listener({ type: "RESOLVE_SKIP_BUTTON", requestId: message.requestId }, {}, point => {
        fixture.resolves.push(point);
        if (point.ok) {
          const hit = document.elementFromPoint(point.x, point.y);
          hit?.closest("button")?.remove();
        }
        callback({ ok: true, clicked: point.ok, timings: { attachMs: 40, detachMs: 0 } });
      });
    }, 40);
  },
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function expect(value, message) { if (!value) throw new Error(message); }
async function until(predicate, timeout = 1000) {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > timeout) throw new Error("상태 변경 시간 초과");
    await wait(5);
  }
}
function button(handler, parent = document.querySelector("#movie_player")) {
  const node = document.createElement("button");
  node.className = "ytp-skip-ad-button";
  node.textContent = "건너뛰기";
  const state = { node, parent, clickAt: null };
  node.addEventListener("click", event => {
    state.clickAt = performance.now();
    if (handler) handler(event);
    else node.remove();
  });
  return state;
}
async function check(name, fn) {
  try {
    const detail = await fn();
    fixture.results.push({ name, ok: true, detail });
  } catch (error) {
    fixture.results.push({ name, ok: false, error: error.message });
  }
  const result = fixture.results.at(-1);
  const li = document.createElement("li");
  li.className = result.ok ? "pass" : "fail";
  li.textContent = (result.ok ? "PASS " : "FAIL ") + name + " — " +
    (result.detail || result.error || "확인");
  document.querySelector("#results").append(li);
  document.querySelector("#movie_player").replaceChildren();
  document.querySelector("#movie_player").style.transform = "";
  await wait(20);
}

window.addEventListener("load", async () => {
  await check("버튼 생성 즉시 DOM 클릭 · 디버거 요청 없음", async () => {
    const state = button();
    const { node, parent } = state;
    const before = fixture.requests.length;
    const start = performance.now();
    parent.append(node);
    await until(() => !node.isConnected);
    const ms = state.clickAt - start;
    expect(ms < 50, "즉시 클릭이 50ms 이상 걸림");
    expect(fixture.requests.length === before, "불필요한 디버거 요청");
    return ms.toFixed(1) + "ms";
  });
  await check("disabled 해제 즉시 클릭", async () => {
    const { node, parent } = button();
    node.disabled = true;
    parent.append(node);
    await wait(100);
    expect(node.isConnected, "비활성 버튼 클릭됨");
    const start = performance.now();
    node.disabled = false;
    await until(() => !node.isConnected);
    expect(performance.now() - start < 50, "활성화 감지 지연");
    return (performance.now() - start).toFixed(1) + "ms";
  });
  await check("숨겨진 부모와 aria-disabled 버튼은 준비될 때까지 대기", async () => {
    const player = document.querySelector("#movie_player");
    const wrapper = document.createElement("div");
    wrapper.style.opacity = "0";
    player.append(wrapper);
    const { node } = button(null, wrapper);
    node.setAttribute("aria-disabled", "true");
    wrapper.append(node);
    await wait(100);
    expect(node.isConnected, "숨겨진 버튼 클릭됨");
    wrapper.style.opacity = "1";
    await wait(60);
    expect(node.isConnected, "aria-disabled 무시됨");
    node.removeAttribute("aria-disabled");
    await until(() => !node.isConnected);
  });
  await check("연속 광고가 1.5초 공통 제한 없이 각각 즉시 클릭", async () => {
    const { node, parent } = button();
    parent.append(node);
    await until(() => !node.isConnected);
    const start = performance.now();
    const second = button();
    second.parent.append(second.node);
    await until(() => !second.node.isConnected);
    expect(performance.now() - start < 50, "다음 광고 클릭 지연");
    return (performance.now() - start).toFixed(1) + "ms";
  });
  await check("같은 버튼 노드를 다음 광고에서 재사용해도 즉시 클릭", async () => {
    let clicks = 0;
    const { node, parent } = button(() => { clicks++; node.hidden = true; });
    parent.append(node);
    await until(() => clicks === 1);
    await wait(20);
    node.hidden = false;
    await until(() => clicks === 2);
  });
  await check("다른 UI가 덮고 있는 버튼은 덮개가 사라진 뒤 클릭", async () => {
    const { node, parent } = button();
    const cover = document.createElement("div");
    cover.style.cssText = "position:absolute;inset:0;background:#555;z-index:100";
    parent.append(node, cover);
    await wait(100);
    expect(node.isConnected, "덮인 버튼에 클릭 전송됨");
    cover.remove();
    await until(() => !node.isConnected);
  });
  await check("DOM 클릭 무시 시 약 80ms 뒤 보조 클릭 · 변경된 좌표 사용", async () => {
    fixture.mode = "move";
    const { node, parent } = button(() => {});
    const before = fixture.requests.length;
    parent.append(node);
    const start = performance.now();
    const oldY = node.getBoundingClientRect().top + node.getBoundingClientRect().height / 2;
    await until(() => !node.isConnected);
    const request = fixture.requests[before];
    expect(request.at - start >= 70 && request.at - start < 200,
      "보조 클릭 요청 " + (request.at - start).toFixed(1) + "ms · " + document.visibilityState);
    expect(Math.abs(fixture.resolves.at(-1).y - (oldY - 36)) < 1, "이전 좌표 사용됨");
    return "요청 " + (request.at - start).toFixed(1) + "ms · 이동 좌표 확인";
  });
  await check("연결 중 교체된 이전 버튼에 좌표 클릭을 보내지 않음", async () => {
    fixture.mode = "complete";
    const { node, parent } = button(() => {});
    const before = fixture.requests.length;
    parent.append(node);
    await until(() => fixture.requests.length > before);
    const fresh = button();
    node.replaceWith(fresh.node);
    await until(() => !fresh.node.isConnected);
    await wait(80);
    expect(fixture.resolves.at(-1).ok === false, "이전 요청이 새 화면을 클릭함");
  });
  await check("SPA 플레이어 교체 후 새 버튼을 즉시 감지", async () => {
    const oldPlayer = document.querySelector("#movie_player");
    const player = oldPlayer.cloneNode(false);
    oldPlayer.replaceWith(player);
    const { node, parent } = button();
    parent.append(node);
    await until(() => !node.isConnected);
  });
  await check("플레이어 식별자가 없는 DOM에서도 버튼 활성화 즉시 감지", async () => {
    const player = document.querySelector("#movie_player");
    const replacement = document.createElement("div");
    replacement.style.cssText = "position:fixed;right:40px;bottom:40px";
    player.replaceWith(replacement);
    await wait(20);
    const { node } = button(null, replacement);
    node.disabled = true;
    replacement.append(node);
    await wait(60);
    const start = performance.now();
    node.disabled = false;
    await until(() => !node.isConnected);
    expect(performance.now() - start < 50, "전체 문서 활성화 감지 지연");
    replacement.replaceWith(player);
  });
  window.fixtureResults = fixture.results;
  document.querySelector("#status").textContent =
    fixture.results.every(result => result.ok) ? "모든 검사 통과" : "실패한 검사 있음";
});
