import {getCurrentVideoId} from './sponsorblock-channels.mjs';

const controlsSelector = 'yt-focus-container[idomkey="controls"]';

// Return null when layout cannot be inspected; unknown layout is not evidence
// that it is safe to send OK (which can pause playback on visible controls).
function visible(node, doc, win) {
  if (!node || !doc.documentElement?.contains(node)) return null;
  for (let parent = node; parent; parent = parent.parentElement) {
    const style = win.getComputedStyle(parent);
    if (!style) return null;
    if (style.display === 'none' || style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        (style.opacity !== '' && style.opacity !== undefined && Number(style.opacity) === 0)) return false;
  }
  const rect = node.getBoundingClientRect?.();
  if (!rect || ![rect.width, rect.height, rect.top, rect.bottom, rect.left, rect.right,
    win.innerWidth, win.innerHeight].every(Number.isFinite)) return null;
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 &&
    rect.right > 0 && rect.top < win.innerHeight && rect.left < win.innerWidth;
}

function playbackFocus(doc, video) {
  const focused = doc.activeElement;
  if (!focused || focused === doc.body || focused === video) return true;
  for (let node = focused; node && node !== doc.body; node = node.parentElement) {
    const tag = (node.tagName || '').toUpperCase(), role = node.getAttribute?.('role');
    if (node.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag) ||
        ['textbox', 'searchbox', 'combobox', 'dialog', 'menu', 'listbox', 'button', 'link', 'option', 'menuitem'].includes(role)) return false;
    if (node.id === 'ytlr-player__player-container-player' ||
        ['YTLR-PLAYER', 'YTLR-WATCH-DEFAULT'].includes(tag)) return true;
  }
  return false;
}

export function createPlaybackControlsReveal(doc, win) {
  const synthetic = new WeakSet();
  let session = null, attempts = 0, lastAttempt = -Infinity, windowStarted = -Infinity, successCheck = null;
  function clearSuccessCheck() {
    if (successCheck !== null) win.clearTimeout(successCheck);
    successCheck = null;
  }
  function reset() {
    clearSuccessCheck();
    session = null; attempts = 0; lastAttempt = -Infinity; windowStarted = -Infinity;
  }
  function observeSuccess(request) {
    try {
      if (session !== request || request.video !== doc.querySelector('video') ||
          request.id !== getCurrentVideoId(win, doc, false) ||
          request.controls !== doc.querySelector(controlsSelector)) return false;
      if (visible(request.controls, doc, win) === true ||
          Array.from(request.controls.querySelectorAll('[idomkey="progress-bar"], [role="slider"], [role="button"], button'))
            .some(child => visible(child, doc, win) === true)) {
        reset(); return true;
      }
    } catch (_) { /* A failed layout read must not trigger another Enter. */ }
    return false;
  }
  function show() {
    try {
      if (!doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH') ||
          doc.body.classList.contains('WEB_PAGE_TYPE_SHORTS')) return null;
      const video = doc.querySelector('video'), id = getCurrentVideoId(win, doc, false);
      if (!video || video.readyState < 1 || !id) return null;
      for (const overlay of doc.querySelectorAll('.ytaf-ui-container, [role="dialog"], [role="menu"], [role="listbox"]')) {
        // An uninspectable overlay might be interactive; fail closed.
        if (visible(overlay, doc, win) !== false) return null;
      }
      const controls = doc.querySelector(controlsSelector);
      if (!controls) return null;
      const shown = visible(controls, doc, win);
      if (shown === null) return null;
      if (shown) { reset(); return null; }
      // Some containers have zero geometry while their children overflow.
      // Do not treat that as hidden if a real button/timeline is still visible.
      for (const child of controls.querySelectorAll('[idomkey="progress-bar"], [role="slider"], [role="button"], button')) {
        const childShown = visible(child, doc, win);
        if (childShown !== false) {
          if (childShown) reset();
          return null;
        }
      }
      // Revealing controls often focuses one of their buttons. Observe that
      // success above before protecting interactive focus from another Enter.
      if (!playbackFocus(doc, video)) return null;
      const now = win.Date?.now?.() ?? Date.now();
      if (!session || session.video !== video || session.id !== id || session.controls !== controls) {
        reset(); session = {video, id, controls}; windowStarted = now;
      }
      // A slow renderer can show and hide between observations. Bound ignored
      // attempts within ten seconds, without permanently disabling the feature.
      if (now - windowStarted >= 10000) { attempts = 0; windowStarted = now; }
      if (attempts >= 2 || now - lastAttempt < 1500) return null;
      attempts++; lastAttempt = now;

      // NicholasBly/youtube-webos reveals the chapter/timeline UI using Enter:
      // https://github.com/NicholasBly/youtube-webos/blob/78a374a32774b92a2094e1cda8db4da0d83540d4/src/ui.js#L803-L809
      // Only use this while the known controls are actually hidden. Never send
      // another Enter to visible controls or force their CSS visibility.
      const events = ['keydown', 'keyup'].map(type => {
        const event = new win.KeyboardEvent(type, {bubbles: true, cancelable: true,
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, charCode: 0});
        // Older KeyboardEvent constructors may ignore legacy numeric fields.
        for (const key of ['keyCode', 'which']) {
          if (event[key] !== 13) Object.defineProperty(event, key, {get: () => 13});
        }
        synthetic.add(event);
        return event;
      });
      let dispatched = false;
      const request = session;
      try { doc.body.dispatchEvent(events[0]); dispatched = true; }
      finally { doc.body.dispatchEvent(events[1]); }
      if (session === request && !observeSuccess(request)) {
        clearSuccessCheck();
        // One bounded observation handles asynchronous YouTube rendering; it
        // never dispatches a key or schedules any further work.
        successCheck = win.setTimeout(() => {
          successCheck = null;
          observeSuccess(request);
        }, 600);
      }
      return dispatched ? controls : null;
    } catch (_) { return null; }
  }
  show.isSynthetic = event => synthetic.has(event);
  show.reset = reset;
  win.addEventListener('hashchange', reset);
  win.addEventListener('blur', reset);
  for (const type of ['yt-navigate-finish', 'emptied', 'loadedmetadata']) doc.addEventListener(type, reset, true);
  return show;
}
