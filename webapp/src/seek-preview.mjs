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

// Draw a transient marker over the visible YouTube track without changing its
// renderer state. When controls are hidden, provide our own playback timeline.
export function createSeekPreview(doc, win) {
  let root = null, fill, current, marker, label, timeout = null, video, target;
  function clear() {
    if (timeout !== null) win.clearTimeout(timeout);
    timeout = null;
    if (root?.parentNode) root.parentNode.removeChild(root);
    root = null;
  }
  function layout() {
    const range = seekTimeline(video);
    if (!range) {clear(); return;}
    const width = win.innerWidth, height = win.innerHeight;
    let rect = null;
    for (const node of doc.querySelectorAll('[idomkey="progress-bar"] [idomkey="segment"], [idomkey="progress-bar"] [idomkey="cue-ranges"], [idomkey="progress-bar"] [idomkey="slider"], ytlr-progress-bar [role="slider"]')) {
      const bounds = node.getBoundingClientRect();
      if (bounds.width < width / 4 || bounds.height <= 0 || bounds.bottom <= 0 || bounds.top >= height) continue;
      let visible = true;
      for (let parent = node; parent && parent !== doc.body; parent = parent.parentElement) {
        const style = win.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {visible = false; break;}
      }
      if (visible) {rect = bounds; break;}
    }
    const left = rect ? Math.max(0, rect.left) : width * .08;
    const trackWidth = rect ? Math.min(rect.width, width - left) : width * .84;
    root.style.left = `${left}px`;
    root.style.width = `${trackWidth}px`;
    root.style.top = `${rect ? Math.max(50, Math.min(height - 24, rect.top + rect.height / 2 - 3)) : height * .88}px`;
    root.className = `ytaf-seek-preview${rect ? ' ytaf-seek-preview-native' : ''}`;
    const ratio = value => Math.max(0, Math.min(1, (value - range.start) / (range.end - range.start)));
    const fraction = ratio(target);
    fill.style.width = `${fraction * 100}%`;
    marker.style.left = `${fraction * 100}%`;
    current.style.left = `${ratio(Number(video.currentTime)) * 100}%`;
    label.style.left = `${Math.max(130, Math.min(trackWidth - 130, fraction * trackWidth))}px`;
    label.textContent = `Seek to ${clock(target)} / ${clock(range.end)}`;
  }
  return (value, element, phase = 'pending') => {
    if (value === null) {clear(); return;}
    video = element; target = value;
    if (!root) {
      root = doc.createElement('div');
      root.setAttribute('role', 'status');
      for (const name of ['fill', 'current', 'marker', 'label']) {
        const child = doc.createElement('span');
        child.className = `ytaf-seek-${name}`;
        root.appendChild(child);
      }
      fill = root.children[0]; current = root.children[1];
      marker = root.children[2]; label = root.children[3];
      doc.body.appendChild(root);
    }
    layout();
    if (timeout !== null) win.clearTimeout(timeout);
    // Leave the destination visible briefly after the debounced native seek.
    timeout = win.setTimeout(clear, phase === 'applied' ? 900 : 2000);
  };
}
