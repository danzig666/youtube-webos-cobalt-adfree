// Opt-in Magic Remote diagnostics. Lines are batched and appended by the native
// runtime to /tmp/ytaf-pointer.log so a tester can upload the file. Only
// geometry, element tag names, timings and key codes are recorded: never
// titles, URLs, video IDs or account data.
export const pointerLogPath = '/tmp/ytaf-pointer.log';

export function describeElement(node, win) {
  if (!node || !node.localName) return 'none';
  const tag = String(node.localName).replace(/[^a-z0-9-]/gi, '').slice(0, 40);
  let rect = null;
  try { rect = node.getBoundingClientRect?.(); } catch (_) { rect = null; }
  const box = rect && [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
    ? `@${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}` : '@?';
  let extra = '';
  if (node.hasAttribute?.('tabindex')) extra += ' tab';
  const transform = node.style?.getPropertyValue?.('transform');
  if (transform) extra += ' tf=' + String(transform).replace(/[^a-z0-9().,\- ]/gi, '').slice(0, 60);
  try {
    const style = win?.getComputedStyle?.(node);
    const overflow = style && (style.overflowX || style.overflow);
    if (overflow && overflow !== 'visible') extra += ' of=' + String(overflow).slice(0, 10);
  } catch (_) { /* Optional layout details. */ }
  return tag + box + extra;
}

export function describeChain(node, win, depth = 6) {
  const parts = [];
  for (let current = node, i = 0; current && current.localName && i < depth; current = current.parentElement, i++)
    parts.push(describeElement(current, win));
  return parts.join(' < ') || 'none';
}

export function createPointerLog(win, read, now = () => Date.now()) {
  const native = () => win.h5vcc?.system?.appendYtafPointerLog;
  let queue = [], timer = null, written = 0, failed = false, started = false;
  const api = {
    enabled: () => Boolean(read('pointerDiagnosticsLog')),
    available: () => typeof native() === 'function',
    status() {
      if (!api.enabled()) return 'Pointer log is off.';
      if (!api.available()) return 'Pointer log needs the updated native app.';
      if (failed) return `Could not write ${pointerLogPath}.`;
      return `Logging to ${pointerLogPath} (${written} lines this session).`;
    },
    line(text) {
      if (!api.enabled() || !api.available()) return;
      if (!started) {
        started = true;
        queue.push(`${now()} session ua=${String(win.navigator?.userAgent || '').replace(/[^\x20-\x7e]/g, '').slice(0, 160)} ` +
          `view=${win.innerWidth}x${win.innerHeight} dpr=${win.devicePixelRatio || 1}`);
      }
      queue.push(`${now()} ${text}`);
      if (queue.length > 400) queue = queue.slice(-400);
      if (timer === null) timer = win.setTimeout(api.flush, 500);
    },
    flush() {
      if (timer !== null) win.clearTimeout(timer);
      timer = null;
      if (!queue.length) return;
      const batch = queue.join('\n');
      const count = queue.length;
      queue = [];
      try {
        failed = !native()?.call(win.h5vcc.system, batch);
        if (!failed) written += count;
      } catch (_) { failed = true; }
    }
  };
  return api;
}
