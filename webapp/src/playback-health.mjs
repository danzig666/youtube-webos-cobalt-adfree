// Bounded, identity-free evidence for failures that occur only on a TV. This
// measures delivery, not just the existence of a timer handle. It never changes
// playback, requests a page refresh or restarts YouTube.
export function startPlaybackHealth(doc, win) {
  if (win.__ytafPlaybackHealth) return win.__ytafPlaybackHealth;
  const now = () => win.performance?.now?.() ?? win.Date?.now?.() ?? Date.now();
  let timer = null, expected = null, stopped = false;
  let keys = 0, errors = 0, updates = 0, lastUpdate = null, lastProgress = null;
  let video = null, position = null, maxDelay = 0, stalls = 0;
  const listeners = [];
  const foreground = () => !doc.hidden && doc.visibilityState !== 'hidden';
  function listen(target, type, fn, capture = false) {
    target.addEventListener(type, fn, capture); listeners.push([target, type, fn, capture]);
  }
  function tick() {
    timer = null;
    if (stopped) return;
    const time = now();
    if (foreground() && doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH')) {
      const delay = expected === null ? 0 : Math.max(0, time - expected);
      maxDelay = Math.max(maxDelay, delay);
      if (delay >= 2000) stalls = Math.min(9999, stalls + 1);
      const next = doc.querySelector('video');
      if (next !== video) {video = next; position = null; lastUpdate = null; lastProgress = null;}
      const value = Number(video?.currentTime);
      if (video && !video.paused && !video.seeking && Number.isFinite(value)) {
        if (position !== null && value > position) lastProgress = time;
        position = value;
      }
    } else expected = null;
    expected = time + 1000;
    timer = win.setTimeout(tick, 1000);
  }
  listen(win, 'keydown', () => {keys = Math.min(999999, keys + 1);}, true);
  listen(doc, 'timeupdate', event => {
    if (event.target !== doc.querySelector('video')) return;
    if (event.target !== video) {video = event.target; position = null; lastProgress = null;}
    updates = Math.min(999999, updates + 1); lastUpdate = now();
  }, true);
  for (const type of ['error', 'unhandledrejection']) listen(win, type, () => {errors = Math.min(9999, errors + 1);});
  // Background timers being delayed is expected and must not be counted as a
  // playback stall when the retained application returns to the foreground.
  const resetTiming = () => {expected = null;};
  for (const type of ['visibilitychange', 'webOSRelaunch']) listen(doc, type, resetTiming);
  for (const type of ['pageshow', 'pagehide', 'focus', 'blur']) listen(win, type, resetTiming);
  const api = {
    report() {
      const age = time => time === null ? 'unavailable' : `${Math.round(Math.max(0, now() - time) / 1000)}s`;
      return {foreground: foreground(), keys, errors, updates,
        updateAge: age(lastUpdate), progressAge: age(lastProgress),
        maxDelay: Math.round(maxDelay), stalls};
    },
    destroy() {
      stopped = true; if (timer !== null) win.clearTimeout(timer); timer = null;
      for (const [target, type, fn, capture] of listeners) target.removeEventListener(type, fn, capture);
      if (win.__ytafPlaybackHealth === api) delete win.__ytafPlaybackHealth;
    }
  };
  win.__ytafPlaybackHealth = api; tick(); return api;
}
