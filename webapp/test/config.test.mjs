import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8')
  .replaceAll('export function ', 'function ');
const key = 'ytaf-configuration-cobalt-adfree-v2';
function load(saved, failWrite = false) {
  const events = [];
  const storage = {};
  Object.defineProperty(storage, key, {
    get: () => saved,
    set: value => { if (failWrite) throw Error('Quota exceeded'); saved = value; }
  });
  const context = vm.createContext({
    window: {localStorage: storage, dispatchEvent: event => events.push(event)},
    document: {dispatchEvent: event => events.push(event)},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: {info() {}, warn() {}, error() {}}
  });
  vm.runInContext(source, context);
  return {context, events, saved: () => saved};
}
test('invalid stored configuration values recover to usable defaults', () => {
  for (const saved of ['null', 'false', '42', '"bad"', '[]', '{']) {
    const {context} = load(saved);
    assert.equal(context.configRead('enableAdBlock'), true, saved);
    context.configWrite('enableShorts', false);
    assert.equal(context.configRead('enableShorts'), false);
  }
});
test('storage failure keeps live settings and change notifications working', () => {
  const {context, events} = load('{}', true);
  context.configWrite('enableShorts', false);
  assert.equal(context.configRead('enableShorts'), false);
  assert.equal(events.length, 2);
  assert.equal(context.window.__ytafConfigState.enableShorts, false);
});
test('existing settings survive default population and persist writes', () => {
  const {context, saved} = load('{"enableAdBlock":false,"startupPage":"subscriptions"}');
  assert.equal(context.configRead('enableAdBlock'), false);
  assert.equal(context.configRead('enableShorts'), true);
  context.configWrite('enableShorts', false);
  const persisted = JSON.parse(saved());
  assert.equal(persisted.startupPage, 'subscriptions');
  assert.equal(persisted.enableAdBlock, false);
  assert.equal(persisted.enableShorts, false);
});
