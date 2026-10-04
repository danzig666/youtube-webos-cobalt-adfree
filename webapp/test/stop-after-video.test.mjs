import test from 'node:test';
import assert from 'node:assert/strict';
import {createEndStop} from '../src/stop-after-video.mjs';
function fixture() {
  const handlers = new Map();
  let current;
  const win = {location: {href: '?v=aaaaaaaaaaa'}, addEventListener: (type, fn) => handlers.set(type, fn)};
  const doc = {querySelector: () => current, addEventListener: (type, fn) => handlers.set(type, fn)};
  const api = createEndStop(doc, win, () => {});
  function replace() {
    current = {duration: 90, ended: false, paused: false, pause() {this.paused = true;}};
    return current;
  }
  replace();
  return {api, win, get video() {return current;}, replace, emit: (type, video = current) => handlers.get(type)({target: video})};
}
test('stop after video follows a replacement media element for the same video', () => {
  const f = fixture(); f.api.activate();
  const detached = f.video; f.replace(); f.emit('loadedmetadata');
  detached.ended = true; f.emit('ended', detached);
  assert.equal(f.api.state(), 'armed');
  f.video.ended = true; f.emit('ended');
  assert.equal(f.api.state(), 'stopped');
  assert.equal(f.video.paused, true);
});
test('stop after video recognizes the current ending when replacement metadata was not delivered', () => {
  const f = fixture(); f.api.activate(); f.replace();
  f.video.ended = true; f.emit('ended');
  assert.equal(f.api.state(), 'stopped');
});
test('a replacement element for a different video cancels the armed ending', () => {
  const f = fixture(); f.api.activate(); f.replace();
  f.win.location.href = '?v=bbbbbbbbbbb';
  f.video.ended = true; f.emit('ended');
  assert.equal(f.api.state(), 'idle');
  assert.equal(f.video.paused, false);
});
