(() => {
  'use strict';
  const key = Symbol.for('yas.safari.media-core');
  if (globalThis[key]) return;
  function watchId(href) {
    try { const u = new URL(href); return u.pathname === '/watch' ? u.searchParams.get('v') : null; } catch { return null; }
  }
  function selectAudio(response, videoId, canPlay, now = Date.now()) {
    if (!videoId || response?.videoDetails?.videoId !== videoId || response.videoDetails.isLive || response.videoDetails.isLiveContent) return null;
    if (response.playabilityStatus?.status !== 'OK') return null;
    const candidates = [];
    const formats = response.streamingData?.adaptiveFormats;
    if (!Array.isArray(formats)) return null;
    for (const format of formats) {
      if (typeof format?.mimeType !== 'string' || !format.mimeType.startsWith('audio/') || typeof format.url !== 'string' || !canPlay(format.mimeType)) continue;
      try {
        const url = new URL(format.url);
        if (url.protocol !== 'https:' || url.username || url.password ||
            !(url.hostname === 'googlevideo.com' || url.hostname.endsWith('.googlevideo.com'))) continue;
        const expires = Number(url.searchParams.get('expire'));
        if (url.searchParams.has('expire') && (!Number.isFinite(expires) || expires * 1000 < now + 30000)) continue;
        candidates.push({ url: url.href, mimeType: format.mimeType, bitrate: Number.isFinite(format.bitrate) ? format.bitrate : 0 });
      } catch { /* No external resolvers or token/signature guessing. */ }
    }
    return candidates.sort((a, b) => b.bitrate - a.bitrate)[0] || null;
  }
  function captureNative() {
    const v = HTMLVideoElement.prototype, m = HTMLMediaElement.prototype;
    return { supportsMode: v.webkitSupportsPresentationMode, setMode: v.webkitSetPresentationMode,
      requestPiP: v.requestPictureInPicture, play: m.play, pause: m.pause };
  }
  function enterPiP(video, api) {
    if (!video || video.readyState < 1) throw Error('먼저 영상을 재생해 주세요.');
    const previous = video.getAttribute('disablepictureinpicture');
    video.removeAttribute('disablepictureinpicture');
    const restore = () => { if (previous !== null) video.setAttribute('disablepictureinpicture', previous); };
    try {
      if (typeof api.setMode === 'function' &&
          (!api.supportsMode || api.supportsMode.call(video, 'picture-in-picture'))) {
        api.setMode.call(video, 'picture-in-picture');
        return Promise.resolve('webkit');
      }
      if (typeof api.requestPiP === 'function') return Promise.resolve(api.requestPiP.call(video)).then(() => 'standard', e => { restore(); throw e; });
      throw Error('이 브라우저나 영상은 PiP를 지원하지 않습니다.');
    } catch (e) { restore(); throw e; }
  }
  globalThis[key] = Object.freeze({ watchId, selectAudio, captureNative, enterPiP });
})();
