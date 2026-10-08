(() => {
  'use strict';
  const key = Symbol.for('yas.safari.controls');
  if (window[key]) return;
  const core = window[Symbol.for('yas.safari.media-core')], native = core.captureNative();
  const stats = { version: '1.3.3', mode: 'video', pipRequests: 0, pipEntered: 0, pipRejected: 0,
    pipSupport: null, pipError: null, background: 'off', audioSession: 'off',
    hiddenProgressSeconds: 0, lastError: null, initializedAtMs: Math.round(performance.now()), firstPlayingEventAtMs: null };
  window[key] = stats;
  let panel, ui, background, route = core.watchId(location.href), pipTimer, boundVideo, scanPending = false;
  const visibility = core.visibilityGuard(document, onVisibility);
  const publish = () => { if (document.documentElement) document.documentElement.dataset.yasSafariMediaStatus = JSON.stringify(stats); };
  const player = () => document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  const video = () => player()?.querySelector('video') || document.querySelector('video.html5-main-video') || [...document.querySelectorAll('video')].sort((a,b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const adActive = () => player()?.matches('.ad-showing,.ad-interrupting') || player()?.getPresentingPlayerType?.() === 2;
  function status(text, error = false) {
    stats.lastError = error ? text : null;
    const node = ui?.querySelector('#status');
    if (node) { node.textContent = text; node.hidden = !text || !error; node.dataset.error = String(error); }
    publish();
  }
  function backgroundButton() {
    const button = ui?.querySelector('#background');
    if (!button) return;
    const label = background ? '백그라운드 끄기' : '백그라운드 재생';
    button.setAttribute('aria-label', label); button.setAttribute('title', label);
    button.setAttribute('aria-pressed', String(!!background));
  }
  function stopBackground() {
    const s = background; background = null;
    visibility.disable(); stats.background = 'off'; stats.audioSession = 'off';
    if (stats.mode === 'background-video') stats.mode = 'video';
    s?.audioSession.restore();
    if (s && 'autoPictureInPicture' in s.video && s.video.autoPictureInPicture === true) s.video.autoPictureInPicture = s.autoPiP;
    if (s && navigator.mediaSession) {
      for (const action of ['play', 'pause', 'seekto']) { try { navigator.mediaSession.setActionHandler(action, null); } catch {} }
      try { if (navigator.mediaSession.metadata === s.metadata) navigator.mediaSession.metadata = s.previousMetadata; } catch {}
    }
    backgroundButton(); publish();
  }
  function response(id) {
    let r;
    try { r = player()?.getPlayerResponse?.(); } catch {}
    if (r?.videoDetails?.videoId === id) return r;
    return window.ytInitialPlayerResponse?.videoDetails?.videoId === id ? window.ytInitialPlayerResponse : null;
  }
  function updateMediaState() {
    if (!background || !navigator.mediaSession) return;
    const v = background.video;
    try { navigator.mediaSession.playbackState = v.paused ? 'paused' : 'playing'; } catch {}
    try {
      if (Number.isFinite(v.duration) && v.duration > 0 && Number.isFinite(v.currentTime)) {
        navigator.mediaSession.setPositionState?.({ duration: v.duration, position: Math.min(v.duration, Math.max(0, v.currentTime)), playbackRate: v.playbackRate });
      }
    } catch { /* Optional OS position state must not disrupt playback. */ }
  }
  function installMediaControls(s) {
    if (!navigator.mediaSession) return;
    const current = () => background === s && s.video.isConnected && core.watchId(location.href) === s.id;
    const handlers = {
      play: () => {
        if (!current()) return;
        s.userPaused = false; stats.background = 'armed';
        try { Promise.resolve(native.play.call(s.video)).catch(e => status(e.message, true)); } catch(e) { status(e.message, true); }
      },
      pause: () => {
        if (!current()) return;
        s.userPaused = true; stats.background = 'paused-user';
        native.pause.call(s.video); updateMediaState(); publish();
      },
      seekto: detail => {
        if (!current() || !Number.isFinite(detail.seekTime)) return;
        const duration = s.video.duration;
        s.video.currentTime = Math.max(0, Number.isFinite(duration) ? Math.min(duration, detail.seekTime) : detail.seekTime);
        updateMediaState();
      },
    };
    for (const [action, handler] of Object.entries(handlers)) { try { navigator.mediaSession.setActionHandler(action, handler); } catch {} }
    if (typeof MediaMetadata === 'function') {
      try {
        const model = response(s.id);
        s.metadata = new MediaMetadata({ title: model?.videoDetails?.title || document.title, artist: model?.videoDetails?.author || 'YouTube' });
        navigator.mediaSession.metadata = s.metadata;
      } catch {}
    }
  }
  async function startBackground() {
    if (background) { stopBackground(); status('백그라운드 보조를 껐습니다. 영상은 그대로 재생됩니다.'); return; }
    const v = video(), id = core.watchId(location.href);
    if (!v || !id || adActive()) { status('본영상이 재생된 뒤 사용해 주세요.', true); return; }
    const s = { video: v, id, userPaused: false, hiddenStart: null, audioSession: core.playbackAudioSession(navigator),
      autoPiP: v.autoPictureInPicture, previousMetadata: navigator.mediaSession?.metadata, metadata: null };
    background = s;
    try {
      visibility.enable();
      stats.background = 'armed'; stats.audioSession = s.audioSession.state; stats.hiddenProgressSeconds = 0;
      stats.mode = v.webkitPresentationMode === 'picture-in-picture' || document.pictureInPictureElement === v ? 'pip' : 'background-video';
      v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      if ('autoPictureInPicture' in v) v.autoPictureInPicture = true;
      // Keep YouTube's own mute state consistent with the native element.
      // Otherwise its next state update can restore autoplay muting.
      try { player()?.unMute?.(); } catch {}
      v.muted = false; if (v.volume === 0) v.volume = 1;
      installMediaControls(s); backgroundButton();
      // Keep the existing video/source/buffer/time. No audio stream, source
      // replacement, player reload or intro seek. Play in this explicit tap.
      const playing = native.play.call(v);
      updateMediaState();
      await playing;
      if (background !== s) return;
      status('백그라운드를 준비했어요. 멈추면 잠금 화면에서 재생을 눌러 주세요.');
    } catch(e) {
      if (background !== s) return;
      stopBackground(); status(e.message || '백그라운드 재생 요청이 거부되었습니다.', true);
    }
  }
  function onVisibility(hidden) {
    if (!background) return;
    if (hidden && background.hiddenStart === null) background.hiddenStart = background.video.currentTime;
    if (!hidden && background.hiddenStart !== null) { recordHiddenProgress(); background.hiddenStart = null; }
  }
  function recordHiddenProgress() {
    if (!background || background.hiddenStart === null || adActive()) return;
    const delta = background.video.currentTime - background.hiddenStart;
    if (Number.isFinite(delta) && delta > stats.hiddenProgressSeconds) stats.hiddenProgressSeconds = Math.round(delta * 1000) / 1000;
    publish();
  }
  function onPiP() {
    const v = video();
    if (v?.webkitPresentationMode === 'picture-in-picture' || document.pictureInPictureElement === v) {
      const entered = stats.mode !== 'pip';
      if (entered) stats.pipEntered++;
      clearTimeout(pipTimer); stats.mode = 'pip'; stats.pipError = null;
      if (entered) status('PiP 사용 중입니다. 홈 화면으로 나가도 영상 창을 유지할 수 있습니다.');
    } else if (stats.mode === 'pip') { stats.mode = background ? 'background-video' : 'video'; status('PiP에서 돌아왔습니다.'); }
    ui?.querySelector('#pip')?.setAttribute('data-active', String(stats.mode === 'pip'));
  }
  function onVideoPlay() {
    if (!background) return;
    background.userPaused = false; stats.background = 'armed'; updateMediaState(); publish();
  }
  function onPlaying() {
    if (!adActive() && stats.firstPlayingEventAtMs === null) stats.firstPlayingEventAtMs = Math.round(performance.now());
    updateMediaState(); publish();
  }
  function onVideoPause() {
    if (!background) return;
    updateMediaState();
    if (background.userPaused) { stats.background = 'paused-user'; publish(); return; }
    if (visibility.hidden()) {
      stats.background = 'paused-hidden';
      status('Safari가 백그라운드 재생을 중단했습니다. 잠금 화면의 재생 버튼 또는 PiP를 사용하세요.', true);
    } else { stats.background = 'paused'; publish(); }
  }
  function onTimeUpdate() { if (background) { recordHiddenProgress(); updateMediaState(); } }
  function onEnded() {
    if (!background) return;
    recordHiddenProgress(); stopBackground(); status('영상 재생이 끝났습니다. 다음 영상에서 백그라운드 재생을 다시 켜세요.');
  }
  async function startPiP() {
    if (adActive()) { status('본영상이 재생된 뒤 사용해 주세요.', true); return; }
    stats.pipRequests++; stats.pipError = null;
    try {
      const v = video(); stats.pipSupport = core.pipSupport(v, native, document);
      if (v?.paused && v.readyState >= 1) native.play.call(v).catch(() => {});
      // Captured native PiP is invoked synchronously in this trusted click.
      await core.enterPiP(v, native); onPiP();
      if (stats.mode !== 'pip') {
        status('Safari에 PiP 진입을 요청했습니다.'); clearTimeout(pipTimer);
        pipTimer = setTimeout(() => { if (stats.mode !== 'pip') {
          stats.pipRejected++; stats.pipError = { name: 'NoPresentationChange', message: 'PiP window did not open' };
          status('PiP 창이 열리지 않았습니다. iPhone 설정 → 일반 → 화면 속 화면을 확인하세요. 시뮬레이터는 PiP를 지원하지 않을 수 있습니다.', true);
        } }, 1500);
      }
    } catch(e) {
      stats.pipRejected++; stats.pipError = { name: e.name || 'Error', message: e.message || '' };
      status(e.name === 'NotSupportedError' ? '현재 Safari·기기가 PiP를 지원하지 않는다고 응답했습니다. 시뮬레이터라면 PiP 창을 열 수 없을 수 있습니다. 실제 iPhone에서도 별도 확인이 필요합니다.' : e.message || 'PiP 진입을 허용하지 않았습니다.', true);
    }
  }
  function mount() {
    if (panel?.isConnected || !document.body || !route) return;
    const v = video();
    if (!v) return;
    panel = document.createElement('div'); panel.id = 'yas-safari-tools'; ui = panel.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host{display:block!important;position:fixed!important;z-index:2147483000!important;right:12px!important;bottom:calc(env(safe-area-inset-bottom,0px) + 72px)!important;width:auto!important;max-width:calc(100vw - 24px)!important;pointer-events:none!important;color-scheme:light dark}
      *{box-sizing:border-box}.panel{--surface:#fff;--ink:#182331;--line:#dce2e8;--active:#182331;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif}
      .actions{display:grid;grid-template-columns:repeat(3,44px);gap:2px;padding:4px;border:1px solid var(--line);border-radius:13px;background:var(--surface);box-shadow:0 3px 14px #0002;pointer-events:auto}
      button{display:grid;place-items:center;width:44px;height:44px;margin:0;padding:0;border:0;border-radius:8px;background:transparent;color:var(--ink);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      button:active{background:var(--line)}button[aria-pressed=true],button[data-active=true]{background:var(--active);color:var(--surface)}button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}svg{display:block;width:22px;height:22px}
      #status{order:-1;max-width:min(280px,calc(100vw - 24px));margin:0;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);overflow-wrap:anywhere;box-shadow:0 3px 14px #0002}[hidden]{display:none!important}
      @media(prefers-color-scheme:dark){.panel{--surface:#182331;--ink:#f1f5f9;--line:#394655;--active:#f1f5f9}}
      `;
    // YouTube may enforce Trusted Types: never inject an HTML string.
    function node(tag, attrs = {}, text = '') {
      const n = document.createElement(tag);
      for (const [name, value] of Object.entries(attrs)) n.setAttribute(name, value);
      n.textContent = text; return n;
    }
    function iconButton(id, label, shapes) {
      const button = node('button', { id, type: 'button', 'aria-label': label, title: label });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(name, value);
      for (const [tag, attrs] of shapes) {
        const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, value);
        svg.append(shape);
      }
      button.append(svg); return button;
    }
    const section = node('section', { class: 'panel', 'aria-label': 'Focus 재생 도구' });
    const actions = node('div', { class: 'actions', role: 'group', 'aria-label': '재생 기능' });
    actions.append(
      iconButton('pip', '화면 속 화면', [['rect', { x: '3', y: '4', width: '18', height: '16', rx: '2' }], ['rect', { x: '12', y: '11', width: '7', height: '6', rx: '1', fill: 'currentColor', stroke: 'none' }]]),
      iconButton('background', '백그라운드 재생', [['path', { d: 'M4 13v-1a8 8 0 0 1 16 0v1' }], ['rect', { x: '3', y: '12', width: '4', height: '8', rx: '2' }], ['rect', { x: '17', y: '12', width: '4', height: '8', rx: '2' }]]),
      iconButton('fullscreen', '전체 화면', [['path', { d: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5' }]]),
    );
    section.append(actions, node('p', { id: 'status', role: 'status', hidden: '' }));
    ui.append(style, section);
    ui.querySelector('#pip').addEventListener('click', startPiP);
    ui.querySelector('#background').addEventListener('click', startBackground);
    ui.querySelector('#fullscreen').addEventListener('click', () => {
      try {
        const v = video();
        if (!v || v.readyState < 1 || typeof native.fullscreen !== 'function') throw Error('먼저 영상을 재생해 주세요.');
        v.removeAttribute('disablepictureinpicture'); native.fullscreen.call(v);
      } catch(e) { status(e.message, true); }
    });
    document.body.append(panel);
    backgroundButton(); onPiP(); publish();
  }
  const events = { webkitpresentationmodechanged: onPiP, enterpictureinpicture: onPiP, leavepictureinpicture: onPiP,
    play: onVideoPlay, pause: onVideoPause, playing: onPlaying, timeupdate: onTimeUpdate, ratechange: updateMediaState, ended: onEnded };
  function scan() {
    const next = core.watchId(location.href);
    if (next !== route) {
      stopBackground(); panel?.remove(); panel = null; ui = null; clearTimeout(pipTimer);
      stats.mode = 'video'; stats.hiddenProgressSeconds = 0; stats.pipSupport = null; stats.pipError = null; stats.lastError = null;
      stats.firstPlayingEventAtMs = null; stats.initializedAtMs = Math.round(performance.now()); route = next;
    }
    mount(); const v = video();
    if (boundVideo !== v) {
      if (background && background.video !== v) stopBackground();
      if (boundVideo) for (const [event, handler] of Object.entries(events)) boundVideo.removeEventListener(event, handler);
      boundVideo = v;
      if (v) for (const [event, handler] of Object.entries(events)) v.addEventListener(event, handler);
    }
  }
  function schedule() { if (scanPending) return; scanPending = true; queueMicrotask(() => { scanPending = false; try { scan(); } catch(e) { status('재생 도구 초기화 실패: ' + e.message, true); } }); }
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
  for (const event of ['yt-navigate-finish', 'yt-page-data-updated']) document.addEventListener(event, schedule);
  document.addEventListener('focus-show-playback', scan);
  document.addEventListener('visibilitychange', () => { if (!visibility.hidden()) { onPiP(); schedule(); } });
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', () => { onPiP(); schedule(); });
  window.addEventListener('pagehide', event => { if (!event.persisted) stopBackground(); });
  schedule();
})();
