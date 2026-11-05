import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/adblock.js',import.meta.url),'utf8')
 .replace(/^import[\s\S]*?;\n/gm,'').replaceAll('export function ','function ');
function list(items){return Object.assign({length:items.length},items);}
test('actual ad hider supports Cobalt indexed NodeLists and missing Element.closest',()=>{
 let enabled=true,observer,disconnected=false;const hidden=[],listeners={};
 const body={nodeType:1}, classes=new Set();
 function tile(){const flags=new Set();return {nodeType:1,parentElement:body,
  classList:{add:name=>{flags.add(name);hidden.push(name);},remove:name=>flags.delete(name)},
  matches:()=>true,flags};}
 const first=tile(),second=tile();
 const ad=parent=>({nodeType:1,parentElement:parent,matches:s=>s.includes('ad-slot'),querySelectorAll:()=>list([])});
 const root={classList:{toggle:(name,value)=>value?classes.add(name):classes.delete(name)}};
 const doc={body,documentElement:root,addEventListener:(type,fn)=>listeners[type]=fn,
  querySelectorAll:s=>s==='.ytaf-hidden-ad-tile'?list([first,second]):list([ad(first)])};
 const ctx=vm.createContext({document:doc,window:{getComputedStyle:()=>({display:'block'})},
  configRead:()=>enabled,MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){disconnected=true;}}});
 vm.runInContext(source,ctx);vm.runInContext('userScriptStartAdBlock()',ctx);
 assert.ok(first.flags.has('ytaf-hidden-ad-tile'));
 const wrapper={nodeType:1,matches:()=>false,querySelectorAll:()=>list([ad(second)])};
 observer([{addedNodes:list([wrapper,{nodeType:3}])}]);assert.ok(second.flags.has('ytaf-hidden-ad-tile'));
 enabled=false;listeners['ytaf-config-changed']({detail:{key:'enableAdBlock'}});
 assert.equal(disconnected,true);assert.equal(first.flags.size+second.flags.size,0);
 assert.equal(classes.size,0);
});
test('a reused tile is shown again once its ad renderer is removed',()=>{
 let observer;const listeners={};
 const body={nodeType:1};
 const flags=new Set();let holdsAd=true;
 const reused={nodeType:1,parentElement:body,matches:s=>!s.includes('ad-slot'),
  querySelector:()=>holdsAd?{}:null,classList:{add:n=>flags.add(n),remove:n=>flags.delete(n)}};
 const ad={nodeType:1,parentElement:reused,matches:s=>s.includes('ad-slot'),querySelectorAll:()=>list([])};
 const doc={body,documentElement:{classList:{toggle(){}}},addEventListener:(type,fn)=>listeners[type]=fn,
  querySelectorAll:s=>s==='.ytaf-hidden-ad-tile'?list(flags.size?[reused]:[]):list(holdsAd?[ad]:[])};
 const ctx=vm.createContext({document:doc,window:{getComputedStyle:()=>({display:'block'})},
  configRead:()=>true,MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}}});
 vm.runInContext(source,ctx);vm.runInContext('userScriptStartAdBlock()',ctx);
 assert.ok(flags.has('ytaf-hidden-ad-tile'));
 observer([{addedNodes:list([]),removedNodes:list([{nodeType:1}])}]);
 assert.ok(flags.has('ytaf-hidden-ad-tile'),'still an ad');
 holdsAd=false;
 observer([{addedNodes:list([]),removedNodes:list([ad])}]);
 assert.equal(flags.size,0);
});
