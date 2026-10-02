import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMediaSourceDiagnostics } from '../src/media-source-diagnostics.mjs';
function environment() {
  const events = [];
  class Buffer extends EventTarget {
    timestampOffset = 0;
    appendBuffer(data) { if (this.reject) throw new Error('secret URL'); return data; }
    abort() { return 17; }
    remove() { return 23; }
  }
  class MediaSource extends EventTarget {
    readyState = 'open';
    addSourceBuffer() { return new Buffer(); }
  }
  return {events, win: {MediaSource, h5vcc: {system: {traceYtafMediaSource: (...args) => events.push(args)}}}};
}
test('MSE tracing preserves operations and emits only numeric metadata', () => {
  const {events, win} = environment();
  assert.equal(installMediaSourceDiagnostics(win), true); assert.equal(installMediaSourceDiagnostics(win), false);
  const sb = new win.MediaSource().addSourceBuffer('audio/webm; codecs="opus"');
  const packet = new Uint8Array([1,2,3]);
  assert.equal(sb.appendBuffer(packet), packet); sb.dispatchEvent(new Event('updateend'));
  sb.timestampOffset = 100; sb.appendBuffer(packet);
  assert.equal(sb.abort(), 17); assert.equal(sb.remove(0, 1), 23);
  sb.reject = true; assert.throws(() => sb.appendBuffer(packet), /secret URL/);
  assert.ok(events.some(args => args[2] === 6 && args[5] === 100));
  assert.ok(events.every(args => args.every(value => typeof value === 'number')));
  win.h5vcc.system.traceYtafMediaSource = () => { throw Error('bridge failed'); };
  sb.reject = false; assert.equal(sb.appendBuffer(packet), packet);
});
test('MSE appends are sampled and each source has a distinct ID', () => {
  const {events, win} = environment(); installMediaSourceDiagnostics(win);
  const a = new win.MediaSource().addSourceBuffer('video/mp4');
  const b = new win.MediaSource().addSourceBuffer('audio/webm');
  for(let i=0;i<1000;i++) { a.appendBuffer(new Uint8Array(4)); a.dispatchEvent(new Event('updateend')); }
  b.appendBuffer(new Uint8Array(1));
  assert.ok(events.length < 60); assert.equal(new Set(events.map(e=>e[0])).size, 2);
});
test('audio completion keeps its append sequence while video appends', () => {
  const {events, win} = environment(); installMediaSourceDiagnostics(win);
  const source = new win.MediaSource();
  const a = source.addSourceBuffer('audio/webm'), v = source.addSourceBuffer('video/webm');
  a.appendBuffer(new Uint8Array(1)); v.appendBuffer(new Uint8Array(1));
  a.dispatchEvent(new Event('updateend'));
  assert.equal(events.at(-1)[1], 1); assert.equal(events.at(-1)[3], 1);
});
test('unsupported source buffers are traced without exposing the exception', () => {
  const {events, win} = environment();
  const failure = new Error('signed URL and credentials');
  win.MediaSource.prototype.addSourceBuffer = () => {throw failure;};
  installMediaSourceDiagnostics(win);
  assert.throws(() => new win.MediaSource().addSourceBuffer('video/webm'), error => error === failure);
  assert.equal(events.at(-1)[2], 9);
  assert.ok(events.every(args => args.every(value => typeof value === 'number')));
});
test('read-only native bindings retain their original operation', () => {
  const {win} = environment(); Object.freeze(win.MediaSource.prototype);
  assert.equal(installMediaSourceDiagnostics(win), false);
  assert.ok(new win.MediaSource().addSourceBuffer('video/webm'));
});
