import {test} from 'node:test';
import assert from 'node:assert/strict';
import {menuFixture} from './helpers/menu-fixture.mjs';
function fixture(){const f=menuFixture(),writes=[];f.choices.add('test','Choice','a',[{value:'a',label:'First'},{value:'b',label:'Second'},{value:'c',label:'Third'}],value=>writes.push(value));return {...f,writes};}
test('opening a combobox never changes the selection; explicit OK selects once',()=>{
  const f=fixture();f.press('test');assert.equal(f.choices.isOpen(),true);assert.deepEqual(f.writes,[]);
  f.key('ArrowDown',40);f.key('Enter',13);assert.deepEqual(f.writes,['b']);assert.equal(f.choices.isOpen(),false);
  f.click('test');assert.equal(f.choices.isOpen(),false);assert.equal(f.nodes.get('test').getAttribute('aria-expanded'),'false');
});
test('BACK cancels a picker with no save and wheel moves without changing settings',()=>{
  const f=fixture();f.press('test');
  f.choices.handleWheel({deltaY:1,deltaMode:1,preventDefault(){},stopPropagation(){}});
  assert.deepEqual(f.writes,[]);f.key('BrowserBack',461);assert.equal(f.choices.isOpen(),false);assert.deepEqual(f.writes,[]);
  assert.match(f.nodes.get('test').textContent,/First/);
});
test('pointer selects a named option directly and failed saves retain the old value',()=>{
  const f=fixture();f.click('test');
  const root=f.doc.body.children[0], options=root.children[2].children[0].children;
  options[2].listeners.click({preventDefault(){},stopPropagation(){}});
  assert.deepEqual(f.writes,['c']);assert.equal(f.doc.body.children.length,0);
  f.choices.add('failed','Failure','a',[{value:'a',label:'Old'},{value:'b',label:'New'}],()=>false);
  assert.equal(f.choices.select('failed','b'),false);assert.match(f.nodes.get('failed').textContent,/Old/);
});


test('closing settings with OK consumes the trailing activation release',()=>{
  const f=menuFixture(),wrapper=f.doc.createElement('div'),node=f.doc.createElement('div');
  node.id='close';node.dataset.ytafControl='action';node.__ytafActivate=()=>f.setOpen(false);wrapper.appendChild(node);
  assert.deepEqual(f.press('close'),[true,true,true,true]);
});

test('Magic Remote pointer release selects once without a synthetic click',()=>{
  const f=fixture();f.click('test');
  const options=f.doc.body.children[0].children[2].children[0].children;
  const event={button:0,preventDefault(){},stopPropagation(){}};
  options[1].listeners.pointerup({...event,button:2});assert.deepEqual(f.writes,[]);
  options[1].listeners.pointerup(event);
  options[1].listeners.mouseup(event);options[1].listeners.click(event);
  assert.deepEqual(f.writes,['b']);assert.equal(f.choices.isOpen(),false);
});
test('outside pointer and category close remove the portal without stealing focus',()=>{
  const f=fixture();f.click('test');
  const root=f.doc.body.children[0], option=root.children[2].children[0].children[1];
  assert.equal(f.choices.contains(option),true);
  f.doc.dispatchEvent({type:'pointerdown',target:option});assert.equal(f.choices.isOpen(),true);
  f.doc.dispatchEvent({type:'pointerdown',target:f.doc.body,preventDefault(){},stopPropagation(){}});assert.equal(f.choices.isOpen(),false);
  f.choices.open('test');f.choices.close(false);
  assert.equal(f.doc.body.children.length,0);assert.deepEqual(f.writes,[]);
});

test('compatibility mouse events re-targeted under a dismissed popup cannot toggle a switch',()=>{
  const f=fixture();f.click('test');
  const option=f.doc.body.children[0].children[2].children[0].children[1];
  const checkbox=f.doc.createElement('div');let toggles=0;
  option.listeners.pointerup({button:0,preventDefault(){},stopPropagation(){}});
  for(const type of ['mousedown','mouseup','click']) {
    const event={type,target:checkbox,buttons:type==='mousedown'?1:0,preventDefault(){this.prevented=true;},stopPropagation(){}};
    f.doc.dispatchEvent(event);if(!event.prevented)toggles++;
    assert.equal(event.prevented,true,type);
  }
  assert.equal(toggles,0);assert.deepEqual(f.writes,['b']);
  const start={type:'pointerdown',target:checkbox,preventDefault(){this.prevented=true;},stopPropagation(){}};
  f.doc.dispatchEvent(start);assert.equal(start.prevented,undefined);
  const click={...start,type:'click'};f.doc.dispatchEvent(click);assert.equal(click.prevented,undefined);
});
test('an outside click dismisses the picker without activating its underlying setting',()=>{
  const f=fixture();f.click('test');
  for(const type of ['pointerdown','pointerup','mouseup','click']) {
    const event={type,target:f.doc.body,preventDefault(){this.prevented=true;},stopPropagation(){}};
    f.doc.dispatchEvent(event);assert.equal(event.prevented,true);
  }
  assert.equal(f.choices.isOpen(),false);assert.deepEqual(f.writes,[]);
});
test('a callback recovery keeps the restored display instead of showing a rejected speed',()=>{
  const f=menuFixture();f.choices.add('speed','Speed','1',[{value:'1',label:'Normal'},{value:'2',label:'2x'}],()=>f.choices.setValue('speed','1'));
  f.choices.open('speed');f.choose('speed','2');assert.match(f.nodes.get('speed').textContent,/Normal/);
  assert.equal(f.choices.isOpen(),false);
});

test('Magic Remote Enter plus compatibility clicks on the opener leave the list open repeatedly',()=>{
  const f=fixture(),control=f.nodes.get('test');
  for(let iteration=0;iteration<5;iteration++) {
    f.press('test');
    for(const type of ['pointerdown','pointerup','mousedown','mouseup','click']) {
      const event={type,target:control,button:0,preventDefault(){this.prevented=true;},stopPropagation(){}};
      f.doc.dispatchEvent(event);assert.equal(event.prevented,true,type);
      assert.equal(f.choices.isOpen(),true,type);
    }
    assert.deepEqual(f.writes,[]);f.key('BrowserBack',461);
  }
});
test('Magic Remote release/click selects after keyboard opening even without a matching keyup or pointerdown',()=>{
  for(const type of ['pointerup','mouseup','click']) {
    const f=fixture();f.choices.open('test',13);
    const option=f.doc.body.children[0].children[2].children[0].children[1];
    const event={type,target:option,button:0,preventDefault(){this.prevented=true;},stopPropagation(){}};
    f.doc.dispatchEvent(event);assert.equal(event.prevented,undefined);
    option.listeners[type](event);
    assert.deepEqual(f.writes,['b']);assert.equal(f.choices.isOpen(),false);
  }
});
test('keyboard-opened list options are not blocked by the previous popup release guard',()=>{
  const f=fixture();f.click('test');
  f.doc.body.children[0].children[2].children[0].children[1].listeners.pointerup({preventDefault(){},stopPropagation(){}});
  f.choices.open('test',13);
  const option=f.doc.body.children[0].children[2].children[0].children[2];
  const event={type:'click',target:option,button:0,preventDefault(){this.prevented=true;},stopPropagation(){}};
  f.doc.dispatchEvent(event);assert.equal(event.prevented,undefined);option.listeners.click(event);
  assert.deepEqual(f.writes,['b','c']);assert.equal(f.choices.isOpen(),false);
});


test('mouse-only input can immediately reopen after a selection without lifting the pointer-release guard',()=>{
  const f=fixture();f.click('test');
  const option=f.doc.body.children[0].children[2].children[0].children[1];
  option.listeners.mouseup({type:'mouseup',button:0,preventDefault(){},stopPropagation(){}});
  const control=f.nodes.get('test');
  const down={type:'mousedown',target:control,buttons:1,preventDefault(){this.prevented=true;},stopPropagation(){}};
  f.doc.dispatchEvent(down);assert.equal(down.prevented,undefined);f.click('test');
  assert.equal(f.choices.isOpen(),true);assert.deepEqual(f.writes,['b']);
});

test('a completed pointer click does not block the next mouse-only click on a setting',()=>{
  const f=fixture();f.click('test');
  const option=f.doc.body.children[0].children[2].children[0].children[1];
  option.listeners.pointerup({type:'pointerup',button:0,preventDefault(){},stopPropagation(){}});
  const control=f.nodes.get('test');
  for(const type of ['mousedown','mouseup','click']) {
    const event={type,target:control,button:0,buttons:type==='mousedown'?1:0,preventDefault(){this.prevented=true;},stopPropagation(){}};
    f.doc.dispatchEvent(event);assert.equal(event.prevented,true,type);
  }
  const down={type:'mousedown',target:control,button:0,buttons:1,preventDefault(){this.prevented=true;},stopPropagation(){}};
  f.doc.dispatchEvent(down);assert.equal(down.prevented,undefined);
  f.click('test');assert.equal(f.choices.isOpen(),true);assert.deepEqual(f.writes,['b']);
});

test('a rejected option is attempted once per pointer gesture, including its compatibility mouse events',()=>{
  const f=menuFixture(), attempts=[];
  f.choices.add('rejected','Choice','a',[{value:'a',label:'Old'},{value:'b',label:'Unavailable'}],value=>{attempts.push(value);return false;});
  f.choices.open('rejected');
  const option=f.doc.body.children[0].children[2].children[0].children[1];
  const send=type=>{
    const event={type,target:option,button:0,buttons:type.endsWith('down')?1:0,preventDefault(){this.prevented=true;},stopPropagation(){}};
    f.doc.dispatchEvent(event);
    if(!event.prevented)option.listeners[type]?.(event);
  };
  for(const type of ['pointerdown','pointerup','mousedown','mouseup','click'])send(type);
  assert.deepEqual(attempts,['b']);assert.equal(f.choices.isOpen(),true);
  assert.match(f.nodes.get('rejected').textContent,/Old/);
  for(const type of ['mousedown','mouseup','click'])send(type);
  assert.deepEqual(attempts,['b','b']);
});

test('Cobalt final click on a detached option unlocks the next mouse-only gesture',()=>{
  const f=fixture();f.click('test');
  const option=f.doc.body.children[0].children[2].children[0].children[1];
  const event={button:0,preventDefault(){},stopPropagation(){}};
  option.listeners.pointerup({...event,type:'pointerup'});
  assert.equal(f.doc.body.children.length,0);
  // Detached option events do not reach document capture.
  option.listeners.click({...event,type:'click'});
  const down={...event,type:'mousedown',target:f.nodes.get('test'),buttons:0,preventDefault(){this.prevented=true;}};
  f.doc.dispatchEvent(down);assert.equal(down.prevented,undefined);
  f.click('test');assert.equal(f.choices.isOpen(),true);assert.deepEqual(f.writes,['b']);
});

test('menu closure can release a lost picker OK keyup without losing duplicate-key protection',()=>{
  const f=fixture();f.choices.open('test');
  const input=()=>({type:'keydown',keyCode:13,preventDefault(){this.prevented=true;},stopPropagation(){}});
  assert.equal(f.choices.handleKey(input()),true);assert.equal(f.choices.isOpen(),false);
  const repeated=input();
  assert.equal(f.choices.handleKey(repeated),true);assert.equal(repeated.prevented,true);
  // The parent arms a bounded trailing-release guard from this return value.
  assert.equal(f.choices.resetKeys(),true);
  const next=input();
  assert.equal(f.choices.handleKey(next),false);assert.equal(next.prevented,undefined);
  assert.equal(f.choices.resetKeys(),false);
});

test('resetting an open picker reports pending activation and frees a held opening key',()=>{
  const f=fixture();f.choices.open('test',13);
  assert.equal(f.choices.resetKeys(),true);
  f.choices.handleKey({type:'keydown',keyCode:13,preventDefault(){},stopPropagation(){}});
  assert.equal(f.choices.isOpen(),false);
  f.choices.resetKeys();f.choices.open('test');
  f.choices.handleKey({type:'keydown',keyCode:40,preventDefault(){},stopPropagation(){}});
  assert.equal(f.choices.resetKeys(),false);
});


test('options belong to the active settings surface and explicitly enable cursor hit testing',()=>{
  const f=fixture(),owner=f.doc.createElement('div'),oldQuery=f.doc.querySelector;
  f.doc.querySelector=s=>s==='.ytaf-ui-container'?owner:oldQuery(s);
  f.choices.open('test');assert.equal(f.doc.body.children.length,0);
  assert.equal(owner.children.length,1);assert.equal(owner.children[0].style.pointerEvents,'auto');
  f.choices.close();assert.equal(owner.children.length,0);
});
test('mouse-only hover focuses the option that OK will select',()=>{
  const f=fixture();f.choices.open('test');
  const option=f.doc.body.children[0].children[2].children[0].children[2];
  option.listeners.mousemove();f.key('Enter',13);assert.deepEqual(f.writes,['c']);
});
