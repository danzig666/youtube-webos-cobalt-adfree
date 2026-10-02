import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheelScrollDelta } from '../src/wheel-scroll.mjs';
test('wheel accepts pixel, Starboard line and page units with bounded steps', () => {
  assert.equal(wheelScrollDelta({ deltaY: 12, deltaMode: 0 }, 300), 12);
  assert.equal(wheelScrollDelta({ deltaY: -1, deltaMode: 1 }, 300), -48);
  assert.equal(wheelScrollDelta({ deltaY: 0.5, deltaMode: 1 }, 300), 24);
  assert.equal(wheelScrollDelta({ deltaY: 1, deltaMode: 2 }, 300), 255);
  assert.equal(wheelScrollDelta({ deltaY: 100, deltaMode: 1 }, 300), 270);
  assert.equal(wheelScrollDelta({ deltaY: -100, deltaMode: 1 }, 300), -270);
  for (const deltaY of [NaN, Infinity, -Infinity, undefined, 0])
    assert.equal(wheelScrollDelta({ deltaY }, 300), 0);
});
