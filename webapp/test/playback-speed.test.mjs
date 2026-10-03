import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startPlaybackSpeed} from '../src/playback-speed.mjs';
import {playbackFixture} from './helpers/playback-fixture.mjs';
function fixture() {
  const f=playbackFixture();let nativeRate=1,enabled=0;
  f.video.playbackRate=1;f.settings.playbackSpeed='youtube';
  f.win.h5vcc={system:{enableYtafPlaybackRates:()=>{enabled++;return true;},
    getYtafMediaReport:()=>`Current player: Shared Starfish\nPlayback rate: requested ${nativeRate}x applied ${nativeRate}x\n`}};
  const write=(key,value)=>{f.settings[key]=value;f.doc.emit('ytaf-config-changed',{detail:{key}});};
  const api=startPlaybackSpeed(f.doc,f.win,f.read,write,f.notify);
  return {...f,api,native:value=>nativeRate=value,enabled:()=>enabled};
}
test('speed selection opts in natively before applying and confirms native readback',()=>{
  const f=fixture();assert.equal(f.enabled(),0);
  assert.equal(f.api.request(1.25),true);assert.equal(f.enabled(),1);assert.equal(f.video.playbackRate,1.25);
  assert.equal(f.settings.playbackSpeed,'1.25');f.native(1.25);f.advance(500);
  assert.match(f.api.status,/Native playback speed: 1.25/);assert.equal(f.notifications.length,0);
  f.api.adjust(1);assert.equal(f.video.playbackRate,1.5);assert.equal(f.api.request(.25),false);
});
test('YouTube default leaves manual rates alone and saved preference applies to new metadata',()=>{
  const f=fixture();f.video.playbackRate=1.75;f.media('playing');assert.equal(f.video.playbackRate,1.75);
  f.settings.playbackSpeed='1.5';f.media('loadedmetadata');assert.equal(f.video.playbackRate,1.5);
  f.settings.playbackSpeed='youtube';f.doc.emit('ytaf-config-changed',{detail:{key:'playbackSpeed'}});
  assert.equal(f.video.playbackRate,1);assert.equal(f.timers.size,0);
});
test('native policy rejection and missing bridge warn without a misleading successful DOM request',()=>{
  for(const missing of [false,true]) {
    const f=fixture();f.win.h5vcc.system.enableYtafPlaybackRates=missing?undefined:()=>false;
    f.api.request(1.25);assert.equal(f.video.playbackRate,1);assert.equal(f.notifications.length,1);
    assert.equal(f.timers.size,0);
  }
});
test('native recovery to 1x is visible and does not repeatedly retry on playing',()=>{
  const f=fixture();f.api.request(1.5);f.advance(2000);
  assert.equal(f.video.playbackRate,1);assert.equal(f.notifications.length,1);
  assert.match(f.api.status,/did not apply/);f.media('playing');assert.equal(f.video.playbackRate,1);
  assert.equal(f.timers.size,0);
});
test('early YouTube resets are bounded and stale rate confirmations are cancelled',()=>{
  const f=fixture();f.native(1.5);f.api.request(1.5);
  for(let i=0;i<3;i++){f.video.playbackRate=1;f.advance(500);assert.equal(f.video.playbackRate,1.5);}
  f.video.playbackRate=1;f.advance(500);assert.equal(f.notifications.length,1);assert.equal(f.timers.size,0);
  const g=fixture();g.api.request(1.25);g.win.location.href='?v=bbbbbbbbbbb';g.advance(1000);
  assert.equal(g.notifications.length,0);assert.equal(g.timers.size,0);
});
test('paused native rates are not mistaken for a rate rejection',()=>{
  const f=fixture();f.video.paused=true;f.api.request(1.5);f.advance(5000);
  assert.equal(f.video.playbackRate,1.5);assert.equal(f.notifications.length,0);
  f.native(1.5);f.video.paused=false;f.media('playing');f.advance(500);
  assert.match(f.api.status,/Native playback speed: 1.5/);
});
