import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startPlaybackSpeed} from '../src/playback-speed.mjs';
import {playbackFixture} from './helpers/playback-fixture.mjs';
function fixture(saved='youtube') {
  const f=playbackFixture();let nativeRate=1,enabled=0,resets=0,position=0,frames=10,shared=true,generation=1;
  f.video.playbackRate=1;f.settings.playbackSpeed=saved;
  f.win.h5vcc={system:{enableYtafPlaybackRates:()=>{enabled++;return true;},
    resetYtafPlaybackRate:()=>{resets++;nativeRate=1;return true;},
    getYtafMediaReport:()=>`Current player: ${shared?'Shared':'Legacy'} Starfish\nSession: 8 generation: ${generation}\nPlayback rate: requested ${nativeRate}x applied ${nativeRate}x\nNative presentation: ${position} seconds\nPresented frames: ${frames}\n`}};
  const write=(key,value)=>{f.settings[key]=value;f.doc.emit('ytaf-config-changed',{detail:{key}});};
  const api=startPlaybackSpeed(f.doc,f.win,f.read,write,f.notify);
  return {...f,api,native:value=>nativeRate=value,enabled:()=>enabled,resets:()=>resets,
    frame(value){position=value;frames++;f.video.currentTime=value;},
    noFrames(){frames=0;},legacy(){shared=false;},generation(){generation++;frames=1;},
    progress(rate,seconds=4){for(let i=0;i<seconds*2;i++){position+=rate*.5;frames++;f.video.currentTime=position;f.advance(500);}}};
}
test('selection shows speed toast and only progressing native timestamps confirm speed',()=>{
  const f=fixture();assert.equal(f.enabled(),0);
  assert.equal(f.api.request(1.25),true);assert.equal(f.enabled(),1);assert.equal(f.video.playbackRate,1.25);
  assert.match(f.notifications.at(-1)[0],/1.25×/);f.native(1.25);f.progress(1.25);
  assert.match(f.api.status,/native playback progressing/);
  f.api.adjust(1);assert.equal(f.video.playbackRate,1.5);assert.match(f.notifications.at(-1)[0],/1.5×/);
  assert.equal(f.api.request(.25),false);
});
test('previous saved custom rate is cleared before startup and never replayed on metadata',()=>{
  for(const saved of ['.5','1.25','1.5','2','invalid']) {
    const f=fixture(saved);assert.equal(f.settings.playbackSpeed,'youtube');assert.equal(f.resets(),1);
    f.video.readyState=0;f.media('loadedmetadata');f.media('playing');
    assert.equal(f.enabled(),0);assert.equal(f.video.playbackRate,1);assert.equal(f.timers.size,0);
  }
});
test('YouTube choice leaves its manual rate alone; new video clears an explicit custom request',()=>{
  const f=fixture();f.video.playbackRate=1.75;f.media('playing');assert.equal(f.video.playbackRate,1.75);
  f.api.request(1.5);f.native(1.5);f.media('playing');assert.equal(f.enabled(),1);
  f.media('emptied');assert.equal(f.video.playbackRate,1);assert.equal(f.settings.playbackSpeed,'youtube');assert.equal(f.timers.size,0);
});
test('no fractional call before first native frame, even with loaded metadata and accepted Play',()=>{
  const f=fixture();f.noFrames();f.video.readyState=1;
  f.api.request(1.5);f.advance(1000);assert.equal(f.video.playbackRate,1);assert.equal(f.enabled(),0);
  f.video.readyState=4;f.frame(1);f.advance(500);assert.equal(f.video.playbackRate,1.5);assert.equal(f.enabled(),1);
});
test('accepted custom rate with no frames recovers during permanent buffering and clears saved rate',()=>{
  const f=fixture();f.api.request(1.5);f.native(1.5);f.video.readyState=2;f.video.seeking=true;
  f.advance(8000);assert.equal(f.video.playbackRate,1);assert.equal(f.settings.playbackSpeed,'youtube');
  assert.equal(f.resets(),1);assert.match(f.notifications.at(-1)[0],/stalled/);assert.equal(f.timers.size,0);
  f.media('playing');assert.equal(f.video.playbackRate,1);assert.equal(f.enabled(),1);
});
test('accepting a fractional rate while actually playing at 1x is detected and rolled back',()=>{
  const f=fixture();f.api.request(1.5);f.native(1.5);f.progress(1,5);
  assert.equal(f.settings.playbackSpeed,'youtube');assert.match(f.api.status,/did not sustain/);assert.equal(f.resets(),1);
});
test('native mismatch and policy rejection return to normal instead of saving poisoned preferences',()=>{
  const f=fixture();f.api.request(1.5);f.progress(1,2);assert.equal(f.settings.playbackSpeed,'youtube');assert.match(f.api.status,/did not apply/);
  for(const missing of [false,true]) {
    const g=fixture();g.win.h5vcc.system.enableYtafPlaybackRates=missing?undefined:()=>false;
    g.api.request(1.25);assert.equal(g.video.playbackRate,1);assert.equal(g.settings.playbackSpeed,'youtube');
    assert.match(g.notifications.at(-1)[0],/unavailable/);assert.equal(g.timers.size,0);
  }
});
test('legacy backend cannot opt into an independent audio/video clock rate and stops no player',()=>{
  const f=fixture();f.legacy();f.api.request(1.5);assert.equal(f.video.playbackRate,1);
  assert.equal(f.enabled(),0);assert.equal(f.settings.playbackSpeed,'youtube');assert.match(f.api.status,/backend/);
});
test('reset reaches native bridge even before metadata or while seeking/buffering, preserving pause',()=>{
  for(const paused of [false,true]) {
    const f=fixture();f.video.readyState=0;f.video.seeking=true;f.video.paused=paused;f.video.playbackRate=2;
    f.api.reset();assert.equal(f.resets(),1);assert.equal(f.video.playbackRate,1);assert.equal(f.video.defaultPlaybackRate,1);
    assert.equal(f.video.paused,paused);assert.equal(f.settings.playbackSpeed,'youtube');assert.match(f.notifications.at(-1)[0],/1×/);
  }
});
test('paused custom request waits and pause is not treated as a stall',()=>{
  const f=fixture();f.video.paused=true;f.api.request(1.5);f.advance(20000);assert.equal(f.video.playbackRate,1);assert.equal(f.resets(),0);
  f.video.paused=false;f.advance(500);assert.equal(f.video.playbackRate,1.5);f.native(1.5);f.progress(1.5);
  assert.match(f.api.status,/progressing/);f.video.paused=true;f.advance(20000);assert.equal(f.video.playbackRate,1.5);
});
test('YouTube resets are not fought, and navigation prevents stale verification',()=>{
  const f=fixture();f.api.request(1.5);f.video.playbackRate=1;f.advance(500);
  assert.equal(f.settings.playbackSpeed,'youtube');assert.match(f.api.status,/YouTube reset/);
  const g=fixture();g.api.request(1.25);g.win.location.href='?v=bbbbbbbbbbb';g.advance(1000);
  assert.equal(g.video.playbackRate,1);assert.equal(g.settings.playbackSpeed,'youtube');assert.equal(g.timers.size,0);
});
test('speed monitoring continues after initial success and recovers a later stall',()=>{
  const f=fixture();f.api.request(2);f.native(2);f.progress(2,12);assert.match(f.api.status,/progressing/);
  f.video.readyState=1;f.advance(8000);assert.equal(f.video.playbackRate,1);assert.equal(f.resets(),1);
});
test('generation changes do not compare discontinuous seek positions as speed',()=>{
  const f=fixture();f.api.request(1.5);f.native(1.5);f.progress(1.5,2);
  f.generation();f.frame(100);f.progress(1.5,4);assert.match(f.api.status,/progressing/);assert.equal(f.resets(),0);
});
test('configuration dropdown uses the same request/reset path and does not recursively configure',()=>{
  const f=fixture();f.settings.playbackSpeed='.75';f.doc.emit('ytaf-config-changed',{detail:{key:'playbackSpeed'}});
  assert.equal(f.video.playbackRate,.75);assert.equal(f.enabled(),1);assert.equal(f.notifications.length,1);
  f.settings.playbackSpeed='youtube';f.doc.emit('ytaf-config-changed',{detail:{key:'playbackSpeed'}});
  assert.equal(f.video.playbackRate,1);assert.equal(f.resets(),1);assert.equal(f.notifications.length,2);
});
