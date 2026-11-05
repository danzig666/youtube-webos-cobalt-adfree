// Magic Remote edge scrolling, following PlxNative's EdgeScroll
// (danzig666/plx-native rust-modules/src/app/input.rs): a pointer resting in a
// screen-edge band moves the list after a short dwell, easing in, faster nearer
// the edge. The left/right bands move the row under the pointer; the top/bottom
// bands move between rows.
//
// PlxNative draws its own rows and pans them by pixels. YouTube TV's rows are
// virtual: only tiles near focus exist, and YouTube rewrites the row transform
// whenever focus changes. Pixel panning (2.6.46/2.6.47) therefore stopped after
// one screen. Here every step is YouTube's own arrow navigation, so YouTube
// loads tiles and animates the row itself; the edge band sets the step rate.
import { describeChain, describeElement } from './pointer-log.mjs';

export const edgeScrollTuning = {
  sideBand: 120, verticalBand: 80, // px at 1920x1080, as in PlxNative
  dwellMs: 150, rampMs: 350, minShare: 0.35,
  sideStepsPerSecond: 3.5, // PlxNative: 1000 px/s, about three and a half posters
  verticalStepsPerSecond: 2, tickMs: 50, stallLimit: 2
};

// Which band the pointer is in, and how deep (0 at the inner border, 1 at the edge).
export function edgeBand(x, y, width, height, tuning = edgeScrollTuning) {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const sx = width / 1920, sy = height / 1080;
  const vertical = tuning.verticalBand * sy, side = tuning.sideBand * sx;
  // The vertical bands take the corners, as in PlxNative.
  if (y < vertical) return {key: 'up', depth: 1 - y / vertical};
  if (y >= height - vertical) return {key: 'down', depth: 1 - (height - y) / vertical};
  if (x < side) return {key: 'left', depth: 1 - x / side};
  if (x >= width - side) return {key: 'right', depth: 1 - (width - x) / side};
  return null;
}

// Steps per second after `elapsed` ms in the band: nothing during the dwell,
// then a smoothstep ease-in to a rate that grows toward the edge.
export function edgeStepRate(key, depth, elapsed, tuning = edgeScrollTuning) {
  if (!(elapsed >= tuning.dwellMs)) return 0;
  const t = Math.min(1, (elapsed - tuning.dwellMs) / tuning.rampMs);
  const ramp = t * t * (3 - 2 * t);
  const share = tuning.minShare + (1 - tuning.minShare) * Math.max(0, Math.min(1, depth));
  const top = key === 'left' || key === 'right' ? tuning.sideStepsPerSecond : tuning.verticalStepsPerSecond;
  return top * share * ramp;
}

const keys = {left: ['ArrowLeft', 37], right: ['ArrowRight', 39], up: ['ArrowUp', 38], down: ['ArrowDown', 40]};
const overlays = '.ytaf-ui-container, .ytaf-choice-popup, [role="dialog"], [role="menu"], [role="listbox"]';

export function startPointerEdgeScroll(doc, win, read, log) {
  const tuning = edgeScrollTuning, synthetic = new WeakSet();
  const now = () => win.performance?.now?.() ?? Date.now();
  let point = null, band = null, timer = null, credit = 0, last = null, stalls = 0, paused = null;
  let menu = false, stopped = false, lastMoveLog = 0, lastFocus = null, steps = 0, check = null;
  const api = {status: 'Rest the pointer near a screen edge to scroll.', steps: () => steps,
    isSynthetic: event => synthetic.has(event), destroy};
  const enabled = () => !stopped && read('pointerEdgeScroll') !== false;

  function blockedReason() {
    if (!enabled()) return 'disabled';
    if (menu) return 'menu';
    if (doc.hidden || doc.visibilityState === 'hidden') return 'hidden';
    const body = doc.body?.classList;
    if (body?.contains('WEB_PAGE_TYPE_WATCH') || body?.contains('WEB_PAGE_TYPE_SHORTS')) return 'playback-page';
    const nodes = doc.querySelectorAll(overlays);
    for (let i = 0; i < nodes.length && i < 20; i++) {
      const style = win.getComputedStyle?.(nodes[i]);
      const r = nodes[i].getBoundingClientRect?.();
      if (style && style.display !== 'none' && style.visibility !== 'hidden' && r && r.width > 0 && r.height > 0)
        return 'overlay:' + String(nodes[i].localName || '').slice(0, 30);
    }
    return null;
  }
  function stop(reason) {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    if (check !== null) win.clearTimeout(check);
    check = null;
    if (band) log.line(`stop ${band.key} reason=${reason} steps=${band.steps}`);
    band = null; credit = 0; last = null; stalls = 0;
    api.status = reason === 'left-band' ? 'Rest the pointer near a screen edge to scroll.' : `Edge scrolling stopped: ${reason}.`;
  }
  function press(key) {
    const target = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : doc.body;
    const [name, code] = keys[key];
    for (const type of ['keydown', 'keyup']) {
      const event = new win.KeyboardEvent(type, {bubbles: true, cancelable: true, key: name, code: name,
        keyCode: code, which: code, charCode: 0});
      // Older KeyboardEvent constructors ignore the legacy numeric fields.
      for (const field of ['keyCode', 'which'])
        if (event[field] !== code) Object.defineProperty(event, field, {get: () => code});
      synthetic.add(event);
      target.dispatchEvent(event);
    }
    return target;
  }
  function stepOnce() {
    const before = doc.activeElement;
    const beforeRect = before?.getBoundingClientRect?.();
    // A sideways step must move the row under the pointer, not another row
    // that kept focus. YouTube's hover focus normally makes them the same.
    if ((band.key === 'left' || band.key === 'right') && beforeRect && point &&
        (point.y < beforeRect.top - 40 || point.y > beforeRect.bottom + 40)) {
      log.line(`skip ${band.key} focus-not-under-pointer pointer=${Math.round(point.x)},${Math.round(point.y)} focus=${describeElement(before, win)}`);
      api.status = 'Focused tile is not under the pointer; hover a tile first.';
      return;
    }
    const target = press(band.key);
    steps++; band.steps++;
    log.line(`step ${band.key} n=${band.steps} depth=${band.depth.toFixed(2)} target=${describeElement(target, win)}`);
    api.status = `Scrolling ${band.key}.`;
    if (check !== null) win.clearTimeout(check);
    const key = band.key, count = band.steps;
    check = win.setTimeout(() => {
      check = null;
      const after = doc.activeElement;
      const moved = after !== before;
      const afterRect = after?.getBoundingClientRect?.();
      const shifted = beforeRect && afterRect ? Math.round(afterRect.left - beforeRect.left) : 'n/a';
      log.line(`result ${key} n=${count} focusChanged=${moved} dx=${shifted} focus=${describeChain(after, win, 4)}`);
      if (!band || band.key !== key) return;
      stalls = moved ? 0 : stalls + 1;
      if (stalls >= tuning.stallLimit) {
        log.line(`end ${key} after ${count} steps (focus did not move twice)`);
        band.ended = true;
        api.status = 'End of the list reached.';
      }
    }, 260);
  }
  function tick() {
    timer = null;
    if (!band) return;
    const reason = blockedReason();
    if (reason) { stop(reason); return; }
    const time = now();
    const dt = last === null ? 0 : Math.min(0.1, (time - last) / 1000);
    last = time;
    if (!band.ended) {
      const rate = edgeStepRate(band.key, band.depth, time - band.since, tuning);
      if (rate > 0) {
        credit += rate * dt;
        if (credit >= 1) { credit -= 1; stepOnce(); }
      }
    }
    timer = win.setTimeout(tick, tuning.tickMs);
  }
  function move(event) {
    const x = event.clientX, y = event.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (point && point.x === x && point.y === y) return;
    point = {x, y};
    const time = now();
    if (time - lastMoveLog > 150 || doc.activeElement !== lastFocus) {
      lastMoveLog = time; lastFocus = doc.activeElement;
      log.line(`move ${event.type} ${Math.round(x)},${Math.round(y)} hit=${describeChain(event.target, win, 4)} focus=${describeElement(doc.activeElement, win)}`);
    }
    if (paused && Math.hypot(x - paused.x, y - paused.y) < 60) return;
    paused = null;
    if (!enabled() || event.buttons) { if (band) stop('buttons'); return; }
    const next = edgeBand(x, y, win.innerWidth, win.innerHeight, tuning);
    if (!next) { if (band) stop('left-band'); return; }
    if (band && band.key === next.key) { band.depth = next.depth; return; }
    if (band) stop('changed-band');
    const reason = blockedReason();
    if (reason) { log.line(`blocked ${next.key} reason=${reason}`); api.status = `Edge scrolling paused: ${reason}.`; return; }
    band = {key: next.key, depth: next.depth, since: time, steps: 0, ended: false};
    // The first step follows soon after the dwell instead of a full interval.
    credit = 0.6; last = null; stalls = 0;
    log.line(`enter ${next.key} depth=${next.depth.toFixed(2)} pointer=${Math.round(x)},${Math.round(y)} ` +
      `view=${win.innerWidth}x${win.innerHeight} focus=${describeChain(doc.activeElement, win, 6)}`);
    timer = win.setTimeout(tick, tuning.tickMs);
  }
  function key(event) {
    if (synthetic.has(event)) return;
    if (band) stop('remote-key');
    paused = point;
    log.line(`key ${event.keyCode || event.which || 0}`);
  }
  function interrupt(reason) { return () => { if (band) stop(reason); }; }
  const bindings = [
    [doc, 'pointermove', move, true], [doc, 'mousemove', move, true], [win, 'keydown', key, true],
    [doc, 'pointerdown', interrupt('pointer-down'), true], [doc, 'mousedown', interrupt('pointer-down'), true],
    [doc, 'wheel', interrupt('wheel'), true], [doc, 'mouseleave', () => { point = null; if (band) stop('pointer-left'); }, false],
    [win, 'blur', interrupt('blur'), false], [win, 'hashchange', interrupt('route'), false],
    [doc, 'yt-navigate-finish', interrupt('route'), false], [doc, 'visibilitychange', interrupt('hidden'), false],
    [doc, 'ytaf-menu-opened', () => { menu = true; if (band) stop('menu'); }, false],
    [doc, 'ytaf-menu-closed', () => { menu = false; }, false],
    [doc, 'ytaf-config-changed', event => {
      if (event.detail?.key === 'pointerEdgeScroll' && band) stop('disabled');
      if (event.detail?.key === 'pointerDiagnosticsLog') log.line(`log ${read('pointerDiagnosticsLog') ? 'on' : 'off'}`);
    }, false]
  ];
  for (const [owner, type, callback, capture] of bindings) owner.addEventListener(type, callback, capture);
  function destroy() {
    stopped = true; if (band) stop('destroyed');
    for (const [owner, type, callback, capture] of bindings) owner.removeEventListener?.(type, callback, capture);
  }
  return api;
}
