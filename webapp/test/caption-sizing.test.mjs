import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startCaptionSizing} from '../src/caption-sizing.mjs';
for (const cobalt of [false,true]) test(`caption text sizing and restoration with ${cobalt ? 'Cobalt' : 'browser'} CSS APIs`,()=>{
  let size='youtube',attached=true,callback,observers=0,disconnected=0,writes=0;
  const styles=new Map([['font-size',{value:'40px',priority:''}]]);
  const node={style:{getPropertyValue:key=>styles.get(key)?.value||'',getPropertyPriority:key=>styles.get(key)?.priority||'',setProperty:(key,value,priority)=>{writes++;styles.set(key,{value,priority});},removeProperty:key=>styles.delete(key)}};
  if(cobalt) {
    delete node.style.getPropertyPriority;
    node.style.setProperty=(key,value)=>{writes++;styles.set(key,{value,priority:''});};
    Object.defineProperty(node.style,'cssText',{
      get:()=>[...styles].map(([key,item])=>`${key}:${item.value}${item.priority?' !'+item.priority:''};`).join(''),
      set:value=>{styles.clear();for(const declaration of value.split(';')){const [key,raw]=declaration.split(':');if(!raw)continue;styles.set(key.trim(),{value:raw.replace(/\s*!important\s*$/,'').trim(),priority:/!important/.test(raw)?'important':''});}}
    });
  }

  const doc={documentElement:{contains:()=>attached},querySelectorAll:selector=>attached && selector.startsWith('.ytp') ? (cobalt ? {0:node,length:1} : [node]) : (cobalt ? {length:0} : [])};
  const win={getComputedStyle:()=>({fontSize:'40px'}),addEventListener(){},requestAnimationFrame:fn=>{callback=fn;return 1;},cancelAnimationFrame(){},MutationObserver:class{constructor(fn){this.fn=fn;observers++;}observe(){}disconnect(){disconnected++;}}};
  const api=startCaptionSizing(doc,win,()=>size);assert.equal(observers,0);
  for(const [setting,pixels] of [['smallest','24px'],['small','32px'],['large','50px'],['extra','60px'],['normal','40px']]) {
    size=setting;assert.equal(api.refresh(),1);assert.equal(styles.get('font-size').value,pixels);assert.equal(styles.get('font-size').priority,'important');
  }
  const previousWrites=writes;api.refresh();assert.equal(writes,previousWrites);
  assert.equal(observers,1);size='youtube';api.refresh();assert.equal(disconnected,1);assert.deepEqual(styles.get('font-size'),{value:'40px',priority:''});assert.equal(styles.has('line-height'),false);
  size='large';api.refresh();attached=false;api.refresh();assert.deepEqual(styles.get('font-size'),{value:'40px',priority:''});
});


test('caption observation ignores unrelated animation and coalesces caption changes',()=>{
  let callback,queued=0,frame;
  const doc={documentElement:{contains:()=>true},querySelectorAll:()=>({length:0})};
  const win={getComputedStyle(){},addEventListener(){},requestAnimationFrame:fn=>{queued++;frame=fn;return queued;},cancelAnimationFrame(){},MutationObserver:class{constructor(fn){callback=fn;}observe(){}disconnect(){}}};
  startCaptionSizing(doc,win,()=> 'large');
  const other={matches:()=>false,querySelector:()=>null};
  callback([{type:'attributes',target:other}]);assert.equal(queued,0);
  const caption={matches:()=>true};
  const record={type:'childList',target:other,addedNodes:{0:caption,length:1},removedNodes:{length:0}};
  callback([record]);callback([record]);assert.equal(queued,1);frame();
  callback([{type:'attributes',target:caption}]);assert.equal(queued,2);
});
