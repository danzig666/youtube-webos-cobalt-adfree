// The TV's CSS-background thumbnail hosts are also used by NicholasBly's
// thumbnail-quality.js (78a374a). Keep matching independent of obfuscated CSS.
export const thumbnailProgressSelector = 'ytlr-thumbnail-details, ytlr-surface-page, thumbnail image, ytlr-tile-renderer img, ytlr-grid-video-renderer img, ytd-rich-grid-media img, ytd-video-renderer img';
const cardSelector = 'ytlr-tile-renderer, ytlr-grid-video-renderer, ytd-rich-grid-media, ytd-video-renderer';
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);

function imageId(node) {
  const value = `${node.style?.backgroundImage || ''} ${node.getAttribute?.('src') || ''}`;
  const pattern = /(?:^|[\s("'])https:\/\/(?:i|i\d)\.ytimg\.com\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//g;
  let match, id = null;
  while ((match = pattern.exec(value))) {
    if (id && id !== match[1]) return false;
    id = match[1];
  }
  return id;
}
function identity(node) {
  const image = imageId(node), card = node.closest?.(cardSelector);
  if (image === false) return null;
  const data = card?.__instance?.props?.data;
  const endpoint = data?.onSelectCommand?.watchEndpoint?.videoId ||
    data?.navigationEndpoint?.watchEndpoint?.videoId || data?.command?.watchEndpoint?.videoId;
  const explicit = card?.getAttribute?.('data-video-id');
  const cardId = validId(endpoint) ? endpoint : validId(explicit) ? explicit : null;
  // Recycled cards can briefly retain their previous image. Never decorate a
  // new video's card with the previous video's progress during that interval.
  if (cardId && image && cardId !== image) return null;
  return image || cardId;
}
function sameBounds(a, b) {
  return ['left', 'top', 'width', 'height'].every(key => Math.abs(a[key] - b[key]) <= 2);
}

// Decoration only: never changes a YouTube endpoint, model, focus or scroll.
// The controller supplies confirmed playback snapshots, not requested seeks.
export function createThumbnailProgressView(doc, win) {
  const records = new Map();
  function remove(host, record) {
    if (record.rail.parentNode) record.rail.parentNode.removeChild(record.rail);
    if (record.positionChanged && host.style.position === 'relative') host.style.position = record.position;
    records.delete(host);
  }
  function clear() { for (const [host, record] of records) remove(host, record); }
  function visible(node, rect) {
    if (!doc.documentElement?.contains(node) ||
        !['left', 'top', 'width', 'height'].every(key => Number.isFinite(rect[key])) ||
        rect.width < 80 || rect.height < 40 || rect.width > win.innerWidth * .6 ||
        rect.height > win.innerHeight * .6 || rect.width / rect.height < 1.2 ||
        rect.width / rect.height > 2.8 || rect.left >= win.innerWidth || rect.top >= win.innerHeight ||
        rect.left + rect.width <= 0 || rect.top + rect.height <= 0) return false;
    for (let parent = node, depth = 0; parent && depth < 32; parent = parent.parentElement, depth++) {
      const style = win.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
          (style.opacity !== '' && style.opacity !== undefined && Number(style.opacity) === 0)) return false;
    }
    return true;
  }
  function render(snapshots) {
    const samples = new Map();
    for (const sample of (Array.isArray(snapshots) ? snapshots : []).slice(0, 20)) {
      if (validId(sample?.id) && Number.isFinite(sample.position) && sample.position >= 0 &&
          Number.isFinite(sample.duration) && sample.duration > 0 && sample.position <= sample.duration)
        samples.set(sample.id, sample);
    }
    if (!samples.size || doc.hidden) { clear(); return 0; }
    const retained = new Set();
    let nodes;
    try { nodes = doc.querySelectorAll(thumbnailProgressSelector); } catch (_) { clear(); return 0; }
    // Indexed iteration works with Cobalt's non-iterable DOM collections.
    for (let i = 0; i < nodes.length && i < 200 && retained.size < 50; i++) {
      try {
        const node = nodes[i], id = identity(node), sample = samples.get(id);
        if (!sample) continue;
        const rect = node.getBoundingClientRect();
        if (!visible(node, rect)) continue;
        let host = node;
        // Replaced IMG/SVG image elements cannot render an HTML child. Use a
        // matching thumbnail wrapper; never assume the whole card is its image.
        if (['IMG', 'IMAGE'].includes(String(node.tagName).toUpperCase()) ||
            (node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/1999/xhtml')) {
          host = node.parentElement;
          if (!host || !sameBounds(rect, host.getBoundingClientRect())) continue;
        }
        if (retained.has(host)) continue;
        let record = records.get(host);
        if (record && (record.id !== id || record.rail.parentNode !== host)) { remove(host, record); record = null; }
        if (!record) {
          const rail = doc.createElement('div'), fill = doc.createElement('div');
          rail.className = 'ytaf-thumbnail-progress';
          rail.setAttribute('aria-hidden', 'true');
          Object.assign(rail.style, {position: 'absolute', left: '0', right: '0', bottom: '0', height: '4px',
            display: 'block', visibility: 'visible', background: '#404040', pointerEvents: 'none', zIndex: '1000'});
          Object.assign(fill.style, {position: 'absolute', left: '0', top: '0', height: '4px',
            display: 'block', background: '#ff0033', pointerEvents: 'none'});
          rail.appendChild(fill);
          const position = host.style.position || '', computed = win.getComputedStyle(host).position;
          const positionChanged = !computed || computed === 'static';
          if (positionChanged) host.style.position = 'relative';
          record = {id, rail, fill, position, positionChanged};
          records.set(host, record);
          host.appendChild(rail);
        }
        const width = `${sample.ended ? 100 : Math.max(0, Math.min(100, sample.position / sample.duration * 100))}%`;
        if (record.fill.style.width !== width) record.fill.style.width = width;
        retained.add(host);
      } catch (_) { /* A renderer replaced during this pass is retried later. */ }
    }
    for (const [host, record] of records) if (!retained.has(host)) remove(host, record);
    return retained.size;
  }
  return {render, clear};
}
