// YouTube IFrame API wrapper. Only parseYouTubeId is pure; createYouTube needs a browser.
const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input) {
  const s = String(input ?? '').trim();
  if (ID.test(s)) return s;
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (parts[0] === 'embed' || parts[0] === 'shorts') id = parts[1];
  }
  return id && ID.test(id) ? id : null;
}

let apiPromise = null;
function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) { resolve(window.YT); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => { apiPromise = null; reject(new Error('Could not load the YouTube player')); };
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export async function createYouTube(el) {
  const YT = await loadApi();
  const host = document.createElement('div');
  el.appendChild(host);
  const handlers = { state: [], error: [] };
  const emit = (type, v) => handlers[type].forEach(fn => fn(v));
  let loop = null, loopTimer = 0;

  const player = await new Promise((resolve) => {
    const p = new YT.Player(host, {
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0 },
      events: {
        onReady: () => resolve(p),
        onStateChange: (e) => emit('state', e.data),
        onError: (e) => emit('error', e.data === 101 || e.data === 150 ? 'not-embeddable' : `error-${e.data}`),
      },
    });
  });

  function tickLoop() {
    if (loop && player.getCurrentTime() >= loop.b) player.seekTo(loop.a, true);
  }

  return {
    load(id, start = 0) { player.cueVideoById({ videoId: id, startSeconds: start }); },
    play() { player.playVideo(); },
    pause() { player.pauseVideo(); },
    seek(t) { player.seekTo(t, true); },
    setRate(r) { player.setPlaybackRate(r); },
    time() { return player.getCurrentTime(); },
    setLoop(a, b) { loop = { a, b }; clearInterval(loopTimer); loopTimer = setInterval(tickLoop, 100); },
    clearLoop() { loop = null; clearInterval(loopTimer); },
    on(type, fn) { handlers[type].push(fn); return () => { handlers[type] = handlers[type].filter(f => f !== fn); }; },
    destroy() { clearInterval(loopTimer); try { player.destroy(); } catch { /* already gone */ } host.remove(); },
  };
}
