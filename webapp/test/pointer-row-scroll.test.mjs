import {test} from 'node:test';
import assert from 'node:assert/strict';
import {horizontalReveal} from '../src/pointer-row-scroll.mjs';

test('pointer reveal moves only enough to expose a clipped card with a gap',()=>{
  assert.equal(horizontalReveal(0,80,1200,884,1124,1000,28),0);
  assert.equal(horizontalReveal(0,80,1200,1152,1392,1000,28),220);
  assert.equal(horizontalReveal(220,80,1200,-140,100,1000,28),0);
  assert.equal(horizontalReveal(980,80,1200,1150,1390,1000,28),1000);
  assert.equal(horizontalReveal(0,80,1200,80,200,0,28),0);
});
test('unavailable geometry cannot produce a scroll offset',()=>{
  assert.equal(horizontalReveal(10,0,NaN,20,40,100,28),10);
  assert.equal(horizontalReveal(10,50,40,20,40,100,28),10);
  assert.equal(horizontalReveal(10,0,100,20,40,-1,28),10);
});
