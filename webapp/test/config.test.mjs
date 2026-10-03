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
  storage.getItem = name => name === key ? saved : null;
  storage.setItem = (name, value) => { assert.equal(name, key); if (failWrite) throw Error('Quota exceeded'); saved = value; };
  const context = vm.createContext({
    window: {localStorage: storage, dispatchEvent: event => events.push(event)},
    document: {dispatchEvent: event => events.push(event)},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: {info() {}, warn() {}, error() {}}
  });
  vm.runInContext(source, context);
  return {context, events, saved: () => saved, allowWrites: () => {failWrite = false;}};
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

test('save status distinguishes session-only changes and recovers on a later successful write', () => {
  const s=load('{}', true);
  assert.equal(s.context.configPersistenceStatus(), undefined);
  s.context.configWrite('enableNumericShortcuts', false);
  assert.equal(s.context.configPersistenceStatus(), false);
  assert.equal(s.events[0].detail.persisted, false);
  s.allowWrites(); s.context.configWrite('enableShorts', false);
  assert.equal(s.context.configPersistenceStatus(), true);
  assert.equal(s.events.at(-1).detail.persisted, true);
  assert.equal(JSON.parse(s.saved()).enableNumericShortcuts, false);
});
test('channel exceptions persist through a fresh configuration load without account storage access', () => {
  const s=load('{}');
  s.context.configWrite('sponsorBlockExcludedChannels', [{id:'UCaaaaaaaaaaaaaaaaaaaaaa',name:'Creator'}]);
  const reloaded=load(s.saved());
  assert.equal(reloaded.context.configRead('sponsorBlockExcludedChannels')[0].id, 'UCaaaaaaaaaaaaaaaaaaaaaa');
});

test('caption and DeArrow defaults are opt-in and their preferences survive reload',()=>{
  const s=load('{}');
  assert.equal(s.context.configRead('captionMode'),'youtube');
  assert.equal(s.context.configRead('dearrowMode'),'off');
  for(const [key,value] of Object.entries({captionMode:'on',captionLanguage:'hu',captionSize:'large',dearrowMode:'both'}))s.context.configWrite(key,value);
  const restored=load(s.saved());assert.equal(restored.context.configRead('captionLanguage'),'hu');assert.equal(restored.context.configRead('dearrowMode'),'both');
});

test('adblocking defaults on and both deliberate on/off choices survive fresh loads',()=>{
  for(const invalid of [undefined,'{}','{"enableAdBlock":"false"}','{"enableAdBlock":null}']) assert.equal(load(invalid).context.configRead('enableAdBlock'),true);
  const f=load('{}');
  for(const value of [false,true,false,true]) {
    f.context.configWrite('enableAdBlock',value);
    assert.equal(f.context.configPersistenceStatus(),true);
    assert.equal(load(f.saved()).context.configRead('enableAdBlock'),value);
  }
});
test('native preferences survive lost browser storage, migrate old preferences, and verify saves',()=>{
  let native='';
  const system={getYtafUiPreferences:()=>native,setYtafUiPreferences:value=>{native=value;return true;}};
  function fresh(browser='{}') {
    const context=vm.createContext({window:{h5vcc:{system},localStorage:{getItem:()=>browser,setItem(){throw Error('quota');}},dispatchEvent(){}}, document:{dispatchEvent(){}},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}},console:{info(){}}});
    vm.runInContext(source,context);return context;
  }
  const first=fresh('{"enableAdBlock":false,"startupPage":"subscriptions"}');
  assert.equal(first.configRead('enableAdBlock'),false);
  first.configWrite('enableAdBlock',true);
  assert.equal(first.configPersistenceStatus(),true);
  const second=fresh();assert.equal(second.configRead('enableAdBlock'),true);assert.equal(second.configRead('startupPage'),'subscriptions');
  second.configWrite('accountToken','must not persist');assert.equal(native.includes('accountToken'),false);
  system.setYtafUiPreferences=()=>true;second.configWrite('enableAdBlock',false);
  assert.equal(second.configPersistenceStatus(),false);assert.equal(fresh().configRead('enableAdBlock'),true);
});

test('playback bookmarks persist silently without resetting settings or emitting history events',()=>{
  const f=load('{}');assert.equal(f.context.configRead('rememberPlaybackPosition'),true);
  assert.equal(f.context.configRead('seekBehavior'),'youtube');
  f.context.configWrite('enableAdBlock',false);const count=f.events.length;
  assert.equal(f.context.persistPlaybackPositions([{id:'aaaaaaaaaaa',position:42,duration:300,updated:Date.now()}]),true);
  assert.equal(f.events.length,count);
  const next=load(f.saved());assert.equal(next.context.configRead('playbackPositions')[0].position,42);
  assert.equal(next.context.configRead('enableAdBlock'),false);
  next.context.configWrite('rememberPlaybackPosition',false);
  next.context.configWrite('seekBehavior','delayed');
  const again=load(next.saved());assert.equal(again.context.configRead('rememberPlaybackPosition'),false);
  assert.equal(again.context.configRead('seekBehavior'),'delayed');
  assert.equal(load('{}',true).context.persistPlaybackPositions([]),false);
});
