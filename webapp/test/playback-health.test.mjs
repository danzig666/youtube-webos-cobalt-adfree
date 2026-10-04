import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startPlaybackHealth} from '../src/playback-health.mjs';
import {playbackFixture} from './helpers/playback-fixture.mjs';
function fixture() {
  const f=playbackFixture();f.doc.removeEventListener=f.win.removeEventListener=()=>{};
  const health=startPlaybackHealth(f.doc,f.win);
  return {...f,health};
}
test('long playback records deliveries and advancing positions without growing timers',()=>{
  const f=fixture();
  for(let i=0;i<1200;i++) {
    f.video.currentTime=i;f.media('timeupdate');f.advance(1000);
    assert.equal(f.timers.size,1);
  }
  const report=f.health.report();
  assert.equal(report.updates,1200);assert.equal(report.progressAge,'0s');
  assert.equal(report.stalls,0);assert.equal(report.maxDelay,0);
  f.win.emit('keydown');f.win.emit('error',{message:'private signed URL'});
  f.win.emit('unhandledrejection',{reason:'secret account'});
  assert.equal(f.health.report().keys,1);assert.equal(f.health.report().errors,2);
  assert.doesNotMatch(JSON.stringify(f.health.report()),/private|secret|URL|account/);
  assert.equal(startPlaybackHealth(f.doc,f.win),f.health);
  f.health.destroy();assert.equal(f.timers.size,0);
});
test('delayed timer delivery is distinguished from missing media updates or a non-advancing position',()=>{
  const f=fixture();f.media('timeupdate');f.advance(1000);
  const overdue=[...f.timers.values()][0];f.timers.clear();f.advance(6000);
  overdue.fn();const report=f.health.report();
  assert.equal(report.maxDelay,5000);assert.equal(report.stalls,1);
  assert.equal(report.updateAge,'7s');assert.equal(report.progressAge,'unavailable');
  f.video.currentTime=10;f.advance(1000);
  assert.equal(f.health.report().progressAge,'0s');
  f.advance(5000);assert.equal(f.health.report().progressAge,'5s');
});
test('background and relaunch gaps do not count as script stalls',()=>{
  const f=fixture();const overdue=[...f.timers.values()][0];f.timers.clear();f.advance(600000);
  f.doc.emit('visibilitychange');f.win.emit('pageshow');overdue.fn();
  assert.equal(f.health.report().stalls,0);assert.equal(f.health.report().maxDelay,0);
});
