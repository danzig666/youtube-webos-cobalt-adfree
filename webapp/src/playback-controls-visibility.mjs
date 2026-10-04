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

// Inspect real timeline geometry; the controls container itself can retain a
// full-screen rectangle while all of its controls are hidden.
export function playbackTimelineVisible(doc, win) {
  try {
    const nodes = doc.querySelectorAll('[idomkey="progress-bar"], ytlr-progress-bar, .ytaf-seek-preview');
    for (let index = 0; index < nodes.length && index < 12; index++)
      if (visible(nodes[index], doc, win) === true) return true;
  } catch (_) { /* Unknown layout must not put a clock over clean playback. */ }
  return false;
}

export function playbackMenuVisible(doc, win) {
  try {
    const nodes = doc.querySelectorAll('.ytaf-ui-container, .ytaf-choice-popup, [role="dialog"], [role="menu"], [role="listbox"]');
    for (let index = 0; index < nodes.length && index < 20; index++)
      if (visible(nodes[index], doc, win) === true) return true;
  } catch (_) { /* A missing menu is not evidence of visible controls. */ }
  return false;
}

function playbackFocus(doc, video, hiddenControls) {
  const focused = doc.activeElement;
  if (!focused || focused === doc.body || focused === video) return true;
  // YouTube retains focus on transport buttons after fading their parent.
  // Only accept that focus after every actual control was confirmed hidden.
  const retainedFocus = hiddenControls?.contains?.(focused);
  for (let node = focused; node && node !== doc.body; node = node.parentElement) {
    const tag = (node.tagName || '').toUpperCase(), role = node.getAttribute?.('role');
    if (node.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ||
        ['textbox', 'searchbox', 'combobox', 'dialog', 'menu', 'listbox'].includes(role)) return false;
    if (['BUTTON', 'A'].includes(tag) || ['button', 'link', 'option', 'menuitem'].includes(role)) return Boolean(retainedFocus);
    if (node.id === 'ytlr-player__player-container-player' ||
        ['YTLR-PLAYER', 'YTLR-WATCH-DEFAULT'].includes(tag)) return true;
  }
  return Boolean(retainedFocus);
}

export function createPlaybackControlsReveal(doc, win) {
  const synthetic = new WeakSet();
  let session = null, attempts = 0, lastAttempt = -Infinity, windowStarted = -Infinity, successCheck = null, inputCheck = null;
  let dispatchedPairs = 0;
  function clearSuccessCheck() {
    if (successCheck !== null) win.clearTimeout(successCheck);
    successCheck = null;
  }
  function reset() {
    clearSuccessCheck();
    if (inputCheck !== null) win.clearTimeout(inputCheck);
    inputCheck = null;
    session = null; attempts = 0; lastAttempt = -Infinity; windowStarted = -Infinity;
  }
  function controlsVisible(controls) {
    const children = Array.from(controls.querySelectorAll('[idomkey="progress-bar"], [role="slider"], [role="button"], button'));
    // The shell can keep full-screen geometry after its contents disappear.
    if (!children.length) return visible(controls, doc, win);
    const states = children.map(child => visible(child, doc, win));
    return states.includes(true) ? true : states.includes(null) ? null : false;
  }
  function observeSuccess(request) {
    try {
      if (session !== request || request.video !== doc.querySelector('video') ||
          request.id !== getCurrentVideoId(win, doc, false) ||
          request.controls !== doc.querySelector(controlsSelector)) return false;
      if (controlsVisible(request.controls) === true) { reset(); return true; }
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
      const shown = controlsVisible(controls);
      if (shown === null) return null;
      if (shown) { reset(); return null; }
      if (!playbackFocus(doc, video, controls)) return null;
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
      try { doc.body.dispatchEvent(events[0]); dispatched = true; dispatchedPairs++; }
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
  // Let the genuine arrow reach YouTube first. If it still leaves the actual
  // controls hidden, perform one bounded reveal, without consuming that key.
  show.handleKey = event => {
    const code = event.keyCode || event.which || {ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40}[event.key];
    if (event.type !== 'keydown' || ![37,38,39,40].includes(code) ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || inputCheck !== null) return;
    const video = doc.querySelector('video'), id = getCurrentVideoId(win, doc, false);
    if (!video || !id) return;
    inputCheck = win.setTimeout(() => {
      inputCheck = null;
      if (video === doc.querySelector('video') && id === getCurrentVideoId(win, doc, false)) show();
    }, 80);
  };
  show.report = () => ({attempts: dispatchedPairs, pending: inputCheck !== null});
  show.isSynthetic = event => synthetic.has(event);
  show.reset = reset;
  win.addEventListener('hashchange', reset);
  win.addEventListener('blur', reset);
  for (const type of ['yt-navigate-finish', 'emptied', 'loadedmetadata']) doc.addEventListener(type, reset, true);
  return show;
}
