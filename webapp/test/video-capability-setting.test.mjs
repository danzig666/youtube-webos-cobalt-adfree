import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createVideoCapabilitySetting, readVideoCapabilitySetting } from '../src/video-capability-setting.mjs';
function setup(initial = {saved: 0, active: 0, overridden: false}) {
  const elements = new Map(), writes = [];
  let saved = initial.saved, fail = false, focused;
  function element() {
    const node = {children: [], dataset: {}, style: {}, listeners: {},
      classList: {add() {}, remove() {}},
      appendChild(child) { this.children.push(child); child.parentElement = this; },
      setAttribute() {}, addEventListener(type, callback) { this.listeners[type] = callback; }};
    Object.defineProperty(node, 'id', {get() {return this._id;}, set(value) {this._id = value; elements.set('#' + value, this);}});
    return node;
  }
  const doc = {createElement: element, querySelector: selector => selector === ':focus' ? focused : elements.get(selector)};
  const api = {
    getYtafVideoCapabilitySetting: () => JSON.stringify({...initial, saved}),
    setYtafVideoCapabilitySetting: value => { writes.push(value); if (fail) return false; saved = value; return true; }
  };
  const win = {h5vcc: {system: api}};
  const context = vm.createContext({document: doc, Date: {now: () => 1000},
    isContainerOpen: () => true, menuHasFocus: () => true, queueMenuItemScroll() {},
    getDirectionFromEvent: () => null, isGreenKey: () => false, getPlaybackRateShortcut: () => 0});
  const choices = fs.readFileSync(new URL('../src/choiceTools.js', import.meta.url), 'utf8');
  vm.runInContext(choices.replace("import './choiceTools.css';", '').replace('export const', 'const') + '\nglobalThis.choices = choiceTools;', context);
  const panel = createVideoCapabilitySetting(doc, win, context.choices);
  focused = elements.get('#__video_capabilities');
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const start = ui.indexOf('  const eventHandler = (evt) => {');
  const end = ui.indexOf('\n  // Red, Green, Yellow, Blue', start);
  vm.runInContext('let heldActivationControl = null;\n' + ui.slice(start, end), context);
  const event = type => ({type, key: 'Enter', keyCode: 13, preventDefault() {}, stopPropagation() {}});
  return {writes, win, panel, doc, choices: context.choices,
    status: () => panel.children.at(-1).textContent,
    label: () => focused.textContent,
    fail: () => {fail = true;},
    cycle: () => context.choices.cycle('__video_capabilities'),
    key(type) {context.input = event(type); vm.runInContext('eventHandler(input)', context);},
    click() {focused.parentElement.listeners.click(event('click'));}};
}
test('video quality cycles through persisted tiers while the active tier stays unchanged', () => {
  const menu = setup();
  assert.match(menu.label(), /1080p/);
  menu.cycle(); assert.match(menu.label(), /4K · SDR/); assert.match(menu.status(), /Restart required/);
  menu.cycle(); assert.match(menu.label(), /4K · HDR/);
  assert.equal(readVideoCapabilitySetting(menu.win).active, 0);
  menu.cycle(); assert.match(menu.label(), /1080p/); assert.doesNotMatch(menu.status(), /Restart required/);
  assert.deepEqual(menu.writes, [1, 2, 0]);
});
test('native save failure restores the previous choice', () => {
  const menu = setup(); menu.fail(); menu.cycle();
  assert.match(menu.label(), /1080p/); assert.match(menu.status(), /Could not save/);
  assert.equal(readVideoCapabilitySetting(menu.win).saved, 0);
});
test('reopened menu shows saved selection and explains developer override', () => {
  const menu = setup({saved: 2, active: 0, overridden: true});
  assert.match(menu.label(), /HDR/); assert.match(menu.status(), /developer override/);
});
test('one remote OK press makes one capability change despite repeat and synthesized click', () => {
  const menu = setup();
  menu.key('keydown'); menu.key('keydown'); menu.key('keypress'); menu.key('keyup'); menu.click(); menu.click();
  assert.deepEqual(menu.writes, [1]);
});
test('older native runtimes show availability text without a misleading setting', () => {
  const menu = setup();
  const panel = createVideoCapabilitySetting(menu.doc, {}, menu.choices);
  assert.equal(panel.children.length, 1);
  assert.match(panel.children[0].textContent, /updated native app/);
  assert.equal(readVideoCapabilitySetting({}), null);
  menu.win.h5vcc.system.getYtafVideoCapabilitySetting = () => '{"saved":99,"active":0,"overridden":false}';
  assert.equal(readVideoCapabilitySetting(menu.win), null);
});
