function clock(value) {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(hours ? 2 : 1, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function seekTimeline(video) {
  if (Number.isFinite(video?.duration) && video.duration > 0) return {start: 0, end: video.duration};
  const ranges = video?.seekable;
  if (!ranges?.length) return null;
  const start = ranges.start(0), end = ranges.end(ranges.length - 1);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? {start, end} : null;
}

// Keep the pending destination visible independently of YouTube's asynchronous
// controls. Their renderer can reveal, move or replace the track after keydown.
export function createSeekPreview(doc, win) {
  let root = null, fill, current, marker, label, timeout = null, frame = null;
  let video, target, revision = 0;
  function clear() {
    revision++;
    if (timeout !== null) win.clearTimeout(timeout);
    if (frame !== null) win.clearTimeout(frame);
    timeout = frame = null;
    if (root?.parentNode) root.parentNode.removeChild(root);
    root = null;
  }
  function trackBounds(width, height) {
    try {
      // Some Cobalt collections only expose indexed entries. No iterator is
      // needed here, and an unavailable YouTube layout cannot hide our rail.
      const nodes = doc.querySelectorAll('[idomkey="progress-bar"] [idomkey="slider"], ytlr-progress-bar [role="slider"], [idomkey="progress-bar"] [idomkey="cue-ranges"], [idomkey="progress-bar"] [idomkey="segment"]');
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i], bounds = node.getBoundingClientRect();
        if (![bounds.left, bounds.top, bounds.width, bounds.height, bounds.bottom].every(Number.isFinite) ||
            bounds.width < width / 4 || bounds.height <= 0 || bounds.bottom <= 0 ||
            bounds.top >= height || bounds.left >= width || bounds.left + bounds.width <= 0) continue;
        let visible = true;
        for (let parent = node; parent; parent = parent.parentElement) {
          const style = win.getComputedStyle(parent);
          if (!style || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
              (style.opacity !== '' && style.opacity !== undefined && Number(style.opacity) === 0)) {visible = false; break;}
        }
        if (visible) return bounds;
      }
    } catch (_) { /* The independent fallback is already visible. */ }
    return null;
  }
  function draw(range, rect, width, height) {
    const left = rect ? Math.max(0, rect.left) : width * .08;
    const trackWidth = rect ? Math.min(rect.width, width - left) : width * .84;
    root.style.left = `${left}px`;
    root.style.width = `${trackWidth}px`;
    root.style.top = `${rect ? Math.max(80, Math.min(height - 30, rect.top + rect.height / 2 - 3)) : height * .86}px`;
    root.className = `ytaf-seek-preview${rect ? ' ytaf-seek-preview-native' : ''}`;
    const ratio = value => Math.max(0, Math.min(1, (value - range.start) / (range.end - range.start)));
    const fraction = ratio(target);
    fill.style.width = `${fraction * 100}%`;
    marker.style.left = `${fraction * 100}%`;
    current.style.left = `${ratio(Number(video.currentTime)) * 100}%`;
    label.style.left = `${Math.max(150, Math.min(trackWidth - 150, fraction * trackWidth))}px`;
    const text = `Seek to ${clock(target)} / ${clock(range.end)}`;
    if (label.textContent !== text) label.textContent = text;
  }
  function layout() {
    if (!root) return false;
    let range;
    try { range = seekTimeline(video); } catch (_) { clear(); return false; }
    if (!range || !doc.body) { clear(); return false; }
    const width = win.innerWidth, height = win.innerHeight;
    // Always mount and draw a usable rail before inspecting YouTube controls.
    // A previous rendering pass may have removed our body child entirely.
    if (root.parentNode !== doc.body) doc.body.appendChild(root);
    draw(range, null, width, height);
    const rect = trackBounds(width, height);
    if (rect) draw(range, rect, width, height);
    return true;
  }
  function follow() {
    const ticket = revision;
    frame = win.setTimeout(() => {
      if (ticket !== revision) return;
      frame = null;
      if (layout()) follow();
    }, 100);
  }
  return (value, element, phase = 'pending') => {
    if (value === null) {clear(); return;}
    video = element; target = value;
    if (!root) {
      root = doc.createElement('div');
      root.setAttribute('role', 'status');
      // The remote may be used before the injected stylesheet has loaded. Keep
      // the actual rail, marker and time readable without any external CSS.
      Object.assign(root.style, {position: 'fixed', zIndex: '2147483646', height: '6px',
        display: 'block', visibility: 'visible', opacity: '1', background: '#627184', pointerEvents: 'none'});
      const parts = [
        ['fill', {left: '0', top: '0', height: '6px', background: '#65b9ff'}],
        ['current', {top: '-4px', width: '3px', height: '14px', background: '#fff'}],
        ['marker', {top: '-7px', marginLeft: '-10px', width: '20px', height: '20px', borderRadius: '10px', background: '#85c5ff'}],
        ['label', {bottom: '24px', marginLeft: '-150px', width: '300px', padding: '8px 0',
          background: '#101e30', color: '#fff', textAlign: 'center', font: '24px/1.4 "YTAF Inter",Arial,sans-serif'}]
      ];
      const children = parts.map(([name, style]) => {
        const child = doc.createElement('div');
        child.className = `ytaf-seek-${name}`;
        Object.assign(child.style, {position: 'absolute', display: 'block'}, style);
        root.appendChild(child);
        return child;
      });
      [fill, current, marker, label] = children;
    }
    if (!layout()) return;
    if (timeout !== null) win.clearTimeout(timeout);
    timeout = null;
    // Pending feedback lasts as long as the seek gesture, including a held key.
    // The seek controller owns cancellation and lost-keyup recovery.
    if (phase === 'applied') timeout = win.setTimeout(clear, 900);
    if (frame === null) follow();
  };
}
