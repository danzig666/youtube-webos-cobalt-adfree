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
  verticalStepsPerSecond: 2, tickMs: 50, stallLimit: 2,
  glidePxPerSecond: 1000, // PlxNative EDGE_PAN_PX_PER_S at 1920 px wide
  glideSmoothingSeconds: 0.12
};

// The sideways glide's target speed in px/s (signed), as PlxNative's pan:
// nothing during the dwell, smoothstep ease-in, faster nearer the edge.
export function edgeGlideSpeed(dir, depth, elapsed, width, tuning = edgeScrollTuning) {
  if (!(elapsed >= tuning.dwellMs)) return 0;
  const t = Math.min(1, (elapsed - tuning.dwellMs) / tuning.rampMs);
  const share = tuning.minShare + (1 - tuning.minShare) * Math.max(0, Math.min(1, depth));
  return dir * tuning.glidePxPerSecond * (width / 1920) * share * t * t * (3 - 2 * t);
}

function translateX(transform, remPx) {
  const match = /translateX\((-?[\d.]+)(rem|px)\)/.exec(String(transform || ''));
  if (!match) return 0;
  return Number(match[1]) * (match[2] === 'rem' ? remPx : 1);
}

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

const tiles = 'ytlr-tile-renderer, ytlr-grid-video-renderer, ytlr-video-renderer, ytlr-compact-video-renderer';
// The focusable tile containing a pointer hit. Cobalt has matches(), no closest().
function tileAt(node) {
  for (let current = node, depth = 0; current && depth < 12; current = current.parentElement, depth++) {
    try {
      if (current.matches?.(tiles)) return current;
    } catch (_) { return null; }
  }
  return null;
}

const keys = {left: ['ArrowLeft', 37], right: ['ArrowRight', 39], up: ['ArrowUp', 38], down: ['ArrowDown', 40]};
const overlays = '.ytaf-ui-container, .ytaf-choice-popup, [role="dialog"], [role="menu"], [role="listbox"]';

export function startPointerEdgeScroll(doc, win, read, log) {
  const tuning = edgeScrollTuning, synthetic = new WeakSet();
  const now = () => win.performance?.now?.() ?? Date.now();
  let point = null, band = null, timer = null, credit = 0, last = null, stalls = 0, paused = null;
  let menu = false, stopped = false, lastMoveLog = 0, lastFocus = null, steps = 0, check = null;
  let glide = null;
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
  // ---- Sideways glide -------------------------------------------------
  // YouTube's row is a track (the child of yt-virtual-list) that YouTube
  // moves one tile per arrow press with translateX(…rem). The glide adds a
  // pixel offset to that track every frame. Whenever the offset passes half a
  // tile, one arrow press lets YouTube move focus, load tiles and shift its
  // track; the offset absorbs that shift in the same frame, so the row moves
  // continuously. Leaving the band eases the row back to YouTube's position.
  function remPx() {
    try {
      const size = parseFloat(win.getComputedStyle(doc.documentElement).fontSize);
      if (size > 0) return size;
    } catch (_) { /* fall back to YouTube TV's 1080p rem */ }
    return 24 * (win.innerWidth || 1920) / 1920;
  }
  function trackFor(node) {
    for (let current = node, depth = 0; current && depth < 10; current = current.parentElement, depth++)
      if (current.parentElement?.localName === 'yt-virtual-list') return current;
    return null;
  }
  function tileStep(track, rem) {
    const offsets = [];
    for (let i = 0; i < track.children.length && i < 40; i++) {
      const value = translateX(track.children[i].style?.getPropertyValue?.('transform'), rem);
      if (Number.isFinite(value) && offsets.indexOf(value) < 0) offsets.push(value);
    }
    offsets.sort((a, b) => a - b);
    let step = Infinity;
    for (let i = 1; i < offsets.length; i++) step = Math.min(step, offsets[i] - offsets[i - 1]);
    return step > 20 && step < 4000 ? step : 756 * (win.innerWidth || 1920) / 1920;
  }
  function readTransform(track) { return track.style.getPropertyValue('transform') || ''; }
  // Per track: YouTube's own transform and our offset, so a later glide (or
  // a resting row) continues from where the last one left it.
  const parked = new WeakMap();
  function startGlide(dir, track) {
    if (!track) return false;
    const rem = remPx();
    const current = readTransform(track), rest = parked.get(track);
    const resumed = rest && rest.written === current;
    glide = {track, dir, rem, f: resumed ? rest.f : 0, v: 0, last: null,
      base: resumed ? rest.base : current, written: current, pending: null, retryAt: 0,
      ended: 0, step: tileStep(track, rem), frames: 0, maxGap: 0, presses: 0, bounds: null, boundsAt: -1,
      transition: resumed ? rest.transition : track.style.getPropertyValue('transition')};
    log.line(`glide start ${dir > 0 ? 'right' : 'left'} step=${Math.round(glide.step)} rem=${rem} ` +
      `f=${Math.round(glide.f)} base=${glide.base.slice(0, 60)}`);
    api.status = `Scrolling ${dir > 0 ? 'right' : 'left'}.`;
    win.requestAnimationFrame(glideFrame);
    return true;
  }
  function endGlide(reason, release = false) {
    const g = glide;
    if (!g) return;
    glide = null;
    try {
      if (g.transition) g.track.style.setProperty('transition', g.transition);
      else g.track.style.removeProperty('transition');
      // The row rests where the glide left it, with focus on a visible tile.
      // A remote key (or YouTube moving the row itself) hands it back.
      if (release || Math.abs(g.f) < 1) {
        if (readTransform(g.track) === g.written) g.track.style.setProperty('transform', g.base);
        parked.delete(g.track);
      } else parked.set(g.track, {base: g.base, f: g.f, written: g.written, transition: g.transition});
    } catch (_) { /* a replaced track needs no restore */ }
    log.line(`glide end reason=${reason} presses=${g.presses} f=${Math.round(g.f)} frames=${g.frames} maxGap=${g.maxGap}ms`);
  }
  // Horizontal extent of the tiles YouTube has rendered in this row.
  function renderedBounds(track) {
    const nodes = track.querySelectorAll(tiles);
    let left = Infinity, right = -Infinity;
    for (let i = 0; i < nodes.length && i < 60; i++) {
      const r = nodes[i].getBoundingClientRect?.();
      if (!r || !(r.width > 0)) continue;
      left = Math.min(left, r.left); right = Math.max(right, r.right);
    }
    return Number.isFinite(left) ? {left, right} : null;
  }
  function glideFrame(time) {
    const g = glide;
    if (!g) return;
    if (!doc.documentElement?.contains?.(g.track)) { endGlide('track-replaced', true); return; }
    const gap = g.last === null ? 0 : time - g.last;
    const dt = Math.min(0.05, Math.max(0, gap) / 1000);
    g.last = time; g.frames++; g.maxGap = Math.max(g.maxGap, Math.round(gap));
    const current = readTransform(g.track);
    if (current !== g.written) {
      // YouTube moved its track (after our focus press). Keep the row where
      // it is on screen by taking the same distance into our offset.
      const shift = translateX(current, g.rem) - translateX(g.base, g.rem);
      g.f += shift; g.base = current; g.boundsAt = -1;
      log.line(`glide shift ${Math.round(shift)}px f=${Math.round(g.f)}`);
    }
    const width = win.innerWidth || 1920;
    const side = g.dir > 0 ? 'right' : 'left';
    const active = band && band.key === side;
    const target = active ? edgeGlideSpeed(g.dir, band.depth, now() - band.since, width, tuning) : 0;
    g.v += (target - g.v) * (1 - Math.exp(-dt / tuning.glideSmoothingSeconds));
    // Only reveal tiles YouTube has rendered: wait at the last one, which is
    // also the end of the row. Measured every few frames to stay cheap.
    if (g.boundsAt < 0 || g.frames - g.boundsAt >= 4) { g.bounds = renderedBounds(g.track); g.boundsAt = g.frames; }
    let move = g.v * dt;
    if (g.bounds) {
      if (move > 0) move = Math.max(0, Math.min(move, g.bounds.right - width));
      else if (move < 0) move = Math.min(0, Math.max(move, g.bounds.left));
      g.bounds = {left: g.bounds.left - move, right: g.bounds.right - move};
    }
    g.f += move;
    // Keep YouTube's focus near the middle of the screen, so it renders
    // tiles on both sides of what is visible. A press that does not move
    // focus means the row has no more tiles that way.
    const focus = doc.activeElement, fr = focus?.getBoundingClientRect?.();
    if (g.pending) {
      if (focus !== g.pending.focus) g.pending = null;
      else if (time - g.pending.at > 450) {
        // YouTube can ignore a press while it is still moving: try again
        // shortly. The rendered-tile limit above already stops at the end.
        log.line(`press ignored ${g.pending.dir > 0 ? 'right' : 'left'} after ${g.presses} presses; retrying`);
        g.pending = null; g.retryAt = time + 350;
      }
    } else if (active && fr && fr.width > 0 && time >= g.retryAt) {
      const centre = (fr.left + fr.right) / 2 - move;
      if ((g.dir > 0 && centre < width / 2 - g.step / 2) || (g.dir < 0 && centre > width / 2 + g.step / 2)) {
        press(side); steps++; g.presses++; if (band) band.steps++;
        g.pending = {at: time, focus, dir: g.dir};
      }
    }
    if (!active && Math.abs(g.v) < 5) { endGlide(band ? 'list-end' : 'settled'); return; }
    {
      g.track.style.setProperty('transition', 'none');
      g.track.style.setProperty('transform', `${g.base} translateX(${(-g.f).toFixed(1)}px)`.trim());
      g.written = readTransform(g.track);
    }
    win.requestAnimationFrame(glideFrame);
  }

  // The horizontal row whose band contains this height. At the left edge
  // YouTube's sidebar covers the rows, so the pointer never hits a tile there.
  function rowAtHeight(y) {
    const lists = doc.querySelectorAll('ytlr-horizontal-list-renderer yt-virtual-list');
    for (let i = 0; i < lists.length && i < 30; i++) {
      const r = lists[i].getBoundingClientRect?.();
      if (!r || !(r.height > 0) || y < r.top || y > r.bottom) continue;
      const children = lists[i].children;
      for (let j = 0; j < children.length; j++)
        if (/translateX\(/.test(readTransform(children[j]))) return children[j];
    }
    return null;
  }
  // The visible tile nearest the row's left edge. Focusing it keeps
  // YouTube's track where it is, so each later arrow shifts one tile.
  function anchorTile(track) {
    const nodes = track.querySelectorAll(tiles);
    let best = null, bestLeft = Infinity;
    for (let i = 0; i < nodes.length && i < 60; i++) {
      const r = nodes[i].getBoundingClientRect?.();
      if (r && r.width > 0 && r.left >= -8 && r.left < bestLeft && r.left < (win.innerWidth || 1920)) {
        best = nodes[i]; bestLeft = r.left;
      }
    }
    return best;
  }
  // Sideways: the row is the one under the pointer, never whatever has
  // focus. Nothing here runs while a glide is moving the row.
  function sideStep() {
    if (glide || band.noTarget) return;
    const tile = point && tileAt(point.target);
    const track = (tile && trackFor(tile)) || (point && rowAtHeight(point.y));
    if (!track || !/translateX\(/.test(readTransform(track))) {
      band.noTarget = true;
      log.line(`skip ${band.key} no-row-under-pointer pointer=${point ? Math.round(point.x) + ',' + Math.round(point.y) : 'none'} ` +
        `hit=${describeChain(point?.target, win, 3)}`);
      api.status = 'No video row under the pointer.';
      return;
    }
    if (!track.contains(doc.activeElement)) {
      if (band.focusAttempts >= 2) {
        band.noTarget = true;
        log.line(`skip ${band.key} focus-refused focus=${describeElement(doc.activeElement, win)}`);
        return;
      }
      band.focusAttempts++;
      const anchor = anchorTile(track) || tile;
      try { anchor.focus(); } catch (_) { /* reported below */ }
      band.holdUntil = now() + 150;
      log.line(`focus-tile ${band.key} ok=${track.contains(doc.activeElement)} tile=${describeChain(anchor, win, 3)}`);
      return;
    }
    startGlide(band.key === 'right' ? 1 : -1, track);
  }
  function stepOnce() {
    const before = doc.activeElement;
    const beforeRect = before?.getBoundingClientRect?.();
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
    const sideways = band.key === 'left' || band.key === 'right';
    if (sideways) {
      if (time - band.since >= tuning.dwellMs && !(band.holdUntil > time)) sideStep();
    } else if (!band.ended && !(band.holdUntil > time)) {
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
    point = {x, y, target: event.target};
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
    band = {key: next.key, depth: next.depth, since: time, steps: 0, ended: false, focusAttempts: 0};
    // The first step follows right after the dwell: TV rests were short.
    credit = 1; last = null; stalls = 0;
    log.line(`enter ${next.key} depth=${next.depth.toFixed(2)} pointer=${Math.round(x)},${Math.round(y)} ` +
      `view=${win.innerWidth}x${win.innerHeight} focus=${describeChain(doc.activeElement, win, 6)}`);
    timer = win.setTimeout(tick, tuning.tickMs);
  }
  function key(event) {
    if (synthetic.has(event)) return;
    if (band) stop('remote-key');
    endGlide('remote-key');
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
    stopped = true; if (band) stop('destroyed'); endGlide('destroyed');
    for (const [owner, type, callback, capture] of bindings) owner.removeEventListener?.(type, callback, capture);
  }
  return api;
}
