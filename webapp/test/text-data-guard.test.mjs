import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/text-data-guard.js',import.meta.url),'utf8');
test('native inherited CharacterData accessors remain intact without synthetic child mutations',()=>{
  class CharacterData {get data(){return this.textContent;}set data(value){this.textContent=value;}}
  class Text extends CharacterData {}
  const original=Object.getOwnPropertyDescriptor(CharacterData.prototype,'data');
  const context=vm.createContext({Text,console:{warn(){}},document:{createTextNode(){throw Error('unexpected child mutation');}}});
  vm.runInContext(source,context);vm.runInContext(source,context);
  assert.equal(Object.getOwnPropertyDescriptor(Text.prototype,'data'),undefined);
  assert.equal(Object.getOwnPropertyDescriptor(CharacterData.prototype,'data').set,original.set);
  const text=new Text();text.data='caption';assert.equal(text.data,'caption');
});
test('missing data fallback is idempotent and never inserts phantom children',()=>{
  class Text {get textContent(){return this.value||'';}set textContent(value){this.value=value;this.writes=(this.writes||0)+1;}}
  const context=vm.createContext({Text,console:{warn(){}},document:{createTextNode(){throw Error('unexpected child mutation');}}});
  vm.runInContext(source,context);const text=new Text();
  text.data='caption';for(let i=0;i<100;i++)text.data='caption';assert.equal(text.writes,1);
  text.data=null;assert.equal(text.data,'');assert.equal(text.writes,2);
});
