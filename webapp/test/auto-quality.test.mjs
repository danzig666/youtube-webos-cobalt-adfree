import {test} from 'node:test';
import assert from 'node:assert/strict';
import {highestQuality,startAutoQuality} from '../src/auto-quality.mjs';
import {playbackFixture} from './helpers/playback-fixture.mjs';
function fixture(enabled=true,options={}) {
 const f=playbackFixture(),calls=[];
 const state={preferred:'auto',quality:'hd720',available:['hd720','hd2160','hd1080','auto'],id:'aaaaaaaaaaa',...options};
 f.settings.highQualityAutoStartup=enabled;
 const player={getVideoData:()=>({video_id:state.id}),getPreferredQuality:()=>state.preferred,
  getPlaybackQuality:()=>state.quality,getAvailableQualityLevels:()=>state.available,
  setPlaybackQualityRange:(min,max)=>{calls.push([min,max]);state.preferred=min;}};
 f.doc.player=player;
 const api=startAutoQuality(f.doc,f.win,f.read);
 return {...f,state,player,calls,api};
}
test('highest exposed level is ranked without depending on API ordering or inventing levels',()=>{
 assert.equal(highestQuality(['auto','hd1080','small','hd2160','hd1440']),'hd2160');
 assert.equal(highestQuality(['auto','unknown']),null);assert.equal(highestQuality(null),null);
 assert.equal(highestQuality(['hd1080']),'hd1080');
});
test('off is inert; manual quality is respected; Auto already at top needs no temporary pin',()=>{
 for(const options of [{enabled:false},{preferred:'hd1080'},{quality:'hd2160'}]) {
  const f=fixture(options.enabled!==false,options);f.media('playing');f.advance(20000);
  assert.deepEqual(f.calls,[]);assert.equal(f.timers.size,0);
 }
});
test('Auto starts at highest available then adapts again, once per video despite repeated media events',()=>{
 const f=fixture();assert.deepEqual(f.calls,[['hd2160','hd2160']]);
 f.advance(500);assert.equal(f.calls.length,1);
 f.state.quality='hd2160';f.advance(250);assert.deepEqual(f.calls.at(-1),['auto','auto']);
 for(const type of ['playing','loadedmetadata','playing'])f.media(type);
 f.advance(20000);assert.equal(f.calls.length,2);assert.equal(f.timers.size,0);
});
test('failed quality progress times out and releases Auto; no unbounded retry or native changes',()=>{
 const f=fixture();f.advance(10000);assert.deepEqual(f.calls,[['hd2160','hd2160'],['auto','auto']]);
 assert.match(f.api.status,/timed out/);assert.equal(f.timers.size,0);f.advance(60000);assert.equal(f.calls.length,2);
});
test('late player data and missing levels are retried only within the startup window',()=>{
 const f=fixture(true,{id:'bbbbbbbbbbb',available:[]});assert.deepEqual(f.calls,[]);
 f.advance(1000);f.state.id='aaaaaaaaaaa';f.advance(1000);f.state.available=['hd1080'];f.advance(250);
 assert.deepEqual(f.calls,[['hd1080','hd1080']]);
 const missing=fixture(true,{available:[]});missing.advance(10000);assert.equal(missing.timers.size,0);assert.deepEqual(missing.calls,[]);
 const absent=playbackFixture();absent.settings.highQualityAutoStartup=true;
 startAutoQuality(absent.doc,absent.win,absent.read);absent.advance(12000);assert.equal(absent.timers.size,0);
});
test('a manual quality choice, including the same top level, survives the pending hand-back',()=>{
 for(const quality of ['hd1080','hd2160','auto']) {
  const f=fixture();f.win.emit('keydown',{keyCode:13});
  assert.deepEqual(f.calls.at(-1),['auto','auto']);
  f.player.setPlaybackQualityRange(quality,quality);f.advance(20000);
  assert.equal(f.state.preferred,quality);assert.equal(f.calls.length,3);
 }
 // An independently changed preference is also respected without input events.
 const f=fixture();f.state.preferred='hd1080';f.advance(250);
 assert.equal(f.calls.length,1);assert.equal(f.state.preferred,'hd1080');
});
test('cursor/settings/background interruption releases the temporary pin and stops timers',()=>{
 for(const event of ['pointerdown','mousedown','ytaf-menu-opened','visibilitychange']) {
  const f=fixture();if(event==='visibilitychange')f.doc.hidden=true;
  (['pointerdown','mousedown'].includes(event)?f.win:f.doc).emit(event);f.advance(1000);assert.deepEqual(f.calls.at(-1),['auto','auto'],event);assert.equal(f.timers.size,0,event);
 }
});
test('navigation, element replacement and stale callbacks never apply quality to another video',()=>{
 for(const variant of ['hash','silent','element','leave']) {
  const f=fixture();
  if(variant==='element')f.doc.video={...f.video};
  else if(variant==='leave')f.doc.body.classList.contains=()=>false;
  else {f.win.location.href='?v=bbbbbbbbbbb';f.state.id='bbbbbbbbbbb';}
  if(variant==='hash')f.win.emit('hashchange');
  f.advance(12000);assert.equal(f.calls.length,1,variant);assert.equal(f.timers.size,0,variant);
 }
});
test('new videos get their own attempt after ending; stale route data is not boosted',()=>{
 const f=fixture();f.media('ended');assert.deepEqual(f.calls.at(-1),['auto','auto']);
 f.win.location.href='?v=bbbbbbbbbbb';f.win.emit('hashchange');f.media('playing');
 assert.equal(f.calls.length,2);f.state.id='bbbbbbbbbbb';f.advance(250);
 assert.deepEqual(f.calls.at(-1),['hd2160','hd2160']);f.state.quality='hd2160';f.advance(250);
 assert.deepEqual(f.calls.at(-1),['auto','auto']);
});
test('disable and destroy safely release ownership; enable applies to the current Auto video',()=>{
 const f=fixture(false);f.settings.highQualityAutoStartup=true;
 f.doc.emit('ytaf-config-changed',{detail:{key:'highQualityAutoStartup'}});assert.equal(f.calls.length,1);
 f.settings.highQualityAutoStartup=false;f.doc.emit('ytaf-config-changed',{detail:{key:'highQualityAutoStartup'}});
 assert.deepEqual(f.calls.at(-1),['auto','auto']);assert.equal(f.timers.size,0);
 const active=fixture();active.api.destroy();active.media('playing');active.advance(10000);
 assert.deepEqual(active.calls,[['hd2160','hd2160'],['auto','auto']]);assert.equal(active.timers.size,0);
});
test('quality APIs that disappear or throw cannot break media event dispatch',()=>{
 const f=fixture();f.player.getPlaybackQuality=()=>{throw Error('API unavailable');};
 assert.doesNotThrow(()=>f.advance(250));assert.deepEqual(f.calls.at(-1),['auto','auto']);assert.equal(f.timers.size,0);
 const missing=fixture(true,{available:[]});delete missing.player.setPlaybackQualityRange;
 assert.doesNotThrow(()=>missing.advance(10000));assert.equal(missing.calls.length,0);assert.equal(missing.timers.size,0);
});
