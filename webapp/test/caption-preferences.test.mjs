import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectCaptionTrack,
  startCaptionPreferences,
  createCaptionSettings
} from '../src/caption-preferences.mjs';
import { menuFixture } from './helpers/menu-fixture.mjs';
const english = { languageCode: 'en' },
  hungarian = { languageCode: 'hu' };
function fixture(config = {}) {
  const settings = {
    captionMode: 'youtube',
    captionLanguage: 'youtube',
    captionSize: 'youtube',
    ...config
  };
  const events = {},
    windowEvents = {},
    timers = new Map(),
    writes = [];
  let n = 0,
    tracks = [english, hungarian],
    current = {},
    loads = 0;
  const video = {};
  let available = true;
  const player = {
    getOption: (_mod, key) => (key === 'tracklist' ? tracks : current),
    setOption: (_mod, key, value) => {
      writes.push({ key, value });
      if (key === 'track') current = value;
    },
    loadModule() {
      loads++;
    }
  };
  const doc = {
    querySelector: (s) => (s === 'video' ? video : null),
    getElementById: () => (available ? player : null),
    addEventListener: (name, fn) => (events[name] = fn)
  };
  const win = {
    location: { href: '?v=aaaaaaaaaaa' },
    setTimeout: (fn) => {
      timers.set(++n, fn);
      return n;
    },
    clearTimeout: (id) => timers.delete(id),
    addEventListener: (name, fn) => (windowEvents[name] = fn)
  };
  const api = startCaptionPreferences(doc, win, (key) => settings[key]);
  return {
    api,
    writes,
    settings,
    doc,
    win,
    player,
    timers,
    get loads() {
      return loads;
    },
    setTracks(value) {
      tracks = value;
    },
    setAvailable(value) {
      available = value;
    },
    emit: (name, target = {}) => events[name]?.({ target }),
    tick() {
      const [id, fn] = timers.entries().next().value || [];
      if (fn) {
        timers.delete(id);
        fn();
      }
    },
    change(key, value) {
      settings[key] = value;
      events['ytaf-config-changed']({ detail: { key } });
    },
    navigate(id) {
      win.location.href = '?v=' + id;
      windowEvents.hashchange();
    }
  };
}
test('caption track selection matches language without translating and prefers human tracks', () => {
  const human = { languageCode: 'en-US' },
    asr = { languageCode: 'en-US', kind: 'asr' };
  assert.equal(selectCaptionTrack([asr, human], 'en'), human);
  assert.equal(selectCaptionTrack([human, english], 'en'), english);
  assert.equal(selectCaptionTrack([english], 'hu'), null);
});
test('default caption settings do not touch the player; explicit preferences apply once per video', () => {
  const f = fixture();
  assert.equal(f.writes.length, 0);
  f.change('captionLanguage', 'hu');
  assert.equal(f.writes.length, 0);
  f.change('captionMode', 'on');
  assert.deepEqual(f.writes, [{ key: 'track', value: hungarian }]);
  f.emit('canplay');
  f.emit('loadedmetadata');
  assert.equal(f.writes.length, 1);
  f.api.manual();
  f.emit('canplay');
  assert.equal(f.writes.length, 1);
  f.navigate('bbbbbbbbbbb');
  assert.equal(f.writes.length, 2);
  f.change('captionSize', 'extra');
  assert.ok(
    f.writes.some((write) => write.key === 'fontSize' && write.value === 2)
  );
});
test('missing language preserves choice and unsupported controls retry finitely', () => {
  const f = fixture();
  f.setTracks([english]);
  f.change('captionLanguage', 'hu');
  f.change('captionMode', 'on');
  assert.equal(f.writes.length, 0);
  assert.match(f.api.status, /unavailable/);
  const g = fixture();
  g.setAvailable(false);
  g.change('captionMode', 'on');
  for (let i = 0; i < 30; i++) g.tick();
  assert.equal(g.timers.size, 0);
  assert.equal(g.writes.length, 0);
});
test('manual remote selection cancels pending preference and stale retry after navigation', () => {
  const f = fixture();
  f.setTracks([]);
  f.change('captionMode', 'on');
  assert.equal(f.loads, 1);
  const late = [...f.timers.values()][0];
  f.api.manual();
  f.setTracks([english]);
  late();
  assert.equal(f.writes.length, 0);
  f.navigate('bbbbbbbbbbb');
  assert.equal(f.writes.length, 1);
  const g = fixture();
  g.setTracks([]);
  g.change('captionMode', 'on');
  g.emit('click', { parentElement: { matches: () => true } });
  g.setTracks([english]);
  g.tick();
  assert.equal(g.writes.length, 0);
});
test('caption failures do not repeatedly write; prefer off does not depend on available language', () => {
  const f = fixture();
  f.player.setOption = () => {
    throw new Error('unsupported');
  };
  f.change('captionMode', 'off');
  assert.match(f.api.status, /could not/);
  assert.equal(f.timers.size, 0);
  const g = fixture({ captionMode: 'off', captionLanguage: 'hu' });
  assert.deepEqual(g.writes, [{ key: 'track', value: {} }]);
});
test('caption menu uses normal one-press choice handling and persists each selected field', () => {
  const f = menuFixture(),
    settings = {
      captionMode: 'youtube',
      captionLanguage: 'youtube',
      captionSize: 'youtube'
    },
    writes = [];
  const win = { __ytafCaptions: { status: 'Ready', render() {} } };
  createCaptionSettings(
    f.doc,
    win,
    f.choices,
    (key) => settings[key],
    (key, value) => writes.push({ key, value })
  );
  f.press('__captionMode');
  f.click('__captionMode');
  assert.deepEqual(writes, [{ key: 'captionMode', value: 'on' }]);
  f.press('__captionSize');
  assert.equal(writes.at(-1).value, 'large');
});

test('caption preference waits for matching player identity after navigation',()=>{
  const f=fixture();f.player.getVideoData=()=>({video_id:'oldoldoldol'});f.change('captionMode','on');
  assert.equal(f.writes.length,0);f.player.getVideoData=()=>({video_id:'aaaaaaaaaaa'});f.tick();assert.equal(f.writes.length,1);
});
