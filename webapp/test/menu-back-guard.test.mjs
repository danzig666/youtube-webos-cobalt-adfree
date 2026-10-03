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
