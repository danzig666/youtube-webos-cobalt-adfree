import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the menu's real navigation function with a report longer than its
// viewport. Up must first scroll the text, then return to its preceding action.
function fixture(offset = 0, reportHeight = 1800) {
  const doc = {activeElement: null};
  function item(id, control) {
    return {id, dataset: {ytafControl: control}, tabIndex: 1,
      getClientRects: () => [{}], focus() {doc.activeElement = this;}};
  }
  const action = item('run', 'action'), reader = item('report', 'reader');
  const category = item('diagnostics', 'action');
  const content = {scrollHeight: reportHeight, style: {}, querySelectorAll: () => [action, reader]};
  const viewport = {scrollTop: 0, getBoundingClientRect: () => ({height: 400})};
  const context = vm.createContext({document: doc, menuContent: content,
    menuViewport: viewport, menuOffset: offset, currentFocusIndex: -1, lastTabIndex: 0,
    uiContainer: {}, queueMenuItemScroll() {},
    sections: {nav: {contains: () => false}, currentButton: () => category}});
  const source = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('  function moveFocus(dir)'),
    source.indexOf('  function queueDirectionMove(direction)')), context);
  reader.focus();
  return {doc, action, reader, context,
    move(direction) {context.direction = direction; vm.runInContext('moveFocus(direction)', context);}};
}

test('Up scrolls a diagnostic report to its start before returning to the test button', () => {
  const f = fixture(500);
  f.move('up'); assert.equal(f.context.menuOffset, 220); assert.equal(f.doc.activeElement, f.reader);
  f.move('up'); assert.equal(f.context.menuOffset, 0); assert.equal(f.doc.activeElement, f.reader);
  f.move('up'); assert.equal(f.doc.activeElement, f.action);
});

test('a short diagnostic report can return to its preceding action without scrolling', () => {
  const f = fixture(0, 300);
  f.move('up'); assert.equal(f.doc.activeElement, f.action); assert.equal(f.context.menuOffset, 0);
});

test('Down remains on the report when the last line is reached', () => {
  const f = fixture(1400);
  f.move('down'); assert.equal(f.context.menuOffset, 1400); assert.equal(f.doc.activeElement, f.reader);
});

test('programmatic focus scrolling is cleared before applying the manual menu offset', () => {
  const viewport = {scrollTop: 600, getBoundingClientRect: () => ({top: 100, bottom: 400})};
  const content = {scrollHeight: 1500, style: {}, contains: () => true};
  const container = {scrollTop: 20, contains: () => true};
  const context = vm.createContext({uiContainer: container, menuContent: content,
    menuViewport: viewport, menuOffset: 0});
  const row = {getBoundingClientRect: () => ({top: 900 - viewport.scrollTop, bottom: 940 - viewport.scrollTop})};
  const item = {dataset: {}, parentElement: row};
  const source = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('  function scrollMenuItemIntoView(item)'),
    source.indexOf('  function queueMenuItemScroll(item)')), context);
  context.item = item; vm.runInContext('scrollMenuItemIntoView(item)', context);
  assert.equal(container.scrollTop, 0); assert.equal(viewport.scrollTop, 0);
  assert.equal(context.menuOffset, 548); assert.equal(content.style.top, '-548px');
});
