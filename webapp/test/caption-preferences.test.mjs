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
    loads = 0, fontSize = 0;
  const video = {};
  let available = true;
  const player = {
    getOption: (_mod, key) => (key === 'tracklist' ? tracks : key === 'fontSize' ? fontSize : current),
    setOption: (_mod, key, value) => {
      writes.push({ key, value });
      if (key === 'track') current = value;
      if (key === 'fontSize') fontSize = value;
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
  assert.equal(writes.length, 0);
  f.key('ArrowDown', 40); f.key('Enter', 13);
  f.click('__captionMode');
  assert.deepEqual(writes, [{ key: 'captionMode', value: 'on' }]);
  f.press('__captionSize');
  f.key('ArrowDown', 40); f.key('Enter', 13);
  assert.equal(writes.at(-1).value, 'smallest');
});

test('caption preference waits for matching player identity after navigation',()=>{
  const f=fixture();f.player.getVideoData=()=>({video_id:'oldoldoldol'});f.change('captionMode','on');
  assert.equal(f.writes.length,0);f.player.getVideoData=()=>({video_id:'aaaaaaaaaaa'});f.tick();assert.equal(f.writes.length,1);
});


test('size waits for an initialised captions module and never repeats track writes',()=>{
  const f=fixture(); let size, writes=0;
  const oldGet=f.player.getOption, oldSet=f.player.setOption;
  f.player.getOption=(mod,key)=>key==='fontSize'?size:oldGet(mod,key);
  f.player.setOption=(mod,key,value)=>{if(key==='fontSize'){writes++;size=value;}else oldSet(mod,key,value);};
  f.change('captionMode','on');f.change('captionSize','small');
  assert.equal(writes,0); const tracks=f.writes.length;
  f.tick();assert.equal(f.writes.length,tracks);
  size=0; f.tick();assert.equal(writes,1);assert.equal(size,-1);
  assert.match(f.api.status,/size applied/);
  f.emit('canplay');assert.equal(writes,1);
});
test('a silently ignored caption font change is not reported as applied',()=>{
  const f=fixture();f.player.setOption=()=>{};
  f.change('captionSize','large');for(let i=0;i<25;i++)f.tick();
  assert.equal(f.timers.size,0);assert.doesNotMatch(f.api.status,/size applied/);
});


test('YouTube default restores the original API size without undoing a manual change',()=>{
  const f=fixture();f.change('captionSize','large');f.change('captionSize','youtube');
  assert.equal(f.player.getOption('captions','fontSize'),0);
  f.change('captionSize','extra');f.player.setOption('captions','fontSize',-1);
  f.change('captionSize','youtube');assert.equal(f.player.getOption('captions','fontSize'),-1);
});
