import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/auto-login.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replaceAll('export function ', 'function ');
function fixture(guest = false) {
  let enabled = true, next = 0;
  const timers = new Map(), events = [], listeners = {}, classes = new Set(['WEB_PAGE_TYPE_ACCOUNT_SELECTOR']);
  const doc = {
    body: {classList: {add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)},
      dispatchEvent: event => events.push(event)},
    addEventListener: (name, callback) => {listeners[name] = callback;}};
  const win = {setTimeout(callback, delay) {const id = ++next; timers.set(id, {callback, delay}); return id;},
    clearTimeout: id => timers.delete(id), localStorage: {
      getItem: key => guest && key.endsWith('::last-identity-used') ? '{"data":{"identityType":"UNAUTHENTICATED_IDENTITY_TYPE_GUEST"}}' : null,
      setItem() {}}};
  const context = vm.createContext({window: win, document: doc, configRead: () => enabled,
    KeyboardEvent: class {constructor(type, values) {this.type = type; Object.assign(this, values);}},
    MutationObserver: class {observe() {} disconnect() {}}, console: {info() {}, warn() {}}});
  vm.runInContext(source, context);
  return {context, events, timers, classes,
    leave() { classes.delete('WEB_PAGE_TYPE_ACCOUNT_SELECTOR'); },
    setEnabled(value) {enabled = value; listeners['ytaf-config-changed']({detail: {key: 'enableAutoLogin', value}});},
    take(delay) {const [id, task] = [...timers.entries()].find(([, task]) => task.delay === delay); timers.delete(id); return task.callback;},
    keys: () => events.filter(event => event.type === 'keydown').map(event => event.keyCode)};
}
test('auto-login never sends its delayed OK into a video after leaving the account selector', () => {
  const f = fixture();
  const delayed = f.take(500); f.leave(); delayed();
  assert.deepEqual(f.keys(), []);
  assert.equal(f.classes.has('ytaf-bypassing-login'), false);
});
test('guest auto-login rechecks the page between Down and OK', () => {
  const f = fixture(true); f.take(500)();
  assert.deepEqual(f.keys(), [40]);
  const enter = f.take(200); f.leave(); enter();
  assert.deepEqual(f.keys(), [40]);
});
test('toggling auto-login off and on invalidates an already queued bypass from the old attempt', () => {
  const f = fixture(), old = f.take(500);
  f.setEnabled(false); f.setEnabled(true);
  old(); assert.deepEqual(f.keys(), []);
  f.take(500)(); assert.deepEqual(f.keys(), [13]);
});
test('a relaunch invalidates pending auto-login keys, while a fresh selector attempt still works', () => {
  const f = fixture(), old = f.take(500);
  f.context.resetAutoLogin(); old();
  assert.deepEqual(f.keys(), []);
  f.context.attemptAutoLogin(); f.take(500)();
  assert.deepEqual(f.keys(), [13]);
});
test('guest bypass on an unchanged account selector retains the Down then OK sequence', () => {
  const f = fixture(true); f.take(500)(); f.take(200)();
  assert.deepEqual(f.keys(), [40, 13]);
  f.take(2000)();
  assert.equal(f.classes.has('ytaf-bypassing-login'), false);
});
