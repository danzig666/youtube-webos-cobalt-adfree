import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHomeRefresh, consumeHomeRefresh, isHomeScreen, createHomeRefreshButton, createHomeReloadButton, homeRefreshReport} from '../src/home-refresh.mjs';
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
  const actions=createHomeRefresh(doc,win,(...args)=>messages.push(args));
  const refresh=actions.reload;
  return {win,doc,classes,refresh,light:actions,frames,messages,get reloads(){return reloads;}};
}
function key(type='keydown',extra={}) {return {type,key:'9',preventDefault(){this.blocked=true;},stopPropagation(){},...extra};}
test('native Cobalt URL without searchParams can refresh and bypass startup routing',()=>{
  const runtime=vm.createContext({URL:CobaltURL});
  vm.runInContext(readFileSync(new URL('../src/home-refresh.mjs',import.meta.url),'utf8').replace(/export function /g,'function '),runtime);
  const f=fixture('https://www.youtube.com/tv#/',CobaltURL);
  f.refresh=runtime.createHomeRefresh(f.doc,f.win,(...args)=>f.messages.push(args)).reload;
  assert.equal(runtime.isHomeScreen(f.doc,f.win),true);
  assert.equal(f.refresh(),true);f.frames.shift()();assert.equal(f.reloads,1);
  assert.match(f.win.location.href,/ytaf_refresh_home=1/);
  assert.equal(runtime.consumeHomeRefresh(f.win),true);assert.equal(runtime.consumeHomeRefresh(f.win),false);
  // Reload from the marked address must also work without searchParams.
  const next=fixture(f.win.location.href,CobaltURL);next.win.location.replace=()=>assert.fail('must reload');
  next.refresh=runtime.createHomeRefresh(next.doc,next.win,()=>{}).reload;
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
  assert.equal(f.win.location.href,'https://www.youtube.com/tv#/');assert.match(f.messages.at(-1)[0],/Could not reload/);assert.equal(f.refresh(),true);
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

function softFixture(constantUrl=false, hideInsteadOfRemove=false) {
  const f=fixture(), calls=[], events=new Map();
  let currentHome, awayCard=null;
  const guides=[];
  f.win.addEventListener=(type,fn)=>events.set(type,fn);
  f.win.clearTimeout=()=>{};
  function card() {return {connected:true,visible:true,getClientRects(){return this.visible?[{}]:[];}};}
  currentHome=card();let cards=[currentHome];
  function hide(node){node.visible=false;if(!hideInsteadOfRemove)node.connected=false;}
  function setGuide(id,select) {
    const node={__instance:{props:{data:{navigationEndpoint:{browseEndpoint:{browseId:id}}},onSelect:select}}};guides.push(node);return node;
  }
  const home=setGuide('FEwhat_to_watch',()=>{
    calls.push('home');if(awayCard)hide(awayCard);currentHome=card();cards.push(currentHome);
    if(!constantUrl)f.win.location.href='https://www.youtube.com/tv#/';
  });
  const away=setGuide('FElibrary',()=>{
    calls.push('library');hide(currentHome);awayCard=card();cards.push(awayCard);
    if(!constantUrl)f.win.location.href='https://www.youtube.com/tv#/browse/FElibrary';
  });
  f.doc.documentElement={contains:node=>node.connected};
  f.doc.querySelectorAll=selector=>selector==='ytlr-guide-entry-renderer'?guides:cards;
  let closes=0;
  f.refresh=createHomeRefresh(f.doc,f.win,(...args)=>f.messages.push(args),()=>closes++);
  return Object.assign(f,{calls,guides,home,away,events,tick(){assert.ok(f.frames.length);f.frames.shift()();},getCloses:()=>closes});
}
test('soft refresh selects Library and then fresh Home guide callback without replacing or reloading the app',()=>{
  const f=softFixture();assert.equal(f.refresh(),true);assert.equal(f.refresh(),false);
  f.tick();assert.deepEqual(f.calls,['library']);assert.equal(f.getCloses(),1);
  // Navigation can replace guide component instances. Never invoke old props.
  const original=f.home.__instance.props.onSelect;
  f.home.__instance={props:{data:{navigationEndpoint:{browseEndpoint:{browseId:'FEwhat_to_watch'}}},onSelect:()=>{f.calls.push('fresh instance');original();}}};
  f.tick();assert.deepEqual(f.calls,['library','fresh instance','home']);f.tick();
  assert.equal(f.reloads,0);
  assert.match(f.messages[0][0],/sidebar refresh/);
  assert.match(homeRefreshReport(f.doc,f.win),/light \/ returned-home/);
  assert.equal(f.refresh(),true);
});
test('soft refresh observes cached hidden cards and constant-URL navigation instead of assuming a URL change',()=>{
  const f=softFixture(true,true);f.refresh();f.tick();assert.deepEqual(f.calls,['library']);
  f.tick();assert.deepEqual(f.calls,['library','home']);f.tick();assert.equal(f.reloads,0);assert.equal(f.refresh(),true);
});
test('slow Library navigation is observed before returning Home; ignored callbacks time out without reload',()=>{
  const f=softFixture();const select=f.away.__instance.props.onSelect;
  f.away.__instance.props.onSelect=()=>f.calls.push('requested');
  f.refresh();f.tick();for(let i=0;i<10;i++)f.tick();assert.deepEqual(f.calls,['requested']);
  select();f.tick();assert.deepEqual(f.calls,['requested','library','home']);f.tick();assert.equal(f.reloads,0);
  const ignored=softFixture();ignored.away.__instance.props.onSelect=()=>{};ignored.refresh();ignored.tick();
  for(let i=0;i<30;i++)ignored.tick();assert.equal(ignored.reloads,0);
  assert.match(ignored.messages.at(-1)[0],/no page change detected/);
  assert.match(homeRefreshReport(ignored.doc,ignored.win),/departure-timeout/);
});
test('soft refresh reports a lost Home hook without reloading the temporary page',()=>{
  const f=softFixture();f.refresh();f.tick();f.home.__instance=null;f.tick();
  assert.equal(f.reloads,0);assert.ok(f.win.location.href.includes('FElibrary'));
  assert.match(f.messages.at(-1)[0],/Home control disappeared/);
  assert.match(homeRefreshReport(f.doc,f.win),/home-hook-lost/);
});
test('unavailable soft prerequisites report their reason without reload; Subscriptions can substitute for Library',()=>{
  const f=softFixture();f.guides.splice(f.guides.indexOf(f.away),1);assert.equal(f.refresh(),false);assert.equal(f.frames.length,0);assert.equal(f.reloads,0);assert.deepEqual(f.calls,[]);
  assert.match(f.messages.at(-1)[0],/Library\/Subscriptions controls unavailable/);
  const sub=softFixture(true);sub.away.__instance.props.data.navigationEndpoint.browseEndpoint.browseId='FEsubscriptions';
  sub.refresh();sub.tick();sub.tick();sub.tick();assert.deepEqual(sub.calls,['library','home']);assert.equal(sub.reloads,0);
});
test('soft refresh cancels for playback or unrelated navigation without forcing Home or reloading',()=>{
  for(const change of [f=>f.classes.add('WEB_PAGE_TYPE_WATCH'),f=>f.win.location.href='https://www.youtube.com/tv#/search']) {
    const f=softFixture();f.refresh();f.tick();change(f);f.tick();assert.deepEqual(f.calls,['library']);assert.equal(f.reloads,0);
  }
});
test('user navigation and page exit cancel pending soft return; activation releases do not',()=>{
  for(const [type,event] of [['keydown',{key:'ArrowRight'}],['pointerdown',{target:{}}],['pagehide',{}]]) {
    const f=softFixture();f.refresh();f.tick();f.events.get(type)(event);f.tick();assert.deepEqual(f.calls,['library']);assert.equal(f.reloads,0);
  }
  const f=softFixture();f.refresh();f.tick();f.events.get('mousedown')({target:{id:'__refresh_home'}});f.tick();assert.deepEqual(f.calls,['library','home']);
});

test('an ignored Home return times out visibly without reloading',()=>{
  const f=softFixture();f.home.__instance.props.onSelect=()=>f.calls.push('ignored home');
  f.refresh();f.tick();f.tick();for(let i=0;i<30;i++)f.tick();assert.equal(f.reloads,0);
  assert.ok(f.win.location.href.includes('FElibrary'));
  assert.match(homeRefreshReport(f.doc,f.win),/home-return-timeout/);
});

test('light failures do not rewrite an existing reload marker or bypass startup on another page',()=>{
  const f=softFixture();f.win.location.href='https://www.youtube.com/tv?ytaf_refresh_home=1#/';
  const select=f.away.__instance.props.onSelect;
  f.away.__instance.props.onSelect=()=>{select();f.win.location.href='https://www.youtube.com/tv?ytaf_refresh_home=1#/browse/FElibrary';};
  f.refresh();f.tick();f.home.__instance=null;f.tick();
  assert.equal(f.win.location.href,'https://www.youtube.com/tv?ytaf_refresh_home=1#/browse/FElibrary');
  assert.equal(f.reloads,0);assert.equal(consumeHomeRefresh(f.win),false);
});
test('missing guide renderers do not silently turn light refresh into an app reload',()=>{
  const f=fixture();assert.equal(f.light(),false);assert.equal(f.frames.length,0);assert.equal(f.reloads,0);
  assert.match(f.messages.at(-1)[0],/Home control unavailable/);
  assert.match(homeRefreshReport(f.doc,f.win),/home-hook-unavailable/);
  assert.equal(f.light.reload(),true);f.frames.shift()();assert.equal(f.reloads,1);
});
test('route-changing sidebar refresh does not require specific video-card renderers',()=>{
  const f=softFixture();const query=f.doc.querySelectorAll;
  f.doc.querySelectorAll=selector=>selector==='ytlr-guide-entry-renderer'?query(selector):[];
  assert.equal(f.refresh(),true);f.tick();f.tick();f.tick();
  assert.deepEqual(f.calls,['library','home']);assert.equal(f.reloads,0);
  assert.match(homeRefreshReport(f.doc,f.win),/returned-home/);
});
test('light refresh never treats missing cards and an unchanged URL as observed navigation',()=>{
  const f=softFixture(true);const query=f.doc.querySelectorAll;
  f.doc.querySelectorAll=selector=>selector==='ytlr-guide-entry-renderer'?query(selector):[];
  f.refresh();f.tick();for(let i=0;i<30;i++)f.tick();
  assert.deepEqual(f.calls,['library']);assert.equal(f.reloads,0);
  assert.match(homeRefreshReport(f.doc,f.win),/departure-timeout/);
});
test('late loading away cards do not count as a confirmed Home return on constant-URL clients',()=>{
  const f=softFixture(true), query=f.doc.querySelectorAll, select=f.away.__instance.props.onSelect;
  let loading=false;
  f.doc.querySelectorAll=selector=>selector==='ytlr-guide-entry-renderer' || !loading?query(selector):[];
  f.away.__instance.props.onSelect=()=>{select();loading=true;};
  // The return is ignored, then the other page finishes loading its cards.
  f.home.__instance.props.onSelect=()=>{f.calls.push('ignored home');loading=false;};
  f.refresh();f.tick();f.tick();for(let i=0;i<30;i++)f.tick();
  assert.equal(f.reloads,0);assert.match(homeRefreshReport(f.doc,f.win),/home-return-timeout/);
});
test('callback exceptions do not request a reload, reveal private data or lock further attempts',()=>{
  for(const which of ['away','home']) {
    const f=softFixture();f[which].__instance.props.onSelect=()=>{throw Error('signed secret URL');};
    f.refresh();f.tick();if(which==='home')f.tick();
    assert.equal(f.reloads,0);assert.equal(f.messages.flat().join('').includes('secret'),false);
    assert.match(homeRefreshReport(f.doc,f.win),new RegExp(which+'-callback-failed'));
    f.win.location.href='https://www.youtube.com/tv#/';assert.equal(f.refresh(),true);
  }
});
test('both Home actions respect remote eligibility and use separate labels',()=>{
  assert.ok(shortcutOptions.some(o=>o.value==='reload_home' && /startup logo/.test(o.label)));
  for(const action of ['refresh_home','reload_home']) {
    for(const href of ['https://www.youtube.com/tv#/','https://www.youtube.com/tv#/watch?v=aaaaaaaaaaa','https://www.youtube.com/tv#/browse/FEsubscriptions']) {
      const f=fixture(href),calls=[];
      const handle=createShortcutHandler(f.doc,k=>k==='enableNumericShortcuts'?true:{9:action},a=>calls.push(a));
      const allowed=href==='https://www.youtube.com/tv#/';
      assert.equal(handle(key()),allowed);assert.deepEqual(calls,allowed?[action]:[]);
    }
  }
});
test('explicit reload button also suppresses a trailing synthetic click',()=>{
  const f=menuFixture();let calls=0;createHomeReloadButton(f.doc,()=>calls++);
  f.press('__reload_home');f.click('__reload_home');assert.equal(calls,1);
});
test('Home diagnostics only contain bounded statuses and counts, not guide metadata or URLs',()=>{
  const f=softFixture();f.home.__instance.props.data.account='secret account';
  f.win.location.href='https://www.youtube.com/tv?credential=secret-token#/';
  const report=homeRefreshReport(f.doc,f.win);
  assert.match(report,/guide renderers: 2/);assert.match(report,/Home true, Library true/);
  assert.equal(report.includes('secret'),false);assert.equal(report.includes('https:'),false);assert.ok(report.length<512);
});
test('a cancelled request cannot run after a later Home refresh has started',()=>{
  const f=softFixture();f.refresh();f.events.get('keydown')({key:'ArrowRight'});
  f.refresh();f.tick();assert.deepEqual(f.calls,[]);f.tick();f.tick();f.tick();
  assert.deepEqual(f.calls,['library','home']);assert.equal(f.reloads,0);
});
