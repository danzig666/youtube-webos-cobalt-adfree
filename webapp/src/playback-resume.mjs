import {getCurrentVideoId} from './sponsorblock-channels.mjs';
import {playbackMetadata} from './playback-metadata.mjs';
import {nativePlaybackState} from './native-playback-state.mjs';
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
  let restoreTimer = null, fallbackTimer = null;
  let restoreStatus = 'YouTube manages playback history and resume.';
  let localSaveStatus = 'No playback position saved on this TV yet.';
  const loadedSources = new WeakMap();
  const now = () => win.Date?.now?.() ?? Date.now();
  const localEnabled = () => read('playbackResumeMode') === 'youtube-local';
  const player = () => doc.getElementById?.('ytlr-player__player-container-player') || doc.querySelector('.html5-video-player');
  const positions = () => normalizePlaybackPositions(read('playbackPositions'), now());
  function timeLabel(seconds) {
    const value = Math.floor(seconds), hours = Math.floor(value / 3600);
    return (hours ? `${hours}:` : '') + `${String(Math.floor(value / 60) % 60).padStart(hours ? 2 : 1, '0')}:${String(value % 60).padStart(2, '0')}`;
  }
  function cancelFallback() {
    if (fallbackTimer !== null) win.clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  function cancelRestore() {
    if (restoreTimer !== null) win.clearTimeout(restoreTimer);
    restoreTimer = null;
    if (session) session.pending = null;
  }
  function cancelTimers() { cancelFallback(); cancelRestore(); }
  function eligible(video, id) {
    if (!doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH') || !video ||
        video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 20) return false;
    const data = playbackMetadata(win, id);
    // Finite duration alone does not establish VOD (live DVR can be finite).
    if (!data || data.live !== false) return false;
    if (data.duration && Math.abs(data.duration - video.duration) > Math.max(2, video.duration * .001)) return false;
    try {
      if (video.seekable?.length && video.seekable.start(0) > 1) return false;
      const currentPlayer = player(), playerId = currentPlayer?.getVideoData?.()?.video_id;
      if (playerId && playerId !== id) return false;
      if (currentPlayer?.getAdState?.() === 1) return false;
    } catch (_) { return false; }
    return true;
  }
  function matchesPlayer(id) {
    try { return player()?.getVideoData?.()?.video_id === id; }
    catch (_) { return false; }
  }
  function hasNativeReport() {
    try { return typeof win.h5vcc?.system?.getYtafMediaReport === 'function'; }
    catch (_) { return true; }
  }
  function nativeAtTarget(state, target) {
    return state && state.frames > 0 && Math.abs(state.position - target) <= 3;
  }
  function completeRestore(current) {
    cancelRestore();
    session.localAttempted = true;
    restoreStatus = current.source === 'local' ? 'TV playback position reached.' : 'YouTube playback position reached.';
    if (current.source === 'local') notify('Resumed from the position saved on this TV.', 2500, 'green');
  }
  function issueRestore(current) {
    current.attempts++; current.lastAttempt = now();
    session.restoreAttempts++;
    try {
      const currentPlayer = player();
      // Use the existing YouTube seek API when exposed so its MSE state follows
      // the native seek. This never creates or sends an account-history request.
      if (currentPlayer?.getVideoData?.()?.video_id === current.id && typeof currentPlayer.seekTo === 'function')
        currentPlayer.seekTo(current.target, true);
      else current.video.currentTime = current.target;
    } catch (_) { /* Retried within the same bounded confirmation window. */ }
    restoreStatus = current.source === 'local'
      ? 'Seeking to the TV position; waiting for playback confirmation.'
      : 'Seeking to the YouTube position; waiting for playback confirmation.';
  }
  function checkRestore(current) {
    if (restoreTimer !== null) win.clearTimeout(restoreTimer);
    restoreTimer = null;
    if (session?.pending !== current || current.video !== doc.querySelector('video') ||
        current.id !== getCurrentVideoId(win, doc, false) || !eligible(current.video, current.id)) {
      cancelRestore(); return;
    }
    const video = current.video, state = nativePlaybackState(win), domPosition = Number(video.currentTime);
    // A delayed account position can arrive after the TV fallback was issued.
    // Recognize a new target outside both the old target and ordinary progress
    // from the pre-restore position; never retry an obsolete local bookmark.
    const elapsed = Math.max(0, now() - current.started) / 1000;
    const ordinaryProgress = elapsed * Math.max(1, Number(video.playbackRate) || 1) + 3;
    if (Number.isFinite(domPosition) && domPosition > 3 &&
        Math.abs(domPosition - current.target) > ordinaryProgress &&
        Math.abs(domPosition - current.initialPosition) > ordinaryProgress) {
      current.target = domPosition; current.source = 'youtube';
      current.initialNative = state;
      current.lastAttempt = now() - 2000;
      if (!video.seeking && nativeAtTarget(state, domPosition)) { completeRestore(current); return; }
    }
    const position = state && state.frames > 0 ? state.position : domPosition;
    const atTarget = Number.isFinite(position) && position >= current.target - 2 && position <= current.target + 15;
    const first = current.initialNative;
    const nativeProgress = state && state.frames > 0 && (!first || state.session !== first.session ||
      state.generation !== first.generation || state.frames > first.frames);
    // The DOM setter can echo the requested target before a single frame has
    // reached it. Require a native frame, or advancing completed DOM playback.
    if (atTarget && (state ? nativeProgress : !hasNativeReport() && !video.seeking && position > current.target + .1)) {
      completeRestore(current); return;
    }
    if (now() - current.started >= 12000) {
      cancelRestore(); session.failed = true; session.sample = null;
      restoreStatus = 'Playback position was not reached; seek confirmation timed out.';
      notify('Could not confirm playback at the saved position. Use YouTube’s seek controls.', 4000, 'yellow');
      return;
    }
    if (!video.seeking && session.restoreAttempts < 3 && now() - current.lastAttempt >= 2000 &&
        (!state || state.frames === 0 || !atTarget)) issueRestore(current);
    restoreTimer = win.setTimeout(() => checkRestore(current), 500);
  }
  function beginRestore(target, source) {
    cancelFallback();
    if (session.restoreAttempts >= 3) return;
    const current = {id: session.id, video: session.video, target, source,
      initialPosition: Number(session.video.currentTime), initialNative: nativePlaybackState(win),
      started: now(), lastAttempt: now(), attempts: 0};
    session.pending = current; session.sample = null;
    if (source === 'local') session.localAttempted = true;
    issueRestore(current);
    restoreTimer = win.setTimeout(() => checkRestore(current), 500);
  }
  function persist(force = false) {
    if (!localEnabled() || !session?.sample || session.pending || session.failed) return;
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
    lastSave = now();
    if (saved) {
      localSaveStatus = complete ? 'Completed video removed from TV saved positions.'
        : `Saved on this TV at ${timeLabel(sample.position)}.`;
    } else {
      localSaveStatus = 'Could not save the playback position on this TV.';
      if (!session.saveFailure) {
        session.saveFailure = true;
        notify('Could not save playback position. It is available only for this session.', 5000, 'yellow');
      }
    }
  }
  function observe(event, initial = false) {
    const video = doc.querySelector('video'), id = getCurrentVideoId(win, doc, false);
    if (event?.target && event.target !== video) return;
    if (!id || !video) return;
    if (event?.type === 'loadedmetadata') {
      // The player can announce its new source before the TV URL updates. Keep
      // that event's identity; merely changing getVideoData later is not proof
      // that the reused video element has stopped presenting its old source.
      let loadedId = id;
      try { loadedId = player()?.getVideoData?.()?.video_id || id; } catch (_) {}
      loadedSources.set(video, loadedId);
    }
    if (!session || session.id !== id || session.video !== video) {
      persist(true); cancelTimers();
      session = {id, video, manual: false, sample: null, pending: null, started: null,
        localAttempted: false, restoreAttempts: 0, failed: false};
      waitingForMetadata = !initial && event?.type !== 'loadedmetadata';
      const previous = positions().find(item => item.id === id);
      localSaveStatus = previous ? `Saved on this TV at ${timeLabel(previous.position)}.`
        : 'No playback position saved on this TV for this video.';
      restoreStatus = 'Waiting for YouTube’s resume position.';
    }
    if (event?.type === 'loadedmetadata') waitingForMetadata = false;
    if (!eligible(video, id)) return;
    // In the TV SPA, loadedmetadata can precede its URL change. Matching the
    // current player's identity to the captured source event establishes the
    // new source even when a second loadedmetadata event will never arrive.
    if (waitingForMetadata && matchesPlayer(id) && loadedSources.get(video) === id) waitingForMetadata = false;
    if (waitingForMetadata) return;
    if (session.started === null && ['playing', 'timeupdate'].includes(event?.type)) session.started = now();
    if (session.pending) { checkRestore(session.pending); return; }
    const domPosition = Number(video.currentTime), state = nativePlaybackState(win);
    const startup = session.started === null || now() - session.started <= 15000;
    if (!session.manual && !session.failed && startup) {
      // Watch for late account targets even when no local record exists. An
      // explicit URL timestamp suppresses local fallback, not this check.
      if (Number.isFinite(domPosition) && domPosition > 3) {
        cancelFallback(); session.localAttempted = true;
        if (state && !nativeAtTarget(state, domPosition)) {
          session.sample = null;
          if (video.seeking || !['playing', 'timeupdate', 'seeked'].includes(event?.type)) return;
          beginRestore(domPosition, 'youtube'); return;
        }
        restoreStatus = 'YouTube manages playback history and resume.';
      } else if (localEnabled() && !session.localAttempted && !hasExplicitStart(win.location)) {
        const saved = positions().find(item => item.id === id);
        if (saved && Math.abs(saved.duration - video.duration) <= Math.max(2, video.duration * .001)) {
          if (session.started === null || video.seeking) return;
          const remaining = 1500 - (now() - session.started);
          if (remaining > 0) {
            if (fallbackTimer === null) fallbackTimer = win.setTimeout(() => {
              fallbackTimer = null;
              observe({type: 'timeupdate', target: video});
            }, remaining);
            return;
          }
          beginRestore(saved.position, 'local'); return;
        }
      }
    }
    if (!localEnabled() || video.seeking || session.failed) return;
    // Persist actual presented progress. A target echoed by currentTime while
    // native playback is still at zero must never become a durable bookmark.
    if ((state && !nativeAtTarget(state, domPosition)) || (!state && hasNativeReport())) {
      session.sample = null; return;
    }
    const position = state ? state.position : domPosition;
    if (!Number.isFinite(position) || position < 0 || position > video.duration) return;
    session.sample = {id, position, duration: video.duration, ended: Boolean(video.ended)};
    persist(['pause', 'seeked', 'ended'].includes(event?.type));
  }
  function navigation() {
    const id = getCurrentVideoId(win, doc, false);
    if (session && (id !== session.id || !doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH'))) {
      persist(true); cancelTimers(); session = null; waitingForMetadata = true;
    }
  }
  const api = {
    get status() { return restoreStatus; },
    get localStatus() { return localEnabled() ? localSaveStatus : 'TV fallback is off.'; },
    manual() {
      if (!session) return;
      session.manual = true; session.failed = false; session.sample = null;
      cancelTimers(); restoreStatus = 'Manual seek takes precedence.';
    },
    flush: () => persist(true),
    clear() {
      cancelTimers();
      if (session) { session.sample = null; session.localAttempted = true; }
      const saved = save([]);
      localSaveStatus = saved ? 'Saved TV playback positions cleared.' : 'Could not clear saved TV playback positions.';
      notify(saved ? 'Saved playback positions cleared.' : 'Could not clear saved playback positions.', 3500, saved ? 'green' : 'yellow');
    }
  };
  for (const type of ['loadedmetadata', 'playing', 'timeupdate', 'pause', 'seeked', 'ended'])
    doc.addEventListener(type, event => observe(event), true);
  doc.addEventListener('emptied', event => {
    if (event.target !== session?.video) return;
    persist(true); cancelTimers(); session = null; waitingForMetadata = true;
  }, true);
  doc.addEventListener('yt-navigate-finish', navigation);
  win.addEventListener('hashchange', navigation);
  doc.addEventListener('visibilitychange', api.flush);
  win.addEventListener('pagehide', () => { api.flush(); cancelTimers(); if (session) session.manual = true; });
  win.addEventListener('beforeunload', api.flush);
  win.addEventListener('blur', api.flush);
  win.addEventListener('keydown', event => {
    if (event.target?.closest?.('.ytaf-ui-container, .ytaf-choice-popup')) return;
    if ([37, 39, 36, 35].includes(event.keyCode) || ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) api.manual();
  }, true);
  for (const type of ['pointerdown', 'mousedown']) doc.addEventListener(type, event => {
    if (event.target?.closest?.('[role="slider"], ytlr-progress-bar')) api.manual();
  }, true);
  doc.addEventListener('ytaf-config-changed', event => {
    if (event.detail?.key !== 'playbackResumeMode') return;
    cancelFallback();
    if (!localEnabled()) {
      if (session?.pending?.source === 'local') cancelRestore();
      if (session) session.sample = null;
    }
    observe(null);
  });
  observe(null, true);
  return api;
}
