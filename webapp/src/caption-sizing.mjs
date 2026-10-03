// YouTube's caption text is often rendered in the DOM even when its TV player
// container does not expose the IFrame player's getOption/setOption methods.
export const captionSizeScale = { smallest: .6, small: .8, normal: 1, large: 1.25, extra: 1.5 };
const windows = '[class*="caption-window"], ytlr-caption-window, ytlr-caption-window-renderer';
const segments = '.ytp-caption-segment, .captions-text, .caption-segment, ytlr-caption-segment';
// Cobalt 23 has setProperty/cssText but does not expose getPropertyPriority.
function priority(style, key) {
  if (typeof style.getPropertyPriority === 'function') return style.getPropertyPriority(key);
  return new RegExp('(?:^|;)\\s*' + key + '\\s*:[^;]*!important\\s*(?:;|$)', 'i').test(style.cssText || '') ? 'important' : '';
}
function setStyle(style, key, value, level = '') {
  style.setProperty(key, value, level);
  // Cobalt 23 ignores setProperty's priority argument. Its cssText declaration
  // parser supports !important, so preserve other declarations through that API.
  if (level === 'important' && priority(style, key) !== level) {
    const without = (style.cssText || '').replace(new RegExp('(^|;)\\s*' + key + '\\s*:[^;]*', 'gi'), '$1');
    style.cssText = without + ';' + key + ':' + value + ' !important;';
  }
}
export function startCaptionSizing(doc, win, read) {
  const originals = new Map();
  let observer = null, frame = null, watchdog = null, sheet = null, nextId = 0;
  const attribute = 'data-ytaf-caption-size';
  function rules(text) {
    if (!sheet && text && doc.createElement && (doc.head || doc.documentElement).appendChild) {
      sheet = doc.createElement('style');
      (doc.head || doc.documentElement).appendChild(sheet);
    }
    if (sheet && sheet.textContent !== text) sheet.textContent = text;
    if (sheet && !text) {sheet.parentNode?.removeChild(sheet);sheet = null;}
  }
  function restore(node, value) {
    if (value.attribute === null) node.removeAttribute?.(attribute);
    else if (value.attribute !== undefined) node.setAttribute?.(attribute, value.attribute);
    for (const key of ['font-size', 'line-height']) {
      const item = value[key];
      if (item.value) setStyle(node.style, key, item.value, item.priority);
      else node.style.removeProperty(key);
    }
  }
  function apply() {
    const scale = captionSizeScale[read('captionSize')];
    for (const [node, value] of originals) {
      if (scale === undefined || !doc.documentElement.contains(node)) {
        restore(node, value); originals.delete(node);
      }
    }
    if (scale === undefined) {rules('');return 0;}
    // Capture every baseline before changing any fonts, and style text leaves
    // rather than both an inherited parent and its children.
    const nodes = new Set(Array.from(doc.querySelectorAll(segments)).filter(node => !node.children?.length));
    for (const window of Array.from(doc.querySelectorAll(windows))) {
      // Style text leaves too: TV renderers may put an explicit size on children.
      for (const node of Array.from(window.querySelectorAll('*'))) {
        if (!node.children.length && node.textContent.trim()) nodes.add(node);
      }
    }
    for (const [node, value] of originals) {
      if (!nodes.has(node)) {restore(node,value);originals.delete(node);}
    }
    for (const node of nodes) {
      if (!originals.has(node)) {
        const base = parseFloat(win.getComputedStyle(node).fontSize);
        if (!Number.isFinite(base) || base <= 0) continue;
        const value = {base, id: ++nextId, attribute: node.getAttribute?.(attribute)};
        for (const key of ['font-size', 'line-height']) value[key] = {
          value: node.style.getPropertyValue(key), priority: priority(node.style, key)
        };
        originals.set(node, value);
      }
    }
    const declarations = [];
    for (const node of nodes) {
      if (!originals.has(node)) continue;
      const pixels = `${Math.round(originals.get(node).base * scale * 1000) / 1000}px`;
      const id = String(originals.get(node).id);
      if (node.getAttribute?.(attribute) !== id) node.setAttribute?.(attribute, id);
      declarations.push(`[${attribute}="${id}"]{font-size:${pixels}!important;line-height:1.25!important;}`);
      // Avoid a MutationObserver loop from repeatedly setting the same style.
      if (node.style.getPropertyValue('font-size') !== pixels || priority(node.style, 'font-size') !== 'important') {
        setStyle(node.style, 'font-size', pixels, 'important');
      }
      if (node.style.getPropertyValue('line-height') !== '1.25' || priority(node.style, 'line-height') !== 'important')
        setStyle(node.style, 'line-height', '1.25', 'important');
    }
    // YouTube's normal inline writes cannot override this persistent rule.
    rules(declarations.join('\n'));
    return originals.size;
  }
  function check() {
    watchdog = null;
    if (captionSizeScale[read('captionSize')] === undefined) return;
    apply();
    watchdog = win.setTimeout?.(check, 250) ?? null;
  }
  function refresh() {
    if (captionSizeScale[read('captionSize')] === undefined) {
      observer?.disconnect(); observer = null;
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      if (watchdog !== null) win.clearTimeout?.(watchdog);
      watchdog = null;
    } else if (!observer && win.MutationObserver && doc.documentElement) {
      observer = new win.MutationObserver(records => {
        const selector = windows + ',' + segments;
        function captionAncestor(node) {
          for (let current = node; current; current = current.parentElement) {
            if (originals.has(current) || current.matches?.(selector)) return true;
          }
          return false;
        }
        const relevant = Array.from(records).some(record => {
          if (captionAncestor(record.target)) return true;
          if (record.type !== 'childList') return false;
          return Array.from(record.addedNodes).concat(Array.from(record.removedNodes))
            .some(node => captionAncestor(node) || node.querySelector?.(selector));
        });
        if (!relevant) return;
        if (frame !== null) return;
        frame = win.requestAnimationFrame(() => { frame = null; apply(); });
      });
      observer.observe(doc.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class']});
    }
    // Cobalt's direct CSSStyleDeclaration writes need not emit an attribute
    // mutation. Keep a bounded check active only for a custom caption size.
    if (captionSizeScale[read('captionSize')] !== undefined && watchdog === null)
      watchdog = win.setTimeout?.(check, 250) ?? null;
    return apply();
  }
  doc.addEventListener?.('ytaf-config-changed', event => {
    if (event.detail?.key === 'captionSize') refresh();
  });
  win.addEventListener('resize', refresh);
  refresh();
  return {refresh};
}
