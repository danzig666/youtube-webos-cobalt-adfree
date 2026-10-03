import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seekTimeline} from '../src/seek-preview.mjs';

test('seek preview uses full VOD duration and the available live DVR window', () => {
  assert.deepEqual(seekTimeline({duration: 300}), {start: 0, end: 300});
  assert.deepEqual(seekTimeline({duration: Infinity, seekable: {
    length: 2, start: i => [30, 80][i], end: i => [60, 120][i]
  }}), {start: 30, end: 120});
});

test('seek preview refuses missing, empty and invalid timelines', () => {
  for (const video of [null, {duration: NaN}, {duration: Infinity, seekable: {length: 0}},
    {seekable: {length: 1, start: () => 50, end: () => 50}}]) {
    assert.equal(seekTimeline(video), null);
  }
});
