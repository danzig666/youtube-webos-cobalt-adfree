import {getCurrentVideoId} from './sponsorblock-channels.mjs';
export function seekTarget(video, value) {
  if (!Number.isFinite(value) || !video || video.readyState < 1) return null;
  const ranges = video.seekable;
  if (ranges?.length) {
    let nearest = null, distance = Infinity;
    for (let i=0; i<ranges.length; i++) {
      const start = ranges.start(i), end = ranges.end(i);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const candidate = Math.max(start, Math.min(Math.max(start, end - .1), value));
      if (Math.abs(candidate-value) < distance) {nearest = candidate; distance = Math.abs(candidate-value);}
    }
    return nearest;
  }
  return Number.isFinite(video.duration) && video.duration > 0
    ? Math.max(0, Math.min(video.duration - .1, value)) : null;
}
export function canSeekFromFocus(doc, video) {
  if (!doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH')) return false;
  const focused = doc.activeElement;
  if (!focused || focused === doc.body || focused === video) return true;
  for (let node=focused; node && node !== doc.body; node=node.parentElement) {
    const tag = (node.tagName || '').toUpperCase(), role = node.getAttribute?.('role');
    if (['INPUT','TEXTAREA','SELECT'].includes(tag) || node.isContentEditable ||
        ['textbox','searchbox','combobox','dialog','menu','listbox'].includes(role)) return false;
    if (role === 'slider' || tag === 'YTLR-PROGRESS-BAR') {
      return /(?:progress|seek|scrub|timeline)/i.test([tag,node.id,node.className,node.getAttribute?.('aria-label')].join(' '));
    }
    if (['button','link','option','menuitem'].includes(role) || ['BUTTON','A'].includes(tag)) return false;
    // YouTube focuses its watch host while the native controls are hidden.
    if (node.id === 'ytlr-player__player-container-player' || ['YTLR-PLAYER','YTLR-WATCH-DEFAULT'].includes(tag)) return true;
  }
  return false;
}
export function createPlaybackSeek(doc, win, read, preview, notify, revealControls = () => null) {
  let pending = null, applied = null, revealed = null, timer = null, lastPress = 0, lastDirection = null;
  const held = new Set(), orphanedReleases = new Set();
  const now = () => win.Date?.now?.() ?? Date.now();
  const delays = {immediate: 500, delayed: 800, relaxed: 1000};
  function consume(event) {event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();}
  function releaseDirections() {
    for (const code of [37,39]) if (held.has(code)) {
      held.delete(code);orphanedReleases.add(code);
    }
  }
  function cancel() {if (timer !== null) win.clearTimeout(timer); timer=null;pending=null;applied=null;revealed=null;releaseDirections();preview(null);}
  function schedule() {
    if (timer !== null) win.clearTimeout(timer);
    // Wait until release, including the slower first repeat from a held remote
    // key. A lost release must still recover after two seconds without input.
    const delay = held.has(37) || held.has(39) ? 2000 : delays[read('seekBehavior')];
    timer = pending ? win.setTimeout(() => {
      releaseDirections();
      commit();
    }, delay || 500) : null;
  }
  function current(ticket) {
    return ticket && ticket.video === doc.querySelector('video') &&
      ticket.id === getCurrentVideoId(win, doc, false);
  }
  function seekFocus(ticket) {
    return canSeekFromFocus(doc, ticket?.video) || Boolean(current(ticket) &&
      ticket.controls?.contains?.(doc.activeElement));
  }
  function commit() {
    const ticket = pending;
    if (timer !== null) win.clearTimeout(timer);
    timer=null;pending=null;
    if (!current(ticket) || !seekFocus(ticket)) {applied=null;preview(null);return;}
    const value = seekTarget(ticket.video, ticket.target);
    if (value === null) {preview(null);return;}
    try {
      ticket.video.currentTime = value;
      applied = {...ticket,target:value,at:now()};
      preview(value,ticket.video,'applied');
    } catch (_) {applied=null;preview(null);notify('Could not seek. Use YouTube’s seek controls.',4000,'yellow');}
  }
  function handler(event, allowNew = true) {
    const code = event.keyCode || event.which || ({ArrowLeft:37,ArrowRight:39,Enter:13,Escape:27,BrowserBack:461,Backspace:8}[event.key]);
    if (orphanedReleases.has(code)) {
      if (event.type === 'keydown') orphanedReleases.delete(code);
      else {consume(event);if(event.type==='keyup')orphanedReleases.delete(code);return true;}
    }
    if (held.has(code) && event.type !== 'keydown') {
      consume(event);
      if(event.type==='keyup') {
        held.delete(code);lastDirection=null;
        if (pending && [37,39].includes(code)) schedule();
      }
      return true;
    }
    if (pending && [13,27,461,8].includes(code) && event.type === 'keydown') {
      consume(event);held.add(code);if(code===13)commit();else cancel();return true;
    }
    if (![37,39].includes(code) || event.type !== 'keydown') {
      if (event.type === 'keydown') cancel();
      return false;
    }
    if (!allowNew || !Object.prototype.hasOwnProperty.call(delays,read('seekBehavior')) ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {cancel();return false;}
    const video = doc.querySelector('video'), id = getCurrentVideoId(win, doc, false);
    const previous = current(pending) ? pending : current(applied) && now()-applied.at < 1000 ? applied : null;
    if (!video || !id || !(canSeekFromFocus(doc, video) || (current(revealed) && seekFocus(revealed)))) {cancel();return false;}
    // Avoid hammering native seek on unflagged repeats, while separate taps and
    // direction changes stay responsive. Accumulate against the latest request.
    if (held.has(code) && lastDirection === code && now()-lastPress < 100) {consume(event);schedule();return true;}
    const base = previous ? previous.target : Number(video.currentTime);
    const target = seekTarget(video, base+(code===39?10:-10));
    if (target === null) return false;
    consume(event);held.add(code);lastDirection=code;lastPress=now();
    const extending = current(pending);
    let controls = current(revealed) ? revealed.controls : null;
    const ticket = {id,video,target,controls};
    pending=ticket;
    // Show the requested position on this keydown, before asking YouTube to
    // reveal/rebuild its controls. Only the timer below changes playback time.
    preview(target,video);
    if (!extending) {
      try { controls = revealControls() || controls; } catch (_) { /* Keep our timeline usable. */ }
    }
    if (pending !== ticket) return true;
    if (controls) revealed = {id,video,controls};
    ticket.controls=controls;
    schedule();
    return true;
  }
  for (const type of ['loadedmetadata','emptied','ytaf-menu-opened','yt-navigate-finish']) doc.addEventListener(type,cancel,true);
  for (const type of ['pointerdown','mousedown']) doc.addEventListener(type,cancel,true);
  win.addEventListener('hashchange',cancel);
  win.addEventListener('blur',()=>{cancel();held.clear();orphanedReleases.clear();lastDirection=null;});
  doc.addEventListener('ytaf-config-changed',event=>{if(event.detail?.key==='seekBehavior')cancel();});
  doc.addEventListener('seeked',event=>{
    if (event.target === applied?.video && Math.abs(event.target.currentTime-applied.target)<1) applied=null;
  },true);
  handler.cancel=cancel;
  return handler;
}
