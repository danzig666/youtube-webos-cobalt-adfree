// Inspired by the optional top-right clock in NicholasBly/youtube-webos:
// https://github.com/NicholasBly/youtube-webos/blob/78a374a32774b92a2094e1cda8db4da0d83540d4/src/watch.js
// This controller is independent of YouTube's renderer and player callbacks.
export function installCornerClock(doc, win, read) {
  if (win.__ytafCornerClock) return win.__ytafCornerClock;
  let node = null, timer = null, observer = null, observedBody = null;
  let disposed = false;
  const listeners = [];

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
    if (!win.MutationObserver || !doc.body || observedBody === doc.body) return;
    if (!observer) observer = new win.MutationObserver(refresh);
    observer.disconnect();
    // No subtree scan: only body replacement, body class navigation and removal
    // of our direct child matter. Player rendering cannot flood this observer.
    if (doc.documentElement) observer.observe(doc.documentElement, {childList: true});
    observer.observe(doc.body, {childList: true, attributes: true, attributeFilter: ['class']});
    observedBody = doc.body;
  }
  function refresh() {
    if (disposed) return;
    clearTimer();
    const mode = read('clockDisplay');
    if (!['browsing', 'always'].includes(mode) || doc.hidden || doc.visibilityState === 'hidden') {
      stopObserving();
      removeNode();
      return;
    }
    observeBody();
    if (!doc.body || (mode === 'browsing' && doc.body.classList.contains('WEB_PAGE_TYPE_WATCH'))) {
      removeNode();
      return;
    }
    if (!node) {
      node = doc.createElement('div');
      node.id = 'ytaf-corner-clock';
      node.className = 'ytaf-corner-clock';
      node.setAttribute('aria-label', 'Current time');
    }
    if (node.parentNode !== doc.body) doc.body.appendChild(node);
    const date = new (win.Date || Date)();
    const text = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    if (node.textContent !== text) node.textContent = text;
    // Use wall time after resume or a system clock change; never count minutes.
    timer = win.setTimeout(refresh, 60000 - date.getSeconds() * 1000 - date.getMilliseconds());
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
  const controller = {
    refresh,
    destroy() {
      if (disposed) return;
      disposed = true;
      clearTimer(); stopObserving(); removeNode();
      for (const [target, type, callback] of listeners) target.removeEventListener(type, callback);
      if (win.__ytafCornerClock === controller) delete win.__ytafCornerClock;
    }
  };
  win.__ytafCornerClock = controller;
  refresh();
  return controller;
}
