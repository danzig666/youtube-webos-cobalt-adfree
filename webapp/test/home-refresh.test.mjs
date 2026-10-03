import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHomeRefresh, consumeHomeRefresh, isHomeScreen, createHomeRefreshButton} from '../src/home-refresh.mjs';
import {createShortcutHandler, shortcutOptions} from '../src/remote-shortcuts.mjs';
import {menuFixture} from './helpers/menu-fixture.mjs';
class CobaltURL extends URL {
  // Cobalt URLUtils exposes search, but no searchParams attribute.
  get searchParams() { return undefined; }
}
function fixture(href='https://www.youtube.com/tv#/', Url=URL) {
  const frames=[], messages=[];let reloads=0;const classes=new Set();
  const win={URL:Url,location:{href,replace(url){win.location.href=url;reloads++;},reload(){reloads++;}},history:{length:1},setTimeout(fn,delay){assert.equal(delay,100);frames.push(fn);}};
  const doc={body:{classList:{contains:name=>classes.has(name)}},defaultView:win};
  const refresh=createHomeRefresh(doc,win,(...args)=>messages.push(args));
  return {win,doc,classes,refresh,frames,messages,get reloads(){return reloads;}};
}
function key(type='keydown',extra={}) {return {type,key:'9',preventDefault(){this.blocked=true;},stopPropagation(){},...extra};}
test('native Cobalt URL without searchParams can refresh and bypass startup routing',()=>{
  const runtime=vm.createContext({URL:CobaltURL});
  vm.runInContext(readFileSync(new URL('../src/home-refresh.mjs',import.meta.url),'utf8').replace(/export function /g,'function '),runtime);
  const f=fixture('https://www.youtube.com/tv#/',CobaltURL);
  f.refresh=runtime.createHomeRefresh(f.doc,f.win,(...args)=>f.messages.push(args));
  assert.equal(runtime.isHomeScreen(f.doc,f.win),true);
  assert.equal(f.refresh(),true);f.frames.shift()();assert.equal(f.reloads,1);
  assert.match(f.win.location.href,/ytaf_refresh_home=1/);
  assert.equal(runtime.consumeHomeRefresh(f.win),true);assert.equal(runtime.consumeHomeRefresh(f.win),false);
  // Reload from the marked address must also work without searchParams.
  const next=fixture(f.win.location.href,CobaltURL);next.win.location.replace=()=>assert.fail('must reload');
  next.refresh=runtime.createHomeRefresh(next.doc,next.win,()=>{});
  assert.equal(next.refresh(),true);next.frames.shift()();assert.equal(next.reloads,1);
});
test('Home refresh navigates once without History APIs and bypasses startup preference once per document',()=>{
  const f=fixture();assert.equal(f.refresh(),true);assert.equal(f.refresh(),false);assert.equal(f.frames.length,1);
  f.frames.shift()();assert.equal(f.reloads,1);assert.equal(new URL(f.win.location.href).searchParams.get('ytaf_refresh_home'),'1');
  const source=readFileSync(new URL('../src/utils.js',import.meta.url),'utf8');
  const from=source.indexOf('export function handleInitialLaunch'),to=source.indexOf('\n/**',from);
  let preferenceReads=0,selected=0;
  const context=vm.createContext({window:f.win,consumeHomeRefresh,extractLaunchParams:()=>({}),
    configRead(){preferenceReads++;return 'subscriptions';},
    STARTUP_PAGE_ENDPOINTS:{subscriptions:{browseId:'FEsubscriptions'}},startupPageApplied:false,startupPageRun:0,
    document:{querySelectorAll:()=>[{__instance:{props:{data:{navigationEndpoint:{browseEndpoint:{browseId:'FEsubscriptions'}}},onSelect:()=>selected++}}}]},console:{info(){}}});
  vm.runInContext(source.slice(from,to).replace('export ', '')+';handleInitialLaunch();', context);
  assert.equal(preferenceReads,0);
  vm.runInContext('handleInitialLaunch();',context);assert.equal(preferenceReads,1);assert.equal(selected,1);
  assert.equal(consumeHomeRefresh(f.win),false);
  assert.equal(consumeHomeRefresh({location:{href:f.win.location.href}}),true);
});
test('Home refresh is restricted to known Home routes and never interrupts watch or Shorts',()=>{
  for (const href of ['https://www.youtube.com/tv','https://www.youtube.com/tv#/','https://www.youtube.com/tv#/browse/FEwhat_to_watch']) assert.equal(isHomeScreen(fixture(href).doc,fixture(href).win),true);
  for (const href of ['https://www.youtube.com/tv?v=aaaaaaaaaaa#/','https://www.youtube.com/tv?vq=test#/','https://www.youtube.com/tv#/watch?v=aaaaaaaaaaa','https://www.youtube.com/tv#/browse/FEsubscriptions','https://www.youtube.com/tv#/search','https://example.com/tv#/']) {
    const f=fixture(href);assert.equal(f.refresh(),false);assert.equal(f.frames.length,0);assert.equal(f.reloads,0);
  }
  for(const type of ['WEB_PAGE_TYPE_WATCH','WEB_PAGE_TYPE_SHORTS']) {const f=fixture();f.classes.add(type);assert.equal(f.refresh(),false);assert.equal(f.frames.length,0);}
});
test('navigation during refresh notification cancels reload without writing a marker',()=>{
  const f=fixture();f.refresh();f.win.location.href='https://www.youtube.com/tv#/watch?v=aaaaaaaaaaa';f.frames.shift()();
  assert.equal(f.reloads,0);assert.ok(!f.win.location.href.includes('ytaf_refresh_home'));
  f.win.location.href='https://www.youtube.com/tv#/';assert.equal(f.refresh(),true);
});
test('navigation failure leaves the URL and permits another attempt; missing APIs report unavailable',()=>{
  const f=fixture();f.win.location.replace=()=>{throw Error('failed');};f.refresh();f.frames.shift()();
  assert.equal(f.win.location.href,'https://www.youtube.com/tv#/');assert.match(f.messages.at(-1)[0],/Could not refresh/);assert.equal(f.refresh(),true);
  const unavailable=fixture();delete unavailable.win.location.replace;assert.equal(unavailable.refresh(),false);assert.match(unavailable.messages[0][0],/unavailable/);
});
test('refreshing an already marked Home uses reload because Cobalt ignores identical replace URLs',()=>{
  const f=fixture('https://www.youtube.com/tv?ytaf_refresh_home=1#/');
  f.win.location.replace=()=>assert.fail('same URL must use reload');
  assert.equal(f.refresh(),true);f.frames.shift()();assert.equal(f.reloads,1);
});
test('invalid or non-Home refresh markers do not bypass ordinary startup',()=>{
  for(const href of ['https://www.youtube.com/tv?ytaf_refresh_home=0#/','https://www.youtube.com/tv?ytaf_refresh_home=1#/browse/FEsubscriptions','https://www.youtube.com/tv?ytaf_refresh_home=1&v=aaaaaaaaaaa#/']) {
    const f=fixture(href);assert.equal(consumeHomeRefresh(f.win),false);assert.equal(f.win.location.href,href);
  }
});
test('assigned Home key consumes a complete held gesture once; default playback keys stay inactive on Home',()=>{
  const f=fixture(),calls=[];const handle=createShortcutHandler(f.doc,k=>k==='enableNumericShortcuts'?true:{9:'refresh_home'},action=>calls.push(action));
  assert.ok(shortcutOptions.some(o=>o.value==='refresh_home'));
  assert.equal(handle(key()),true);assert.equal(handle(key('keypress')),true);assert.equal(handle(key('keydown')),true);assert.equal(handle(key('keyup')),true);
  assert.deepEqual(calls,['refresh_home']);assert.equal(handle(key('keydown',{key:'1'})),false);
  assert.equal(handle(key()),true);assert.deepEqual(calls,['refresh_home','refresh_home']);
});
test('Home shortcut respects master switch, menu, editing, modifiers and repeats, and leaves playback alone',()=>{
  for(const extra of [{repeat:true},{ctrlKey:true},{target:{tagName:'INPUT'}},{target:{parentElement:{getAttribute:()=> 'searchbox'}}}]) {
    const f=fixture();const handle=createShortcutHandler(f.doc,k=>k==='enableNumericShortcuts'?true:{9:'refresh_home'},()=>assert.fail('must not refresh'));
    assert.equal(handle(key('keydown',extra)),false);
  }
  for(const [enabled,allowNew] of [[false,true],[true,false]]) {
    const f=fixture();const handle=createShortcutHandler(f.doc,k=>k==='enableNumericShortcuts'?enabled:{9:'refresh_home'},()=>assert.fail('must not refresh'));
    assert.equal(handle(key(),allowNew),false);
  }
  const f=fixture('https://www.youtube.com/tv#/watch?v=aaaaaaaaaaa');f.classes.add('WEB_PAGE_TYPE_WATCH');
  const handle=createShortcutHandler(f.doc,k=>k==='enableNumericShortcuts'?true:{9:'refresh_home'},()=>assert.fail('must not refresh'));
  assert.equal(handle(key()),false);
});
test('refresh button ignores the synthetic click following remote activation',()=>{
  const f=menuFixture();let calls=0;createHomeRefreshButton(f.doc,()=>calls++);
  f.press('__refresh_home');f.click('__refresh_home');assert.equal(calls,1);
});

test('Home refresh preserves unrelated parameters and normalizes only its marker without native searchParams',()=>{
  const f=fixture('https://www.youtube.com/tv?theme=cl&ytaf_refresh_home=0&lang=hu#/',CobaltURL);
  f.refresh();f.frames.shift()();assert.equal(f.win.location.href,'https://www.youtube.com/tv?theme=cl&lang=hu&ytaf_refresh_home=1#/');
  for(const href of ['https://www.youtube.com/tv?%76=aaaaaaaaaaa#/','https://www.youtube.com/tv?v#/','https://www.youtube.com/tv?%76q=query#/']) {
    const f=fixture(href,CobaltURL);assert.equal(f.refresh(),false);assert.equal(f.frames.length,0);
  }
});
