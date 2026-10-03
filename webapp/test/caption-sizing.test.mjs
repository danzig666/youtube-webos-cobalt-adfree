import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startCaptionSizing, captionOutline} from '../src/caption-sizing.mjs';
function fixture(size='youtube') {
  let callback, timer, clears=0, disconnected=0, inlineWrites=0;
  const nodes=[];
  const head={children:[],appendChild(node){this.children.push(node);node.parentNode=this;},removeChild(node){this.children=this.children.filter(n=>n!==node);}};
  const events={}, windowEvents={};
  const doc={head,createElement:()=>({textContent:'',setAttribute(){}}),documentElement:{contains:n=>nodes.includes(n)},
    querySelectorAll:s=>s.startsWith('.ytp')?nodes:[],addEventListener:(key,fn)=>events[key]=fn};
  const win={innerHeight:1080,addEventListener:(key,fn)=>windowEvents[key]=fn,
    getComputedStyle:node=>({fontSize:node.naturalSize+'px'}),
    setTimeout(fn,ms){assert.equal(ms,250);timer=fn;return 1;},clearTimeout(){clears++;timer=null;},
    MutationObserver:class{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected++;}}};
  function node(size=40) {
    const attrs=new Map();
    const n={children:[],naturalSize:size,style:{setProperty(){inlineWrites++;}},
      getAttribute:key=>attrs.get(key)??null,setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)};
    nodes.push(n);return n;
  }
  const first=node();const api=startCaptionSizing(doc,win,()=>size);
  return {doc,win,first,nodes,node,api,windowEvents,
    css:()=>head.children[0]?.textContent||'',change:value=>{size=value;events['ytaf-config-changed']({detail:{key:'captionSize'}});},
    mutation:records=>callback(records),tick:()=>timer(),get timer(){return timer;},get clears(){return clears;},
    get disconnected(){return disconnected;},get inlineWrites(){return inlineWrites;}};
}
test('default keeps YouTube size and outline untouched while providing black caption backing',()=>{
  const f=fixture();assert.match(f.css(),/background-color:rgba\(0,0,0,.8\)!important/);
  assert.doesNotMatch(f.css(),/font-size|line-height|text-shadow/);assert.equal(f.inlineWrites,0);
});
test('every custom size uses one stable baseline and a Cobalt-compatible black outline',()=>{
  const f=fixture();
  for(const [size,pixels] of [['smallest',24],['small',32],['normal',40],['large',50],['extra',60]]) {
    f.change(size);assert.match(f.css(),new RegExp('font-size:'+pixels+'px!important'));
    assert.ok(f.css().includes('text-shadow:'+captionOutline+'!important'));
  }
  const original=f.css();f.tick();assert.equal(f.css(),original);assert.equal(f.inlineWrites,0);
});
test('silent cue/parent style changes and complete cue replacement cannot redefine size',()=>{
  const f=fixture('extra');f.first.naturalSize=80;f.tick();assert.match(f.css(),/font-size:60px!important/);
  f.nodes.length=0;const replacement=f.node(100);
  f.mutation([{type:'childList',target:{matches:()=>true}}]);
  assert.match(f.css(),/font-size:60px!important/);assert.equal(f.first.getAttribute('data-ytaf-caption-text'),null);
  assert.equal(replacement.getAttribute('data-ytaf-caption-text'),'');
  // The rule covers unobserved fresh segments too, without another RAF/paint.
  assert.match(f.css(),/\.ytp-caption-segment/);assert.match(f.css(),/caption-window.* \*/);
});
test('default removes only app font/outline rules and preserves later YouTube styles',()=>{
  const f=fixture('extra');f.first.naturalSize=46;f.change('youtube');
  assert.doesNotMatch(f.css(),/font-size|line-height|text-shadow/);assert.equal(f.first.naturalSize,46);
  f.change('large');assert.match(f.css(),/font-size:57.5px!important/);
  assert.equal(f.inlineWrites,0);
});
test('caption observation ignores unrelated animation and applies relevant cues before paint',()=>{
  const f=fixture('large');const original=f.css();f.first.naturalSize=48;
  f.mutation([{type:'attributes',target:{matches:()=>false}}]);assert.equal(f.css(),original);
  f.nodes.length=0;const next=f.node();f.mutation([{type:'childList',target:{matches:()=>false},addedNodes:[{querySelector:()=>next}],removedNodes:[]}]);
  assert.equal(next.getAttribute('data-ytaf-caption-text'),'');assert.match(f.css(),/font-size:50px!important/);
});
test('resolution change scales stable caption pixels; page exit removes owned rules and timer',()=>{
  const f=fixture('extra');f.win.innerHeight=720;f.windowEvents.resize();assert.match(f.css(),/font-size:40px!important/);
  f.windowEvents.pagehide();assert.equal(f.timer,null);assert.equal(f.clears,1);assert.equal(f.disconnected,1);
  assert.equal(f.css(),'');assert.equal(f.first.getAttribute('data-ytaf-caption-text'),null);
});
