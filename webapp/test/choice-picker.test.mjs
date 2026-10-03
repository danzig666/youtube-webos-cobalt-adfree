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
