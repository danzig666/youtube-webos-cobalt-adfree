// One stylesheet owns rendered caption size. Do not also ask YouTube's player
// API to change fontSize: it rerenders the same text at a second baseline.
export const captionSizeScale = { smallest: .6, small: .8, normal: 1, large: 1.25, extra: 1.5 };
const windows = '[class*="caption-window"], ytlr-caption-window, ytlr-caption-window-renderer';
const segments = '.ytp-caption-segment, .captions-text, .caption-segment, ytlr-caption-segment';
const attribute = 'data-ytaf-caption-text';
// Cobalt supports text-shadow, but not -webkit-text-stroke. Eight directions
// give a thin black outline around each letter, without a background box.
export const captionOutline = '-1px -1px 0 #000, 0 -1px 0 #000, 1px -1px 0 #000, -1px 0 0 #000, 1px 0 0 #000, -1px 1px 0 #000, 0 1px 0 #000, 1px 1px 0 #000';
export function startCaptionSizing(doc, win, read) {
  const marked = new Map();
  let sheet = null, observer = null, timer = null;
  let base = null, referenceHeight = null;
  let report = 'YouTube default text size.';
  const textSelector = segments + ',' + `[${attribute}]`;
  // Cover fresh cue nodes before MutationObserver sees them, including cues
  // replacing an entire window. Pixel sizes on parent/child never compound.
  const sizeSelector = textSelector + ',' + (windows + ',' + segments).split(',').map(s => s.trim() + ' *').join(',');
  const backgroundSelector = windows + ',' + sizeSelector;
  function rules(text) {
    if (sheet?.textContent === text && sheet.parentNode) return;
    const parent = sheet?.parentNode || doc.head || doc.documentElement;
    if (!doc.createElement || !parent?.appendChild) return;
    // Cobalt 23 HTMLStyleElement parses on insertion only. Filling an already
    // attached empty style, or editing its text later, does not update CSS.
    const replacement = doc.createElement('style');
    replacement.setAttribute?.('data-ytaf-caption-style', '');
    const nonce = doc.querySelector?.('style[nonce]')?.getAttribute('nonce');
    if (nonce) replacement.setAttribute('nonce', nonce);
    replacement.textContent = text;
    if (sheet?.parentNode) parent.replaceChild(replacement, sheet);
    else parent.appendChild(replacement);
    sheet = replacement;
  }
  function unmark(node, original) {
    if (original == null) node.removeAttribute?.(attribute);
    else node.setAttribute?.(attribute, original);
  }
  function apply() {
    const scale = captionSizeScale[read('captionSize')];
    const nodes = new Set(Array.from(doc.querySelectorAll(segments)).filter(node => !node.children?.length));
    for (const box of Array.from(doc.querySelectorAll(windows))) {
      for (const node of Array.from(box.querySelectorAll('*'))) {
        if (!node.children.length && node.textContent.trim()) nodes.add(node);
      }
    }
    for (const [node, original] of marked) {
      if (!doc.documentElement.contains(node) || !nodes.has(node)) {
        unmark(node, original); marked.delete(node);
      }
    }
    // Read the first untouched size, then retain it across cue replacement.
    // YouTube rewriting a cue or its parent must not redefine our scale.
    if (scale !== undefined && base === null) {
      for (const node of nodes) {
        const pixels = parseFloat(win.getComputedStyle(node).fontSize);
        if (Number.isFinite(pixels) && pixels > 0) {
          base = pixels; referenceHeight = win.innerHeight || 1; break;
        }
      }
    }
    for (const node of nodes) {
      if (!marked.has(node)) marked.set(node, node.getAttribute?.(attribute));
      if (node.getAttribute?.(attribute) !== '') node.setAttribute?.(attribute, '');
    }
    // Default leaves all YouTube styling intact. Custom sizes use a glyph
    // outline and clear cue/window backgrounds so no black bar remains.
    let requestedPixels = null;
    let css = '';
    if (scale !== undefined) {
      css += `${backgroundSelector}{background-color:transparent!important;background-image:none!important;}`;
      css += `${sizeSelector}{text-shadow:${captionOutline}!important;}`;
      if (base !== null) {
        const heightScale = (win.innerHeight || referenceHeight) / referenceHeight;
        const pixels = Math.round(base * heightScale * scale * 1000) / 1000;
        requestedPixels = pixels;
        css += `${sizeSelector}{font-size:${pixels}px!important;line-height:1.25!important;}`;
      }
    } else {
      // A later custom selection starts from the then-current YouTube size.
      base = referenceHeight = null;
    }
    rules(css);
    // Finding text or writing CSS does not prove that Cobalt applied it.
    // Read the computed font before reporting a successful size override.
    let verified = 0;
    if (requestedPixels !== null) {
      for (const node of nodes) {
        const actual = parseFloat(win.getComputedStyle(node).fontSize);
        if (Number.isFinite(actual) && Math.abs(actual - requestedPixels) < .5) verified++;
      }
    }
    const label = {smallest:'Extra small',small:'Small',normal:'Normal',large:'Large',extra:'Extra large'}[read('captionSize')];
    report = scale === undefined ? 'YouTube default text size.' : verified > 0
      ? `${label} caption text applied.` : nodes.size
      ? `${label} selected, but the caption renderer has not applied it.`
      : `${label} selected; waiting for visible caption text.`;
    return verified;
  }
  function relevant(records) {
    const selector = windows + ',' + segments;
    function ancestor(node) {
      for (let current = node; current; current = current.parentElement) {
        if (marked.has(current) || current.matches?.(selector)) return true;
      }
      return false;
    }
    return Array.from(records).some(record => ancestor(record.target) ||
      (record.type === 'childList' && Array.from(record.addedNodes).concat(Array.from(record.removedNodes))
        .some(node => ancestor(node) || node.querySelector?.(selector))));
  }
  function observe() {
    if (observer || !win.MutationObserver || !doc.documentElement) return;
    observer = new win.MutationObserver(records => {
      // Run within the mutation microtask, before the next paint. Do not wait
      // another animation frame and visibly flash YouTube's replacement size.
      if (relevant(records)) apply();
    });
    observer.observe(doc.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class']});
  }
  // Cobalt CSS property writes need not emit DOM attribute mutations. The
  // persistent rule handles them immediately; this scan discovers new leaves
  // on clients with incomplete mutation delivery. No inline style tug-of-war.
  function check() { apply(); timer = win.setTimeout?.(check, 250) ?? null; }
  function stop() {
    observer?.disconnect(); observer = null;
    if (timer !== null) win.clearTimeout?.(timer);
    timer = null;
    for (const [node, original] of marked) unmark(node, original);
    marked.clear(); sheet?.parentNode?.removeChild(sheet); sheet = null;
  }
  doc.addEventListener?.('ytaf-config-changed', event => {
    if (event.detail?.key === 'captionSize') apply();
  });
  win.addEventListener('resize', apply);
  win.addEventListener('pagehide', stop);
  win.addEventListener('pageshow', () => {
    observe(); apply();
    if (timer === null) timer = win.setTimeout?.(check, 250) ?? null;
  });
  observe();
  apply(); timer = win.setTimeout?.(check, 250) ?? null;
  return {refresh: apply, stop, report: () => report};
}
