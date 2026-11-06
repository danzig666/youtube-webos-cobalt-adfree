import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeBand, edgeStepRate, edgeScrollTuning, startPointerEdgeScroll } from '../src/pointer-edge-scroll.mjs';
import { createPointerLog, describeElement } from '../src/pointer-log.mjs';

test('bands match PlxNative: 120 px sides, 80 px top/bottom taking the corners, scaled to the view', () => {
  assert.equal(edgeBand(960, 540, 1920, 1080), null);
  assert.deepEqual(edgeBand(1920 - 60, 540, 1920, 1080), {key: 'right', depth: 0.5});
  assert.equal(edgeBand(30, 540, 1920, 1080).key, 'left');
  assert.equal(edgeBand(10, 10, 1920, 1080).key, 'up');
  assert.equal(edgeBand(1900, 1070, 1920, 1080).key, 'down');
  // 720p scales the side band to 80 px.
  assert.equal(edgeBand(1280 - 70, 360, 1280, 720).key, 'right');
  assert.equal(edgeBand(1280 - 90, 360, 1280, 720), null);
});

test('rate waits for the dwell, eases in, and grows toward the edge', () => {
  const t = edgeScrollTuning;
  assert.equal(edgeStepRate('right', 1, t.dwellMs - 1), 0);
  assert.ok(edgeStepRate('right', 1, t.dwellMs + 50) < edgeStepRate('right', 1, t.dwellMs + 200));
  assert.equal(edgeStepRate('right', 1, 5000), t.sideStepsPerSecond);
  assert.equal(edgeStepRate('right', 0, 5000), t.sideStepsPerSecond * t.minShare);
  assert.equal(edgeStepRate('down', 1, 5000), t.verticalStepsPerSecond);
});

function fixture({watch = false, focusTop = 500} = {}) {
  let time = 0, sequence = 0;
  const timers = new Map(), listeners = new Map(), lines = [], dispatched = [];
  const config = {pointerEdgeScroll: true, pointerDiagnosticsLog: true};
  let focusIndex = 0;
  const tiles = Array.from({length: 10}, (_, i) => ({
    localName: 'ytlr-tile-renderer', parentElement: null,
    getBoundingClientRect: () => ({left: 100 + (i - focusIndex) * 400, top: focusTop, width: 380, height: 220, bottom: focusTop + 220}),
    dispatchEvent(event) {
      dispatched.push([event.type, event.keyCode]);
      // Rows of a vertical list: Down/Up move focus to the next/previous row.
      if (event.type === 'keydown' && [39, 40].includes(event.keyCode) && focusIndex < 9) { focusIndex++; doc.activeElement = tiles[focusIndex]; }
      if (event.type === 'keydown' && [37, 38].includes(event.keyCode) && focusIndex > 0) { focusIndex--; doc.activeElement = tiles[focusIndex]; }
      return true;
    }
  }));
  const on = (target, type, fn) => listeners.set(target + ':' + type, fn);
  const doc = {activeElement: tiles[0], body: {classList: {contains: name => watch && name === 'WEB_PAGE_TYPE_WATCH'}},
    hidden: false, visibilityState: 'visible', querySelectorAll: () => [],
    addEventListener: (type, fn) => on('doc', type, fn), removeEventListener() {}};
  const win = {innerWidth: 1920, innerHeight: 1080, performance: {now: () => time},
    h5vcc: {system: {appendYtafPointerLog: text => { lines.push(...text.split('\n')); return true; }}},
    navigator: {userAgent: 'Cobalt test'}, getComputedStyle: () => ({}),
    KeyboardEvent: class { constructor(type, options) { Object.assign(this, {type}, options); } },
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, {fn, at: time + delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener: (type, fn) => on('win', type, fn), removeEventListener() {}};
  const log = createPointerLog(win, key => config[key], () => Math.round(time));
  const api = startPointerEdgeScroll(doc, win, key => config[key], log);
  return {api, doc, win, lines, dispatched, config, log, tiles, focus: () => focusIndex,
    pointer(x, y, type = 'pointermove') { listeners.get('doc:' + type)({type, clientX: x, clientY: y, buttons: 0, target: tiles[focusIndex]}); },
    key(code) { listeners.get('win:keydown')({type: 'keydown', keyCode: code}); },
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      time = end;
    }};
}

test('resting at the bottom edge keeps stepping YouTube navigation, not just once', () => {
  const f = fixture();
  f.pointer(960, 1070);
  f.advance(140);
  assert.equal(f.focus(), 0, 'nothing during the dwell');
  f.advance(3000);
  assert.ok(f.focus() >= 4, `kept moving: ${f.focus()}`);
  assert.ok(f.dispatched.every(([, code]) => code === 40));
  assert.equal(f.dispatched.filter(([type]) => type === 'keydown').length, f.api.steps());
});

test('the list end, leaving the band and a real remote key stop the steps', () => {
  const f = fixture();
  f.pointer(960, 1070); f.advance(8000);
  assert.equal(f.focus(), 9);
  const sent = f.dispatched.length;
  f.advance(2000);
  assert.equal(f.dispatched.length, sent, 'stops after the end of the list');
  f.log.flush();
  assert.ok(f.lines.some(line => / end down after \d+ steps/.test(line)));

  const g = fixture();
  g.pointer(960, 1070); g.advance(800); const moved = g.focus();
  g.pointer(960, 600); g.advance(2000);
  assert.equal(g.focus(), moved, 'leaving the band stops');
  g.pointer(960, 1070); g.advance(600); g.key(13); const atKey = g.focus(); g.advance(2000);
  assert.equal(g.focus(), atKey, 'a real key stops');
});

test('playback pages are not scrolled, and a side edge without a row under the pointer does nothing once', () => {
  const f = fixture({watch: true});
  f.pointer(960, 1070); f.advance(2000);
  assert.equal(f.dispatched.length, 0);
  const g = fixture();
  g.pointer(1910, 600); g.advance(3000);
  assert.equal(g.dispatched.length, 0, 'no presses without a horizontal row track');
  g.log.flush();
  assert.equal(g.lines.filter(line => line.includes('no-row-under-pointer')).length, 1, 'logged once, not every tick');
});

test('the log records steps and results to the native file, and nothing when off', () => {
  const f = fixture();
  f.pointer(960, 1070); f.advance(1500); f.log.flush();
  assert.match(f.lines[0], /session ua=Cobalt test view=1920x1080/);
  assert.ok(f.lines.some(line => / enter down /.test(line)));
  assert.ok(f.lines.some(line => / step down n=1 /.test(line)));
  assert.ok(f.lines.some(line => / result down n=1 focusChanged=true dx=/.test(line)));
  assert.ok(f.lines.every(line => !/https?:|watch\?v=/.test(line)));
  const g = fixture(); g.config.pointerDiagnosticsLog = false;
  g.pointer(960, 1070); g.advance(1500); g.log.flush();
  assert.equal(g.lines.length, 0);
});

test('element descriptions hold only tag, geometry and layout hints', () => {
  const node = {localName: 'ytlr-tile-renderer', hasAttribute: () => true,
    getBoundingClientRect: () => ({left: 10.4, top: 20, width: 300, height: 170}),
    style: {getPropertyValue: () => 'translateX(-400px)'}, getAttribute: () => 'Secret title'};
  assert.equal(describeElement(node, {getComputedStyle: () => ({overflow: 'hidden'})}),
    'ytlr-tile-renderer@10,20 300x170 tab tf=translateX(-400px) of=hidden');
});

test('glide speed follows PlxNative: 1000 px/s at the edge of a 1920 px view, eased in, scaled', async () => {
  const {edgeGlideSpeed} = await import('../src/pointer-edge-scroll.mjs');
  const t = edgeScrollTuning;
  assert.equal(edgeGlideSpeed(1, 1, t.dwellMs - 1, 1920), 0);
  assert.equal(edgeGlideSpeed(1, 1, 5000, 1920), 1000);
  assert.equal(edgeGlideSpeed(-1, 0, 5000, 1920), -350);
  assert.equal(edgeGlideSpeed(1, 1, 5000, 960), 500);
  assert.ok(edgeGlideSpeed(1, 1, t.dwellMs + 100, 1920) < edgeGlideSpeed(1, 1, t.dwellMs + 300, 1920));
});
