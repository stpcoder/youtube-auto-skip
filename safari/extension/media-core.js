(() => {
  'use strict';
  const key = Symbol.for('yas.safari.media-core');
  if (globalThis[key]) return;
  function watchId(href) {
    try { const u = new URL(href); return u.pathname === '/watch' ? u.searchParams.get('v') : null; } catch { return null; }
  }
  function captureNative() {
    const v = HTMLVideoElement.prototype, m = HTMLMediaElement.prototype;
    return { supportsMode: v.webkitSupportsPresentationMode, setMode: v.webkitSetPresentationMode,
      requestPiP: v.requestPictureInPicture, fullscreen: v.webkitEnterFullscreen, play: m.play, pause: m.pause };
  }
  function enterPiP(video, api) {
    if (!video || video.readyState < 1) throw Error('먼저 영상을 재생해 주세요.');
    const previous = video.getAttribute('disablepictureinpicture');
    video.removeAttribute('disablepictureinpicture');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    // Safari can promote a playing inline video when the user goes Home.
    // This is a request, not proof that a PiP window was actually entered.
    if ('autoPictureInPicture' in video) video.autoPictureInPicture = true;
    const restore = () => { if (previous !== null) video.setAttribute('disablepictureinpicture', previous); };
    try {
      if (typeof api.setMode === 'function' &&
          (!api.supportsMode || api.supportsMode.call(video, 'picture-in-picture'))) {
        api.setMode.call(video, 'picture-in-picture');
        return Promise.resolve('webkit');
      }
      if (typeof api.requestPiP === 'function') return Promise.resolve(api.requestPiP.call(video)).then(() => 'standard', e => { restore(); throw e; });
      throw Error('Safari가 이 영상의 PiP 지원을 보고하지 않습니다. 전체 화면의 PiP 버튼을 확인하세요. 시뮬레이터에서는 지원이 제한될 수 있습니다.');
    } catch (e) { restore(); throw e; }
  }
  function playbackAudioSession(nav) {
    let session, previous;
    try {
      session = nav.audioSession;
      if (!session || !('type' in session)) return { state: 'unavailable', restore() {} };
      previous = session.type;
      // This selects the OS media-playback category; it does not create a new
      // audio stream or request microphone access, nor bypass OS suspension.
      session.type = 'playback';
      const state = session.type === 'playback' ? 'playback' : 'rejected';
      return { state, restore() { try { if (session.type === 'playback') session.type = previous; } catch {} } };
    } catch { return { state: 'rejected', restore() {} }; }
  }
  function pipSupport(video, api, doc) {
    let webkitSupported = null;
    try { if (video && api.supportsMode) webkitSupported = !!api.supportsMode.call(video, 'picture-in-picture'); } catch {}
    return { webkit: typeof api.setMode === 'function', webkitSupported,
      standard: typeof api.requestPiP === 'function', standardEnabled: doc.pictureInPictureEnabled ?? null };
  }
  function visibilityGuard(doc, onChange = () => {}) {
    const own = new Map(), descriptors = new Map();
    for (const name of ['hidden', 'visibilityState', 'webkitHidden', 'webkitVisibilityState']) {
      if (!(name in doc)) continue;
      own.set(name, Object.getOwnPropertyDescriptor(doc, name));
      for (let p = doc; p; p = Object.getPrototypeOf(p)) {
        const d = Object.getOwnPropertyDescriptor(p, name);
        if (d) { descriptors.set(name, d); break; }
      }
    }
    const actual = name => { const d = descriptors.get(name); return d?.get ? d.get.call(doc) : d?.value; };
    let active = false;
    const hidden = () => !!(actual('hidden') ?? actual('webkitHidden'));
    const stop = event => {
      if (!active) return;
      onChange(hidden());
      if (hidden()) event.stopImmediatePropagation();
    };
    // Window capture runs before document capture. A document-only listener
    // lets earlier window-level YouTube listeners pause the player first.
    for (const target of [doc.defaultView, doc]) {
      if (!target?.addEventListener) continue;
      target.addEventListener('visibilitychange', stop, true);
      target.addEventListener('webkitvisibilitychange', stop, true);
    }
    return {
      hidden,
      enable() {
        if (active) return;
        try {
          for (const name of own.keys()) Object.defineProperty(doc, name, { configurable: true, get: () => name.toLowerCase().endsWith('hidden') ? false : 'visible' });
          active = true;
        } catch(e) { this.disable(); throw e; }
      },
      disable() {
        active = false;
        for (const name of own.keys()) {
          const previous = own.get(name);
          try { if (previous) Object.defineProperty(doc, name, previous); else delete doc[name]; } catch {}
        }
      },
    };
  }
  globalThis[key] = Object.freeze({ watchId, captureNative, enterPiP, visibilityGuard, playbackAudioSession, pipSupport });
})();
