(() => {
  'use strict';
  const key = Symbol.for('yas.safari.controls');
  if (window[key]) return;
  const core = window[Symbol.for('yas.safari.media-core')], native = core.captureNative();
  const stats = { version: '1.0.0', mode: 'video', pipRequests: 0, pipEntered: 0, pipRejected: 0, audioStarted: 0, audioErrors: 0 };
  window[key] = stats;
  let panel, ui, session, route = core.watchId(location.href), pipTimer, boundVideo, scanPending = false;
  const publish = () => { if (document.documentElement) document.documentElement.dataset.yasSafariMediaStatus = JSON.stringify(stats); };
  const player = () => document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  const video = () => player()?.querySelector('video') || document.querySelector('video.html5-main-video');
  const adActive = () => player()?.matches('.ad-showing,.ad-interrupting') || player()?.getPresentingPlayerType?.() === 2;
  function status(text, error = false) {
    if (ui) { ui.querySelector('#status').textContent = text; ui.querySelector('#status').dataset.error = String(error); }
    publish();
  }
  function audioButton() {
    if (ui) ui.querySelector('#audio').textContent = session ? '영상으로 돌아가기' : '소리만 재생';
  }
  function stopAudio(restore) {
    const s = session; session = null;
    if (!s) return;
    const position = s.position();
    native.pause.call(s.audio); s.audio.removeAttribute('src'); s.audio.load(); s.audio.remove();
    stats.mode = 'video'; audioButton();
    if (restore && s.started && s.video.isConnected && core.watchId(location.href) === s.id) {
      try { s.video.currentTime = position; } catch {}
      if (!s.userPaused) native.play.call(s.video).catch(() => status('재생 버튼을 눌러 이어서 재생해 주세요.'));
    }
    if (navigator.mediaSession && navigator.mediaSession.metadata === s.metadata) navigator.mediaSession.metadata = s.previousMetadata;
    publish();
  }
  function response(id) {
    let r;
    try { r = player()?.getPlayerResponse?.(); } catch {}
    if (r?.videoDetails?.videoId === id) return r;
    return window.ytInitialPlayerResponse?.videoDetails?.videoId === id ? window.ytInitialPlayerResponse : null;
  }
  async function startAudio() {
    if (session) { stopAudio(true); status('영상으로 돌아왔습니다.'); return; }
    const v = video(), id = core.watchId(location.href);
    if (!v || !id || adActive()) { status('본영상이 재생된 뒤 사용해 주세요.', true); return; }
    const audio = document.createElement('audio');
    const model = response(id), format = core.selectAudio(model, id, type => audio.canPlayType(type));
    if (!format) {
      status('이 영상에는 사용할 수 있는 오디오 전용 스트림이 없습니다. PiP는 별도로 사용할 수 있습니다.', true); return;
    }
    try {
      if (v.webkitPresentationMode === 'picture-in-picture' && native.setMode) native.setMode.call(v, 'inline');
      else if (document.pictureInPictureElement === v && document.exitPictureInPicture) document.exitPictureInPicture().catch(() => {});
    } catch { /* Audio can still start if the PiP window cannot be dismissed. */ }
    const s = { audio, video: v, id, start: v.currentTime, userPaused: v.paused, started: false,
      previousMetadata: navigator.mediaSession?.metadata, metadata: null, position: () => Number.isFinite(audio.currentTime) ? audio.currentTime : s.start };
    session = s;
    audio.controls = true; audio.volume = v.volume; audio.muted = v.muted; audio.playbackRate = v.playbackRate;
    audio.src = format.url; ui.querySelector('#audio-container').append(audio);
    audio.addEventListener('loadedmetadata', () => { if (session === s) { try { audio.currentTime = s.start; } catch {} } }, { once: true });
    audio.addEventListener('error', () => {
      if (session !== s) return;
      stats.audioErrors++; stopAudio(true); status('오디오를 읽지 못해 영상으로 돌아왔습니다.', true);
    });
    audio.addEventListener('pause', () => { if (session === s) s.userPaused = true; });
    audio.addEventListener('play', () => { if (session === s) s.userPaused = false; });
    audio.addEventListener('ended', () => { if (session === s) { stopAudio(false); status('오디오 재생이 끝났습니다. 다음 영상은 Safari에서 선택해 주세요.'); } });
    status('오디오를 준비하고 있습니다.');
    try {
      // Called in the actual user tap, before any await: preserve user activation.
      await native.play.call(audio);
      if (session !== s || core.watchId(location.href) !== id) return;
      s.started = true; native.pause.call(v); stats.audioStarted++; stats.mode = 'audio'; audioButton();
      if (navigator.mediaSession && typeof MediaMetadata === 'function') {
        try {
          s.metadata = new MediaMetadata({ title: model.videoDetails.title || document.title, artist: model.videoDetails.author || 'YouTube' });
          navigator.mediaSession.metadata = s.metadata;
        } catch { /* Optional lock-screen metadata must not stop playback. */ }
      }
      status('오디오 전용 재생 중입니다. 홈 화면·잠금 화면에서 계속되는지는 기기에서 확인해 주세요.');
    } catch {
      if (session !== s) return;
      stats.audioErrors++; stopAudio(false); status('Safari가 오디오 재생을 허용하지 않았습니다. 다시 눌러 주세요.', true);
    }
  }
  function onPiP() {
    const v = video();
    if (v?.webkitPresentationMode === 'picture-in-picture' || document.pictureInPictureElement === v) {
      if (stats.mode !== 'pip') stats.pipEntered++;
      clearTimeout(pipTimer); stats.mode = 'pip'; status('PiP 사용 중입니다. 홈 화면으로 나가도 영상 창을 유지할 수 있습니다.');
    } else if (stats.mode === 'pip') { stats.mode = 'video'; status('PiP에서 돌아왔습니다.'); }
  }
  function onVideoPlay() {
    if (session?.started) { stopAudio(false); status('영상 재생으로 돌아왔습니다.'); }
  }
  async function startPiP() {
    if (session) stopAudio(true);
    if (adActive()) { status('광고가 끝난 뒤 본영상에서 사용해 주세요.', true); return; }
    stats.pipRequests++;
    try {
      await core.enterPiP(video(), native); onPiP();
      if (stats.mode !== 'pip') {
        status('Safari에 PiP 진입을 요청했습니다.');
        clearTimeout(pipTimer);
        pipTimer = setTimeout(() => { if (stats.mode !== 'pip') { stats.pipRejected++; status('PiP 진입을 확인하지 못했습니다. 영상을 재생한 뒤 다시 눌러 주세요.', true); } }, 1500);
      }
    } catch (e) { stats.pipRejected++; status(e.message || 'PiP 진입을 허용하지 않았습니다.', true); }
  }
  function mount() {
    if (panel?.isConnected || !document.body || !route) return;
    panel = document.createElement('div'); panel.id = 'yas-safari-tools';
    ui = panel.attachShadow({ mode: 'open' });
    ui.innerHTML = `<style>
      :host{position:fixed!important;z-index:2147483000!important;right:12px!important;bottom:calc(env(safe-area-inset-bottom,0px) + 70px)!important;max-width:calc(100vw - 24px)!important;color-scheme:light dark}
      *{box-sizing:border-box}.panel{width:320px;max-width:100%;background:#f5f8fb;color:#182331;border:1px solid #cedae5;border-radius:16px;padding:14px;box-shadow:0 4px 20px #0002;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif}
      header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}strong{font-size:16px}button{font:inherit;cursor:pointer;min-height:44px;border:1px solid #b4c9d7;background:#fff;color:#182331;border-radius:9px;padding:9px 12px}button:focus-visible{outline:3px solid #08769b;outline-offset:2px}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}#pip{background:#08769b;color:#fff;border-color:#08769b}#fold{border:0;min-height:44px;padding:4px 8px;background:transparent;font-size:13px}#status{margin:12px 0 0;overflow-wrap:anywhere}#status[data-error=true]{color:#a12d27}audio{width:100%;margin-top:12px}.panel.folded .body{display:none}.panel.folded{width:auto}.panel.folded header{margin:0}
      @media(prefers-color-scheme:dark){.panel{background:#172330;color:#edf4fb;border-color:#415266}button{background:#273747;color:#edf4fb;border-color:#52677b}#status[data-error=true]{color:#ffb8af}}@media(max-width:360px){.panel{width:288px;padding:12px}.actions{grid-template-columns:1fr}}
      </style><section class="panel" aria-label="YouTube 재생 도구"><header><strong>재생 도구</strong><button id="fold" aria-expanded="true">접기</button></header><div class="body"><div class="actions"><button id="pip">화면 속 화면</button><button id="audio">소리만 재생</button></div><p id="status" role="status">PiP와 오디오 전용 재생을 각각 켤 수 있습니다.</p><div id="audio-container"></div></div></section>`;
    ui.querySelector('#pip').addEventListener('click', startPiP);
    ui.querySelector('#audio').addEventListener('click', startAudio);
    ui.querySelector('#fold').addEventListener('click', event => {
      const folded = ui.querySelector('.panel').classList.toggle('folded');
      event.target.textContent = folded ? '열기' : '접기'; event.target.setAttribute('aria-expanded', String(!folded));
    });
    document.body.append(panel); publish();
  }
  function scan() {
    const next = core.watchId(location.href);
    if (next !== route) { stopAudio(false); panel?.remove(); panel = null; ui = null; clearTimeout(pipTimer); stats.mode = 'video'; route = next; }
    mount();
    const v = video();
    if (boundVideo !== v) {
      if (session && session.video !== v) stopAudio(false);
      if (boundVideo) for (const event of ['webkitpresentationmodechanged','enterpictureinpicture','leavepictureinpicture']) boundVideo.removeEventListener(event, onPiP);
      boundVideo?.removeEventListener('play', onVideoPlay);
      boundVideo = v;
      if (v) for (const event of ['webkitpresentationmodechanged','enterpictureinpicture','leavepictureinpicture']) v.addEventListener(event, onPiP);
      v?.addEventListener('play', onVideoPlay);
    }
  }
  function schedule() { if (scanPending) return; scanPending = true; queueMicrotask(() => { scanPending = false; scan(); }); }
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
  for (const event of ['yt-navigate-finish','yt-page-data-updated']) document.addEventListener(event, schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('pagehide', event => { if (!event.persisted) stopAudio(false); });
  schedule();
})();
