import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {wheelScrollDelta} from '../src/wheel-scroll.mjs';

// Exercise the actual menu handler with controllable geometry and RAF queues.
function menu() {
  let open = true, comments = false, handler;
  const cancelled = [], items = [];
  const doc = {activeElement: null, addEventListener(type, fn) {if(type === 'wheel') handler = fn;}};
  const container = {scrollTop: 12, focus() {doc.activeElement = this;}, getBoundingClientRect: () => ({top: 0, bottom: 400})};
  const viewport = {scrollTop: 20, getBoundingClientRect: () => ({top: 100, bottom: 400, height: 300})};
  const content = {style: {}, scrollHeight: 1800, querySelectorAll: () => items};
  const context = vm.createContext({document: doc, window: {__ytafComments: {isOpen: () => comments}, cancelAnimationFrame: id => cancelled.push(id)}, isContainerOpen: () => open, wheelScrollDelta, menuViewport: viewport, menuContent: content, uiContainer: container});
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
  vm.runInContext(src.slice(start, src.indexOf('}, {capture: true, passive: false});', start) + '}, {capture: true, passive: false});'.length), context);
  return {doc, container, content, viewport, items, cancelled,
    close: () => {open = false;}, comments: () => {comments = true;},
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
