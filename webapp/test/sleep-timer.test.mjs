import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSleepTimer, createSleepTimerPanel } from '../src/sleep-timer.mjs';
import { menuFixture } from './helpers/menu-fixture.mjs';
function setup() {
  let now = 1000, next = 1, expired = 0;
  const pending = new Map();
  const timer = createSleepTimer({now: () => now,
    schedule(fn) { const id = next++; pending.set(id, fn); return id; },
    cancel: id => pending.delete(id), onChange() {}, onExpire() { expired++; }});
  return { timer, pending, expireCount: () => expired, advance(ms) { now += ms; timer.check(); } };
}
test('sleep timer expires once after a long suspension, using its deadline', () => {
  const s = setup(); s.timer.setMinutes(15); s.advance(30 * 60000);
  assert.equal(s.expireCount(), 1); assert.equal(s.timer.state().minutes, 0);
  s.advance(60000); assert.equal(s.expireCount(), 1); assert.equal(s.pending.size, 0);
});
test('cancel and replacement invalidate already queued timer callbacks', () => {
  const s = setup(); s.timer.setMinutes(15); const old = [...s.pending.values()][0];
  s.timer.setMinutes(60); s.advance(16 * 60000); old();
  assert.equal(s.expireCount(), 0); assert.equal(s.timer.state().minutes, 60);
  const replaced = [...s.pending.values()][0]; s.timer.setMinutes(0); replaced(); s.advance(90 * 60000);
  assert.equal(s.expireCount(), 0); assert.equal(s.pending.size, 0);
});
test('invalid durations preserve a running timer and do not schedule extra work', () => {
  const s = setup(); s.timer.setMinutes(30);
  for (const invalid of [-1, NaN, Infinity, 1, '15']) assert.equal(s.timer.setMinutes(invalid), false);
  assert.equal(s.timer.state().minutes, 30); assert.equal(s.pending.size, 1);
});
test('remote timer selection and cancel resist repeat and synthetic clicks', () => {
  const f = menuFixture(), notifications = [];
  const win = { setTimeout() { return 1; }, clearTimeout() {}, addEventListener() {} };
  const panel = createSleepTimerPanel(f.doc, win, f.choices, text => notifications.push(text));
  f.press('__sleep_timer'); f.key('ArrowDown', 40); f.key('Enter', 13); f.click('__sleep_timer');
  assert.equal(win.__ytafSleepTimer.timer.state().minutes, 15);
  assert.match(panel.children[1].textContent, /15:00/);
  f.press('__sleep_timer_cancel'); f.click('__sleep_timer_cancel');
  assert.equal(win.__ytafSleepTimer.timer.state().minutes, 0);
  assert.equal(f.nodes.get('__sleep_timer').textContent, 'Off  ▾');
  assert.equal(notifications.length, 0);
});
test('rebuilding the timer panel retains a deadline without extra lifecycle listeners', () => {
  const f = menuFixture(); let registrations = 0;
  const win = {setTimeout() { return 1; }, clearTimeout() {}, addEventListener() { registrations++; }};
  createSleepTimerPanel(f.doc, win, f.choices, () => {});
  win.__ytafSleepTimer.timer.setMinutes(30);
  createSleepTimerPanel(f.doc, win, f.choices, () => {});
  assert.equal(win.__ytafSleepTimer.timer.state().minutes, 30);
  assert.equal(registrations, 1);
});
test('expired timer pauses the current video on resume and reports pause failures honestly', () => {
  for (const kind of ['playing', 'missing', 'throws']) {
    const f=menuFixture(), notices=[]; let now=1000, calls=0;
    const video={paused:false, pause() { calls++; if(kind==='throws') throw Error('unavailable'); this.paused=true; }};
    f.nodes.set('video',kind==='missing'?null:video);
    const win={Date:{now:()=>now},setTimeout(){return 1;},clearTimeout(){},addEventListener(){}};
    const panel=createSleepTimerPanel(f.doc,win,f.choices,message=>notices.push(message));
    win.__ytafSleepTimer.timer.setMinutes(15); now+=16*60000;
    f.doc.dispatchEvent({type:'visibilitychange'}); f.doc.dispatchEvent({type:'visibilitychange'});
    assert.equal(notices.length,1); assert.equal(calls,kind==='missing'?0:1);
    assert.equal(f.nodes.get('__sleep_timer').textContent,'Off  ▾');
    assert.match(panel.children[1].textContent,kind==='throws'?/could not be paused/:kind==='missing'?/No video/:/Playback paused/);
  }
});
