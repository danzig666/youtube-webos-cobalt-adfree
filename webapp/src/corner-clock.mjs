// Inspired by the optional top-right clock in NicholasBly/youtube-webos:
// https://github.com/NicholasBly/youtube-webos/blob/78a374a32774b92a2094e1cda8db4da0d83540d4/src/watch.js
// This controller is independent of YouTube's renderer and player callbacks.
import {playbackTimelineVisible, playbackMenuVisible} from './playback-controls-visibility.mjs';

export function clockDisplayMode(value) {
  return ['controls', 'browsing', 'always'].includes(value) ? 'controls' : 'off';
}

export function installCornerClock(doc, win, read) {
  if (win.__ytafCornerClock) return win.__ytafCornerClock;
  let node = null, timer = null, observer = null, observedBody = null;
  let disposed = false, observerFailed = false, status = 'off';
  const listeners = [];
  const shiftStarted = new (win.Date || Date)().getTime();
  const shiftInterval = 180000;
  const shifts = [[0,0], [3,1], [6,3], [4,6], [1,5], [0,3], [2,2], [4,0]];

  function clearTimer() {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
  }
  function removeNode() {
    if (node?.parentNode) node.parentNode.removeChild(node);
  }
  function stopObserving() {
    if (observer) observer.disconnect();
    observedBody = null;
  }
  function observeBody() {
    if (observerFailed || !win.MutationObserver || !doc.body) return false;
    if (observedBody === doc.body) return true;
    try {
      if (!observer) observer = new win.MutationObserver(refresh);
      observer.disconnect();
      // Only body replacement, body classes and our direct child's removal
      // matter. Do not observe every player render in the subtree.
      if (doc.documentElement) observer.observe(doc.documentElement, {childList: true});
      observer.observe(doc.body, {childList: true, attributes: true, attributeFilter: ['class']});
      observedBody = doc.body;
      return true;
    } catch (_) {
      observerFailed = true;
      stopObserving();
      return false;
    }
  }
  function applyAppearance(date) {
    const width = Number(win.innerWidth) > 0 ? Number(win.innerWidth) : 1920;
    const height = Number(win.innerHeight) > 0 ? Number(win.innerHeight) : 1080;
    const size = Math.max(20, Math.round(height * .028));
    const shift = shifts[Math.floor(Math.max(0, date.getTime() - shiftStarted) / shiftInterval) % shifts.length];
    const scale = height / 720;
    // The menu already supplies its essential appearance inline. Do the same
    // for the clock: a removed/replaced stylesheet must not make it invisible.
    const style = {
      position: 'fixed', display: 'block', visibility: 'visible', opacity: '1',
      top: `${Math.round(height * .05 + shift[0] * scale)}px`, right: `${Math.round(width * .05 + shift[1] * scale)}px`,
      bottom: 'auto', left: 'auto', width: `${Math.round(size * 4.1)}px`,
      height: `${Math.round(size * 1.3)}px`, boxSizing: 'border-box', margin: '0',
      zIndex: '2147483647', pointerEvents: 'none', color: '#fff',
      backgroundColor: 'transparent', padding: '0',
      borderRadius: '0', border: 'none',
      fontFamily: '"YTAF Inter", Arial, sans-serif', fontSize: `${size}px`,
      fontWeight: '400', lineHeight: `${Math.round(size * 1.3)}px`,
      whiteSpace: 'nowrap', textAlign: 'center', textShadow: 'none'
    };
    for (const key of Object.keys(style)) {
      if (node.style[key] !== style[key]) node.style[key] = style[key];
    }
  }
  function schedule(delay) {
    timer = win.setTimeout(refresh, delay);
  }
  function refresh() {
    if (disposed) return;
    clearTimer();
    const mode = clockDisplayMode(read('clockDisplay'));
    if (mode === 'off' || doc.hidden || doc.visibilityState === 'hidden') {
      status = mode !== 'off' ? 'background' : 'off';
      stopObserving();
      removeNode();
      return;
    }
    const observing = observeBody();
    const playingPage = doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH') || doc.body?.classList.contains('WEB_PAGE_TYPE_SHORTS');
    const menuOpen = playbackMenuVisible(doc, win);
    if (!doc.body || (playingPage && !menuOpen && !playbackTimelineVisible(doc, win))) {
      status = doc.body ? 'playback-hidden' : 'waiting-for-body';
      removeNode();
      // Visibility fades can happen without body mutations. Inspect only the
      // small set of timelines while on the player; never reveal controls.
      if (playingPage || !observing) schedule(playingPage ? 500 : 1000);
      return;
    }
    if (!node) {
      node = doc.createElement('div');
      node.id = 'ytaf-corner-clock';
      node.className = 'ytaf-corner-clock';
      node.setAttribute('aria-label', 'Current time');
    }
    const date = new (win.Date || Date)();
    applyAppearance(date);
    if (node.parentNode !== doc.body || (menuOpen && node !== doc.body.lastElementChild)) doc.body.appendChild(node);
    status = 'mounted';
    const text = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    if (node.textContent !== text) node.textContent = text;
    // Use wall time after resume or a system clock change; never count minutes.
    const untilMinute = 60000 - date.getSeconds() * 1000 - date.getMilliseconds();
    const untilShift = shiftInterval - Math.max(0, date.getTime() - shiftStarted) % shiftInterval;
    // Some runtime profiles have incomplete MutationObserver implementations.
    // One bounded repair timer also handles a body missing during startup.
    schedule(Math.min(untilMinute, untilShift, playingPage ? 500 : observing ? Infinity : 1000));
  }
  function listen(target, type, callback) {
    target.addEventListener(type, callback);
    listeners.push([target, type, callback]);
  }
  listen(doc, 'ytaf-config-changed', event => {
    if (event.detail?.key === 'clockDisplay') refresh();
  });
  listen(doc, 'visibilitychange', refresh);
  listen(doc, 'yt-navigate-finish', refresh);
  listen(win, 'pageshow', refresh);
  listen(win, 'hashchange', refresh);
  listen(win, 'focus', refresh);
  listen(win, 'resize', refresh);
  listen(doc, 'webOSRelaunch', refresh);
  listen(doc, 'ytaf-menu-opened', refresh);
  listen(doc, 'ytaf-menu-closed', refresh);
  const controller = {
    refresh,
    get status() { return status; },
    report() {
      const report = {
        mode: clockDisplayMode(read('clockDisplay')),
        status, mounted: Boolean(node?.parentNode && node.parentNode === doc.body),
        observer: observedBody ? 'active' : observerFailed || !win.MutationObserver ? 'fallback' : 'idle'
      };
      if (report.mounted) {
        report.time = node.textContent;
        try {
          const rect = node.getBoundingClientRect();
          report.bounds = [rect.left, rect.top, rect.width, rect.height].map(value => Math.round(value)).join(',');
          const style = win.getComputedStyle(node);
          report.display = style.display;
          report.visibility = style.visibility;
          report.zIndex = style.zIndex;
        } catch (_) { /* Geometry is optional on runtimes with partial CSSOM. */ }
      }
      return report;
    },
    destroy() {
      if (disposed) return;
      disposed = true; status = 'destroyed';
      clearTimer(); stopObserving(); removeNode();
      for (const [target, type, callback] of listeners) target.removeEventListener(type, callback);
      if (win.__ytafCornerClock === controller) delete win.__ytafCornerClock;
    }
  };
  win.__ytafCornerClock = controller;
  refresh();
  return controller;
}
