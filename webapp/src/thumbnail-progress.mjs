import {getCurrentVideoId} from './sponsorblock-channels.mjs';
import {playbackMetadata} from './playback-metadata.mjs';
import {nativePlaybackState} from './native-playback-state.mjs';
import {createThumbnailProgressView} from './thumbnail-progress-view.mjs';

// Display-only progress for cards already in YouTube's feed. This cache lives
// in this document and neither saves history nor asks YouTube to replace cards.
export function startThumbnailProgress(doc, win) {
  const view = createThumbnailProgressView(doc, win), snapshots = [], loadedSources = new WeakMap();
  const subscriptions = [], returnDelays = [0, 250, 600, 1200, 2500];
  let source = null, observer = null, timer = null, retries = 0, mutationTimer = null;
  let status = 'Waiting for confirmed playback.', destroyed = false, wasBrowsing = false;
  let backgrounded = false, observedBody = null;
  const now = () => win.Date?.now?.() ?? Date.now();
  const watch = () => doc.body?.classList?.contains('WEB_PAGE_TYPE_WATCH') &&
    !doc.body.classList.contains('WEB_PAGE_TYPE_SHORTS');
  const hidden = () => backgrounded || doc.hidden === true || doc.visibilityState === 'hidden';
  const browsing = () => !doc.body?.classList?.contains('WEB_PAGE_TYPE_WATCH') &&
    !doc.body?.classList?.contains('WEB_PAGE_TYPE_SHORTS') && !getCurrentVideoId(win, null, false);
  const player = () => doc.getElementById?.('ytlr-player__player-container-player') || doc.querySelector?.('.html5-video-player');
  function nativeBridge() {
    try { return typeof win.h5vcc?.system?.getYtafMediaReport === 'function'; } catch (_) { return true; }
  }
  function sameDuration(a, b) { return Math.abs(a - b) <= Math.max(2, b * .001); }
  function eligible(video, id) {
    if (!watch() || !video || video.readyState < 1 || video.seeking ||
        !Number.isFinite(video.duration) || video.duration <= 20) return false;
    const metadata = playbackMetadata(win, id);
    if (!metadata || metadata.live !== false || (metadata.duration && !sameDuration(metadata.duration, video.duration))) return false;
    try {
      const current = player(), playerId = current?.getVideoData?.()?.video_id;
      if ((playerId && playerId !== id) || current?.getAdState?.() === 1) return false;
      if (video.seekable?.length && video.seekable.start(0) > 1) return false;
    } catch (_) { return false; }
    return true;
  }
  function remember(snapshot) {
    const index = snapshots.findIndex(item => item.id === snapshot.id);
    if (index >= 0) snapshots.splice(index, 1);
    snapshots.unshift(snapshot);
    if (snapshots.length > 20) snapshots.length = 20;
    source.sample = snapshot; source.confirmedEnd = snapshot;
    status = snapshot.ended ? 'Completed playback captured for thumbnail display.'
      : 'Confirmed playback captured for thumbnail display.';
  }
  function media(event) {
    if (destroyed || hidden()) return;
    const video = doc.querySelector?.('video');
    if (!video || event.target !== video) return;
    const id = getCurrentVideoId(win, doc, false);
    if (event.type === 'loadedmetadata') {
      let loadedId = id;
      try { loadedId = player()?.getVideoData?.()?.video_id || id; } catch (_) {}
      loadedSources.set(video, loadedId);
      if (source?.video === video) { source.domObservation = null; source.confirmedEnd = null; }
      return;
    }
    if (event.type === 'seeking') {
      if (source?.video === video) { source.domObservation = null; source.confirmedEnd = null; }
      return;
    }
    if (!id || !eligible(video, id)) return;
    // URL/player identity can change before the reused media element changes.
    // Require the captured source event before assigning its frames to a new ID.
    if (source && source.id !== id && source.video === video && loadedSources.get(video) !== id) return;
    const state = nativePlaybackState(win);
    if (!source || source.id !== id || source.video !== video) {
      // Keep the outgoing native identity through transient inactive reports;
      // otherwise its last frame could be attributed to the next video.
      if (source && nativeBridge() && !state) return;
      if (source && state && source.native &&
          state.session === source.native.session && state.generation === source.native.generation) return;
      source = {id, video, sample: null, confirmedEnd: null, domObservation: null, native: null, played: false};
    }
    if (['playing', 'timeupdate'].includes(event.type)) source.played = true;
    if (!source.played) return;
    const domPosition = Number(video.currentTime);
    if (!Number.isFinite(domPosition) || domPosition < 0 || domPosition > video.duration + 1) return;
    // Native EOS marks the snapshot inactive. A confirmed final frame just
    // before it is sufficient to display completion; a requested end target is not.
    if (event.type === 'ended' && source.confirmedEnd && sameDuration(source.confirmedEnd.duration, video.duration) &&
        source.confirmedEnd.position >= video.duration - 2 && domPosition >= video.duration - 2) {
      remember({id, position: video.duration, duration: video.duration, ended: true}); return;
    }
    let position;
    if (state) {
      if (state.frames < 1 || state.position < 0 || Math.abs(state.position - domPosition) > 3) return;
      position = state.position; source.native = state;
    } else if (nativeBridge()) {
      return;
    } else {
      // Browser fallback needs observed, non-seeking progression rather than
      // accepting the value immediately echoed by a currentTime setter.
      const previous = source.domObservation;
      source.domObservation = {position: domPosition, at: now()};
      const elapsed = previous ? Math.max(0, now() - previous.at) / 1000 : 0;
      const delta = previous ? domPosition - previous.position : 0;
      if (!previous || delta <= 0 || delta > elapsed * Math.max(1, Number(video.playbackRate) || 1) + 2) return;
      position = domPosition;
    }
    if (!Number.isFinite(position) || position < 0 || position > video.duration + 1) return;
    const ended = Boolean(video.ended) && position >= video.duration - 2;
    remember({id, position: ended ? video.duration : Math.min(position, video.duration), duration: video.duration, ended});
  }
  function cancelTimers() {
    if (timer !== null) win.clearTimeout(timer);
    if (mutationTimer !== null) win.clearTimeout(mutationTimer);
    timer = null; mutationTimer = null; retries = 0;
  }
  function observeDom() {
    if (!observer) return;
    observer.disconnect(); observedBody = doc.body;
    if (destroyed || hidden()) return;
    // Body replacement needs only direct document-element child observation.
    // Keep the expensive subtree off while watching or before any progress exists.
    if (doc.documentElement && doc.documentElement !== doc.body)
      observer.observe(doc.documentElement, {childList: true});
    if (doc.body) observer.observe(doc.body, browsing() && snapshots.length
      ? {subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['class', 'style', 'src', 'href', 'data-video-id']}
      : {attributes: true, attributeFilter: ['class']});
  }
  function render() {
    if (destroyed || hidden() || !browsing() || !snapshots.length) return;
    // Our rails update inline styles. Do not feed those own DOM mutations back
    // into the observer; a fresh render reads all current card identities.
    observer?.disconnect();
    try {
      const count = view.render(snapshots);
      status = count ? `Thumbnail progress updated on ${count} card${count === 1 ? '' : 's'}.`
        : 'Waiting for matching video thumbnails.';
    } finally { observeDom(); }
  }
  function retry() {
    timer = null;
    if (destroyed || hidden() || !browsing()) return;
    render(); retries++;
    if (retries < returnDelays.length) timer = win.setTimeout(retry, returnDelays[retries] - returnDelays[retries - 1]);
  }
  function navigation() {
    if (destroyed) return;
    const currentBrowsing = !hidden() && browsing();
    if (!currentBrowsing) {
      cancelTimers();
      // Remove transient rails before the player or Shorts can inherit cards.
      if (wasBrowsing) { observer?.disconnect(); view.clear(); }
    } else if (!wasBrowsing && snapshots.length) {
      cancelTimers(); retry();
    }
    wasBrowsing = currentBrowsing;
    observeDom();
  }
  function changed() {
    if (destroyed || hidden()) return;
    if (observedBody !== doc.body) wasBrowsing = false;
    const returning = !wasBrowsing && browsing();
    navigation();
    if (returning) return;
    // Virtualized/recycled cards can appear long after the return. Reconcile
    // once per real mutation burst, without a recurring timer or page refresh.
    if (browsing() && snapshots.length && mutationTimer === null)
      mutationTimer = win.setTimeout(() => { mutationTimer = null; render(); }, 100);
  }
  function background() {
    backgrounded = true; cancelTimers(); wasBrowsing = false;
    observer?.disconnect(); view.clear();
    status = 'Thumbnail progress paused in background.';
  }
  function foreground() { backgrounded = false; navigation(); }
  function listen(target, type, callback, capture = false) {
    target.addEventListener?.(type, callback, capture);
    subscriptions.push([target, type, callback, capture]);
  }
  for (const type of ['loadedmetadata', 'playing', 'timeupdate', 'pause', 'seeking', 'seeked', 'ended']) listen(doc, type, media, true);
  listen(doc, 'emptied', event => {
    if (event.target === source?.video) { loadedSources.delete(event.target); source.domObservation = null; source.confirmedEnd = null; source.played = false; }
  }, true);
  listen(doc, 'yt-navigate-finish', navigation);
  listen(win, 'hashchange', navigation);
  listen(doc, 'visibilitychange', () => doc.hidden === true || doc.visibilityState === 'hidden' ? background() : foreground());
  listen(win, 'pagehide', background);
  listen(win, 'blur', background);
  listen(win, 'focus', foreground);
  listen(win, 'pageshow', foreground);
  if (doc.body && typeof win.MutationObserver === 'function') {
    try { observer = new win.MutationObserver(changed); observeDom(); }
    catch (_) { observer?.disconnect(); observer = null; }
  }
  navigation();
  return {
    get status() { return status; },
    destroy() {
      destroyed = true; cancelTimers(); observer?.disconnect(); view.clear(); snapshots.length = 0; source = null;
      for (const [target, type, callback, capture] of subscriptions) target.removeEventListener?.(type, callback, capture);
      status = 'Thumbnail progress stopped.';
    }
  };
}
