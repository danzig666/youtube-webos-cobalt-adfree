import {getCurrentVideoId} from './sponsorblock-channels.mjs';
import {playbackMetadata} from './playback-metadata.mjs';
const maximumPositions = 100, maximumAge = 90 * 86400000;
export function normalizePlaybackPositions(value, now = Date.now()) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(entry => {
    if (!entry || !/^[A-Za-z0-9_-]{11}$/.test(entry.id) || seen.has(entry.id) ||
        !Number.isFinite(entry.position) || !Number.isFinite(entry.duration) ||
        !Number.isFinite(entry.updated) || entry.position < 5 ||
        entry.position >= entry.duration - 10 || entry.updated > now + 60000 ||
        entry.updated < now - maximumAge) return false;
    seen.add(entry.id); return true;
  }).slice(0, maximumPositions).map(entry => ({id: entry.id,
    position: entry.position, duration: entry.duration, updated: entry.updated}));
}
export function hasExplicitStart(location) {
  return [location?.hash, location?.href, location?.search].some(value =>
    /[?&#](?:t|start|time_continue|startTime)=/i.test(String(value || '')));
}
export function startPlaybackResume(doc, win, read, save, notify) {
  let session = null, waitingForMetadata = false, lastSave = 0;
  const now = () => win.Date?.now?.() ?? Date.now();
  function positions() { return normalizePlaybackPositions(read('playbackPositions'), now()); }
  function persist(force = false) {
    if (!session?.sample || !read('rememberPlaybackPosition')) return;
    const sample = session.sample;
    if (!force && now() - lastSave < 10000) return;
    const old = positions(), previous = old.find(item => item.id === sample.id);
    const complete = sample.ended || sample.position >= sample.duration - 10;
    if (!complete && sample.position < 5) return;
    if (complete && !previous) return;
    if (!complete && previous && Math.abs(previous.position - sample.position) < 1 &&
        previous.duration === sample.duration) return;
    const next = old.filter(item => item.id !== sample.id);
    if (!complete) next.unshift({id: sample.id, position: sample.position,
      duration: sample.duration, updated: now()});
    const saved = save(next.slice(0, maximumPositions));
    if (saved) lastSave = now();
    else {
      // Throttle failed writes too; retry on pause/exit or the next interval.
      lastSave = now();
      if (!session.saveFailure) {
        session.saveFailure = true;
        notify('Could not save playback position. It is available only for this session.', 5000, 'yellow');
      }
    }
  }
  function eligible(video, id) {
    if (!doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH') ||
        !video || video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 20) return false;
    const data = playbackMetadata(win, id);
    // Finite duration alone does not establish VOD (live DVR can be finite).
    if (!data || data.live !== false) return false;
    if (data.duration && Math.abs(data.duration - video.duration) > Math.max(2, video.duration * .001)) return false;
    if (video.seekable?.length && video.seekable.start(0) > 1) return false;
    const player = doc.getElementById?.('ytlr-player__player-container-player') || doc.querySelector('.html5-video-player');
    try {
      const playerId = player?.getVideoData?.()?.video_id;
      if (playerId && playerId !== id) return false;
      if (player?.getAdState?.() === 1) return false;
    } catch (_) { return false; }
    return true;
  }
  function observe(event, initial = false) {
    const video = doc.querySelector('video'), id = getCurrentVideoId(win, doc, false);
    if (event?.target && event.target !== video) return;
    if (!id || !read('rememberPlaybackPosition')) return;
    if (!session || session.id !== id || session.video !== video) {
      persist(true);
      session = {id, video, restored: false, manual: false, sample: null};
      if (!initial && event?.type !== 'loadedmetadata') waitingForMetadata = true;
    }
    if (event?.type === 'loadedmetadata') waitingForMetadata = false;
    if (waitingForMetadata || !eligible(video, id)) return;
    if (!session.restored) {
      const saved = positions().find(item => item.id === id);
      if (video.currentTime > 3 || session.manual || hasExplicitStart(win.location)) session.restored = true;
      else if (saved && Math.abs(saved.duration - video.duration) <= Math.max(2, video.duration * .001)) {
        // Wait for playback to start: YouTube may restore its own bookmark before
        // playing. Never replace its nonzero position with a different local one.
        if (!['playing', 'timeupdate'].includes(event?.type)) return;
        session.restored = true;
        try {
          video.currentTime = saved.position;
          notify('Resuming from the position saved on this TV.', 2500, 'green');
        } catch (_) {
          notify('Could not resume the saved position. Use YouTube’s seek controls.', 4000, 'yellow');
        }
        return;
      } else session.restored = true;
    }
    // Sample only after identity/metadata checks. Flush this captured sample on
    // navigation, rather than reading a reused media element under its new ID.
    if (video.seeking) return;
    const position = Number(video.currentTime);
    if (!Number.isFinite(position) || position < 0 || position > video.duration) return;
    session.sample = {id, position, duration: video.duration, ended: Boolean(video.ended)};
    persist(['pause', 'seeked', 'ended'].includes(event?.type));
  }
  function navigation() {
    const id = getCurrentVideoId(win, doc, false);
    if (session && id !== session.id) { persist(true); session = null; waitingForMetadata = true; }
  }
  const api = {
    manual() { if (session) session.manual = true; },
    flush: () => persist(true),
    clear() {
      if (session) {session.sample = null; session.manual = true; session.restored = true;}
      const saved = save([]);
      notify(saved ? 'Saved playback positions cleared.' : 'Could not clear saved playback positions.', 3500, saved ? 'green' : 'yellow');
    }
  };
  for (const type of ['loadedmetadata','playing','timeupdate','pause','seeked','ended'])
    doc.addEventListener(type, event => observe(event), true);
  doc.addEventListener('emptied', event => {
    if (event.target !== session?.video) return;
    persist(true); session = null; waitingForMetadata = true;
  }, true);
  doc.addEventListener('yt-navigate-finish', navigation);
  win.addEventListener('hashchange', navigation);
  doc.addEventListener('visibilitychange', api.flush);
  win.addEventListener('pagehide', api.flush);
  win.addEventListener('beforeunload', api.flush);
  win.addEventListener('blur', api.flush);
  win.addEventListener('keydown', event => {
    if ([37,39,36,35].includes(event.keyCode) || ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) api.manual();
  }, true);
  doc.addEventListener('pointerdown', api.manual, true);
  doc.addEventListener('mousedown', event => {
    if (event.target?.closest?.('[role="slider"], ytlr-progress-bar')) api.manual();
  }, true);
  doc.addEventListener('ytaf-config-changed', event => {
    if (event.detail?.key !== 'rememberPlaybackPosition') return;
    if (!read('rememberPlaybackPosition')) {session = null; waitingForMetadata = false;}
    else observe(null, true);
  });
  observe(null, true);
  return api;
}
