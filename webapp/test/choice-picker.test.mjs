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
    const event={type,target:checkbox,preventDefault(){this.prevented=true;},stopPropagation(){}};
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
