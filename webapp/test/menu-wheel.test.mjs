import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {wheelScrollDelta} from '../src/wheel-scroll.mjs';

// Exercise the actual menu handler with controllable geometry and RAF queues.
function menu(section = 'general', options = {}) {
  let open = true, handler;
  const cancelled = [], items = [];
  const doc = {activeElement: null, addEventListener(type, fn) {if(type === 'wheel') handler = fn;}};
  const container = {scrollTop: 12, focus() {doc.activeElement = this;}, getBoundingClientRect: () => ({top: 0, bottom: 400})};
  const viewport = {scrollTop: 20, getBoundingClientRect: () => ({top: 100, bottom: 400, height: 300})};
  const content = {style: {}, scrollHeight: 1800, querySelectorAll: () => items};
  const frames = [];
  const context = vm.createContext({document: doc, window: {cancelAnimationFrame: id => cancelled.push(id),
    ...(options.raf ? {requestAnimationFrame: fn => frames.push(fn)} : {})}, isContainerOpen: () => open, sections:{current:()=>section}, wheelScrollDelta, menuViewport: viewport, menuContent: content, uiContainer: container});
  vm.runInContext('let menuOffset=0, menuScrollFrame=8, directionMoveFrame=9, wheelFocusing=false, currentFocusIndex=-1, lastTabIndex=0;', context);
  for (let i = 0; i < 10; i++) {
    const node = {tabIndex: i + 1, focus() {
      assert.equal(vm.runInContext('wheelFocusing', context), true);
      doc.activeElement = this;
    }, getBoundingClientRect() {
      const top = 100 + i * 150 - vm.runInContext('menuOffset', context);
      return {top, bottom: top + 40};
    }};
    items.push(node);
  }
  doc.activeElement = items[0];
  const src = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const start = src.indexOf('  // Own the wheel');
  vm.runInContext(src.slice(start, src.indexOf('\n  window.__ytafAttachSettings', start)), context);
  return {doc, container, content, viewport, items, cancelled, frames, context,
    run(ms = 16) { let time = 0; while (frames.length) { time += ms; frames.shift()(time); } },
    close: () => {open = false;},
    wheel(deltaY, extra = {}) {
      const event = {deltaY, deltaMode: 0, ...extra, preventDefault() {this.prevented = true;}, stopPropagation() {this.stopped = true;}};
      handler(event); return event;
    }};
}
test('settings wheel cancels queued focus scrolling, selects visible controls and clamps both ends', () => {
  const f = menu();
  const event = f.wheel(250);
  assert.equal(event.prevented, true); assert.equal(event.stopped, true);
  assert.deepEqual(f.cancelled, [8, 9]);
  assert.equal(f.content.style.top, '-250px');
  assert.equal(f.doc.activeElement, f.items[2]);
  assert.equal(f.viewport.scrollTop, 0); assert.equal(f.container.scrollTop, 0);
  for (let i = 0; i < 20; i++) f.wheel(500);
  assert.equal(f.content.style.top, '-1500px');
  for (let i = 0; i < 20; i++) f.wheel(-500);
  assert.equal(f.content.style.top, '0px');
});
test('settings leaves closed-menu and modified wheel events alone', () => {
  const f = menu();
  assert.equal(f.wheel(20, {ctrlKey: true}).prevented, undefined);
  const closed = menu(); closed.close();
  assert.equal(closed.wheel(20).prevented, undefined);
});
test('wheel reading of a tall text-only section removes focus from hidden settings', () => {
  const f = menu();
  for (const item of f.items) item.getBoundingClientRect = () => ({top: -500, bottom: -450});
  f.wheel(250);
  assert.equal(f.doc.activeElement, f.container);
});

test('diagnostics menu wheel scrolls a few lines even when the TV sends a full-page delta',()=>{
  const f=menu('diagnostics');
  f.wheel(1,{deltaMode:2});
  assert.equal(f.content.style.top,'-72px');
  f.wheel(-100,{deltaMode:1});
  assert.equal(f.content.style.top,'0px');
});

test('on the TV the wheel eases to the accumulated target and focuses once it settles', () => {
  const f = menu('general', {raf: true});
  f.wheel(150); f.wheel(150);
  assert.equal(f.content.style.top, undefined, 'no jump on the event itself');
  assert.equal(f.doc.activeElement, f.items[0], 'focus waits for the glide');
  const tops = [];
  let time = 0;
  while (f.frames.length) { time += 16; f.frames.shift()(time); tops.push(parseFloat(f.content.style.top)); }
  assert.equal(tops.at(-1), -300);
  assert.ok(tops.length > 5, 'eased over several frames');
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] <= tops[i - 1], 'moves one way');
  assert.equal(f.doc.activeElement, f.items[2]);
});
