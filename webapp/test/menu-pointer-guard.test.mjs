import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function fixture() {
  let open = true;
  const menu = {}, option = {}, background = {};
  const context = vm.createContext({isContainerOpen: () => open,
    uiContainer: {contains: target => target === menu},
    choiceTools: {contains: target => target === option}});
  const source = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const start = source.indexOf('  function guardMenuPointer(event)');
  vm.runInContext(source.slice(start, source.indexOf('\n  for (const type', start)), context);
  return {menu, option, background, close() {open = false;},
    send(target, type = 'click') {
      const event = {target, type, preventDefault() {this.prevented = true;},
        stopPropagation() {this.stopped = true;}, stopImmediatePropagation() {this.immediate = true;}};
      context.event = event; vm.runInContext('guardMenuPointer(event)', context); return event;
    }};
}

test('open settings consumes the complete outside cursor gesture before YouTube receives it', () => {
  const f = fixture();
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
    const event = f.send(f.background, type);
    assert.ok(event.prevented && event.stopped && event.immediate, type);
  }
});

test('settings controls, picker options and closed-menu YouTube clicks remain usable', () => {
  const f = fixture();
  for (const target of [f.menu, f.option]) assert.equal(f.send(target).prevented, undefined);
  f.close(); assert.equal(f.send(f.background).prevented, undefined);
});
