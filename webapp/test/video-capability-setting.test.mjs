import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuFixture } from './helpers/menu-fixture.mjs';
import { createVideoCapabilitySetting, readVideoCapabilitySetting } from '../src/video-capability-setting.mjs';
function setup(initial = {saved: 0, active: 0, overridden: false}) {
  const f = menuFixture(), writes = [];
  let saved = initial.saved, fail = false;
  const api = {
    getYtafVideoCapabilitySetting: () => JSON.stringify({...initial, saved}),
    setYtafVideoCapabilitySetting: value => { writes.push(value); if (fail) return false; saved = value; return true; }
  };
  const win = {h5vcc: {system: api}};
  const panel = createVideoCapabilitySetting(f.doc, win, f.choices);
  return {...f, writes, win, panel,
    status: () => panel.children.at(-1).textContent,
    label: () => f.nodes.get('__video_capabilities').textContent,
    fail: () => {fail = true;},
    select: value => f.choose('__video_capabilities', value)};
}
test('video quality selects explicit persisted tiers while the active tier stays unchanged', () => {
  const menu = setup();
  assert.match(menu.label(), /1080p/);
  menu.select(1); assert.match(menu.label(), /4K · SDR/); assert.match(menu.status(), /Restart required/);
  menu.select(2); assert.match(menu.label(), /4K · HDR/);
  assert.equal(readVideoCapabilitySetting(menu.win).active, 0);
  menu.select(0); assert.match(menu.label(), /1080p/); assert.doesNotMatch(menu.status(), /Restart required/);
  assert.deepEqual(menu.writes, [1, 2, 0]);
});
test('native save failure restores the previous choice', () => {
  const menu = setup(); menu.fail(); menu.select(1);
  assert.match(menu.label(), /1080p/); assert.match(menu.status(), /Could not save/);
  assert.equal(readVideoCapabilitySetting(menu.win).saved, 0);
});
test('reopened menu shows saved selection and explains developer override', () => {
  const menu = setup({saved: 2, active: 0, overridden: true});
  assert.match(menu.label(), /HDR/); assert.match(menu.status(), /developer override/);
});
test('one remote OK press makes one capability change despite repeat and synthesized click', () => {
  const menu = setup();
  menu.press('__video_capabilities');
  assert.equal(menu.writes.length, 0);
  menu.key('ArrowDown', 40); menu.key('Enter', 13);
  menu.click('__video_capabilities'); menu.click('__video_capabilities');
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
