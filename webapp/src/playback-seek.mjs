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
    if (node.id === 'ytlr-player__player-container-player' || tag === 'YTLR-PLAYER') return true;
  }
  return false;
}
export function createPlaybackSeek(doc, win, read, preview, notify) {
  let pending = null, applied = null, timer = null, lastPress = 0, lastDirection = null;
  const held = new Set();
  const now = () => win.Date?.now?.() ?? Date.now();
  function consume(event) {event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();}
  function cancel() {if (timer !== null) win.clearTimeout(timer); timer=null;pending=null;applied=null;preview(null);}
  function current(ticket) {
    return ticket && ticket.video === doc.querySelector('video') &&
      ticket.id === getCurrentVideoId(win, doc, false);
  }
  function commit() {
    const ticket = pending;
    if (timer !== null) win.clearTimeout(timer);
    timer=null;pending=null;preview(null);
    if (!current(ticket) || !canSeekFromFocus(doc, ticket.video)) {applied=null;return;}
    const value = seekTarget(ticket.video, ticket.target);
    if (value === null) return;
    try {
      ticket.video.currentTime = value;
      applied = {...ticket,target:value,at:now()};
    } catch (_) {applied=null;notify('Could not seek. Use YouTube’s seek controls.',4000,'yellow');}
  }
  function handler(event, allowNew = true) {
    const code = event.keyCode || event.which || ({ArrowLeft:37,ArrowRight:39,Enter:13,Escape:27,BrowserBack:461,Backspace:8}[event.key]);
    if (held.has(code) && event.type !== 'keydown') {
      consume(event);if(event.type==='keyup'){held.delete(code);lastDirection=null;}return true;
    }
    if (pending && [13,27,461,8].includes(code) && event.type === 'keydown') {
      consume(event);held.add(code);if(code===13)commit();else cancel();return true;
    }
    if (![37,39].includes(code) || event.type !== 'keydown') {
      if (event.type === 'keydown') cancel();
      return false;
    }
    if (!allowNew || read('seekBehavior') === 'youtube' || !['immediate','delayed'].includes(read('seekBehavior')) ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {cancel();return false;}
    const video = doc.querySelector('video'), id = getCurrentVideoId(win, doc, false);
    if (!video || !id || !canSeekFromFocus(doc, video)) {cancel();return false;}
    // Avoid hammering native seek on unflagged repeats, while separate taps and
    // direction changes stay responsive. Accumulate against the latest request.
    if (held.has(code) && lastDirection === code && now()-lastPress < 100) {consume(event);return true;}
    const base = current(pending) ? pending.target : current(applied) && now()-applied.at < 1000
      ? applied.target : Number(video.currentTime);
    const target = seekTarget(video, base+(code===39?10:-10));
    if (target === null) return false;
    consume(event);held.add(code);lastDirection=code;lastPress=now();
    pending={id,video,target};preview(target);
    if (timer !== null) win.clearTimeout(timer);
    if (read('seekBehavior') === 'immediate') commit();
    else timer=win.setTimeout(commit,300);
    return true;
  }
  for (const type of ['loadedmetadata','emptied','ytaf-menu-opened','yt-navigate-finish']) doc.addEventListener(type,cancel,true);
  win.addEventListener('hashchange',cancel);
  win.addEventListener('blur',()=>{cancel();held.clear();lastDirection=null;});
  doc.addEventListener('ytaf-config-changed',event=>{if(event.detail?.key==='seekBehavior')cancel();});
  doc.addEventListener('seeked',event=>{
    if (event.target === applied?.video && Math.abs(event.target.currentTime-applied.target)<1) applied=null;
  },true);
  handler.cancel=cancel;
  return handler;
}
