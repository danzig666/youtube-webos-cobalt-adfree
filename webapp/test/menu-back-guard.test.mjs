import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMenuBackGuard} from '../src/menu-back-guard.mjs';
test('BACK closes only settings and consumes all repeats and release events',()=>{
  for(const code of [461,8,27]) {
    let open=true, closed=0;
    const handler=createMenuBackGuard(()=>open,()=>{open=false;closed++;});
    for(const type of ['keydown','keydown','keypress','keyup']) {
      const event={type,keyCode:code,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediate=true;}};
      assert.equal(handler(event),true); assert.ok(event.prevented&&event.stopped&&event.immediate);
    }
    assert.equal(closed,1);
    assert.equal(handler({type:'keydown',keyCode:code}),false);
  }
});
test('closed settings leave ordinary playback keys alone',()=>{
  const handler=createMenuBackGuard(()=>false,()=>assert.fail('closed playback'));
  for(const code of [13,37,38,39,40]) assert.equal(handler({type:'keydown',keyCode:code}),false);
});

test('a missing Back release does not swallow a later deliberate playback Back press', () => {
  let open = true, time = 1000, closes = 0;
  const handler = createMenuBackGuard(() => open, () => {open = false; closes++;}, () => time);
  const event = type => ({type, keyCode: 461, preventDefault() {}, stopPropagation() {}});
  assert.equal(handler(event('keydown')), true);
  time += 100;
  assert.equal(handler(event('keypress')), true);
  time += 500;
  assert.equal(handler(event('keydown')), false);
  assert.equal(handler(event('keyup')), false);
  assert.equal(closes, 1);
});

test('held Back repeats stay guarded without a repeat flag, including a late release', () => {
  let open = true, time = 0, closes = 0;
  const handler = createMenuBackGuard(() => open, () => {open = false; closes++;}, () => time);
  const event = type => ({type, keyCode: 461, preventDefault() {}, stopPropagation() {}});
  for (let i = 0; i < 100; i++) {
    time += 100;
    assert.equal(handler(event('keydown')), true);
  }
  time += 2000;
  assert.equal(handler({...event('keydown'), repeat: true}), true);
  time += 2000;
  assert.equal(handler(event('keyup')), true);
  assert.equal(closes, 1);
});

test('a fresh Back can close a reopened menu after the preceding release was lost', () => {
  let open = true, time = 0, closes = 0;
  const handler = createMenuBackGuard(() => open, () => {open = false; closes++;}, () => time);
  const event = {type: 'keydown', keyCode: 461, preventDefault() {}, stopPropagation() {}};
  assert.equal(handler(event), true);
  open = true; time = 500;
  assert.equal(handler(event), true);
  assert.equal(open, false); assert.equal(closes, 2);
});
