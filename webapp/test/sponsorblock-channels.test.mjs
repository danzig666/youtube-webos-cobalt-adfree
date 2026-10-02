import { sponsorBlockAction, segmentKey, automaticSkipTarget } from '../src/sponsorblock-actions.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeChannelExclusions, rememberPlayerChannel, readVideoChannel,
  getCurrentVideoId, channelSkipPolicy, channelExclusionsKey, createChannelExclusionsPanel } from '../src/sponsorblock-channels.mjs';
import { getSponsorBlockSkipTarget } from '../src/sponsorblock-skip-target.mjs';
import { menuFixture } from './helpers/menu-fixture.mjs';
const a='UCaaaaaaaaaaaaaaaaaaaaaa',b='UCbbbbbbbbbbbbbbbbbbbbbb';
const v1='aaaaaaaaaaa',v2='bbbbbbbbbbb';
const response=(videoId,id=a,author='Creator')=>({videoDetails:{videoId,channelId:id,author}});
function windowFor(video=v1) { return {location:{href:`https://www.youtube.com/tv#/watch?v=${video}`}}; }
test('channel exceptions use stable IDs, sanitize names and reject malformed stored entries',()=>{
  const list=normalizeChannelExclusions([{id:a,name:'a'.repeat(200)},{id:a,name:'duplicate'},{id:'not-a-channel'},{id:b}]);
  assert.equal(list.length,2);assert.equal(list[0].name.length,100);assert.equal(list[1].name,b);
  assert.deepEqual(normalizeChannelExclusions(null),[]);
});
test('channel metadata is bounded and never confuses a prefetched or stale response with the current video',()=>{
  const win=windowFor();win.ytInitialPlayerResponse=response(v2,b);
  rememberPlayerChannel(win,response(v2,b));
  assert.equal(readVideoChannel(win,{},v1),null);
  assert.equal(channelSkipPolicy(win,{},v1,[{id:a}]),'waiting-for-channel');
  rememberPlayerChannel(win,response(v1,a));
  assert.equal(channelSkipPolicy(win,{},v1,[{id:a}]),'channel-excluded');
  assert.equal(channelSkipPolicy(win,{},v1,[{id:b}]),'enabled');
  rememberPlayerChannel(win,response(v1,a,'Renamed creator'));
  assert.equal(channelSkipPolicy(win,{},v1,[{id:a,name:'Old name'}]),'channel-excluded');
  for(let i=0;i<20;i++)rememberPlayerChannel(win,response(String(i).padStart(11,'0'),b));
  assert.equal(win.__ytafPlayerChannels.length,8);
  assert.deepEqual(Object.keys(win.__ytafPlayerChannels[0]).sort(),['id','name','videoId']);
});
test('malformed navigation and mismatched player metadata do not identify a channel',()=>{
  assert.equal(getCurrentVideoId({location:{href:'?v=%broken'}}),null);
  const win=windowFor();win.ytplayer={config:{args:{player_response:JSON.stringify(response(v2,b))}}};
  assert.equal(readVideoChannel(win,{},v1),null);
  assert.equal(channelSkipPolicy(win,{},v1,[]),'enabled');
});
test('remote exception action toggles once, removes saved entries, and reports unsaved changes',()=>{
  const f=menuFixture(),win=windowFor();rememberPlayerChannel(win,response(v1));
  let stored=[],writes=0,persisted=true;
  const panel=createChannelExclusionsPanel(f.doc,win,()=>stored,(_key,value)=>{stored=value;writes++;},()=>persisted);
  f.press('__sponsorblock_channel_toggle');f.click('__sponsorblock_channel_toggle');
  assert.equal(writes,1);assert.equal(stored[0].id,a);assert.match(panel.children[1].textContent,/Saved/);
  rememberPlayerChannel(win,response(v2,b));win.location.href=`?v=${v2}`;
  f.doc.dispatchEvent({type:'ytaf-menu-opened'});f.press('__sponsorblock_channel_toggle');
  assert.equal(stored.length,2);
  f.press('__sponsorblock_channel_next');f.press('__sponsorblock_channel_remove');
  assert.equal(stored.length,1);assert.equal(stored[0].id,b);
  persisted=false;f.press('__sponsorblock_channel_toggle');
  assert.equal(stored.length,0);assert.match(panel.children[1].textContent,/only for this session/);
});
test('unknown current channels cannot create an exception for a previously played channel',()=>{
  const f=menuFixture(),win=windowFor();rememberPlayerChannel(win,response(v2,b));let writes=0;
  createChannelExclusionsPanel(f.doc,win,()=>[],()=>writes++,()=>true);
  f.press('__sponsorblock_channel_toggle');assert.equal(writes,0);
});
test('a video change while the menu is open requires reviewing the new channel before saving',()=>{
  const f=menuFixture(),win=windowFor(); rememberPlayerChannel(win,response(v1,a)); let stored=[];
  const panel=createChannelExclusionsPanel(f.doc,win,()=>stored,(_key,value)=>{stored=value;},()=>true);
  win.location.href=`?v=${v2}`;rememberPlayerChannel(win,response(v2,b,'New creator'));
  f.press('__sponsorblock_channel_toggle');assert.equal(stored.length,0);
  assert.match(panel.children[1].textContent,/Now watching New creator/);
  f.press('__sponsorblock_channel_toggle');assert.equal(stored[0].id,b);
});
function controllerFixture(exclusions=[],known=true, mode=null) {
  const win=windowFor(),requests=[],timers=new Map(),intervals=[];let next=1;
  if(known)rememberPlayerChannel(win,response(v1,a));
  Object.assign(win,{addEventListener(){},setTimeout(fn){const id=next++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>{intervals.push(fn);return 1;},clearInterval(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
  const video={paused:false,currentTime:5,duration:100,addEventListener(){},removeEventListener(){}};
  const doc={body:{},querySelector:selector=>selector==='video'?video:null,querySelectorAll:()=>[],addEventListener(){}};
  const config={enableSponsorBlock:true,sponsorBlockExcludedChannels:exclusions,enableSponsorBlockSponsor:true};
  if(mode) config.sponsorBlockActions={sponsor:mode};
  const prompts=[];
  class XHR {open(){} send(){requests.push(this);} respond(){this.status=200;this.responseText=JSON.stringify([{segment:[5,20],category:'sponsor',actionType:'skip'}]);this.onload();}}
  const context=vm.createContext({window:win,document:doc,XMLHttpRequest:XHR,MutationObserver:class{observe(){}disconnect(){}},
    sponsorBlockAction, segmentKey, automaticSkipTarget,
    showSegmentPrompt:(_doc,_win,_label,confirm,decline)=>{prompts.push({confirm,decline});return ()=>{};},
    configRead:key=>config[key],channelExclusionsKey,channelSkipPolicy,readCurrentVideoId:getCurrentVideoId,
    categories:['sponsor'],categoryConfig:{sponsor:'enableSponsorBlockSponsor'},categoryColors:{},
    getSponsorBlockSkipTarget,showNotification(){},text:(_section,key)=>key,console:{warn(){},info(){}}});
  const source=fs.readFileSync(new URL('../src/sponsorblock.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'').replaceAll('export function ','function ');
  vm.runInContext(source+'\nglobalThis.controllerInstance=new SponsorBlockController();',context);
  const controller=context.controllerInstance;controller.start();
  return {win,doc,video,requests,timers,intervals,controller,config,prompts,
    change(list){config.sponsorBlockExcludedChannels=list;controller.configChangeHandler({detail:{key:channelExclusionsKey}});}};
}
test('excluded channels make no segment request; removing the exception restores skipping',()=>{
  const s=controllerFixture([{id:a}]);assert.equal(s.requests.length,0);
  s.change([]);assert.equal(s.requests.length,1);s.requests[0].respond();
  s.controller.skipCurrentSegment();assert.ok(s.video.currentTime>19);
});
test('adding an exception invalidates queued skips and late segment responses immediately',()=>{
  const s=controllerFixture();s.requests[0].respond();
  const queued=s.timers.get(s.controller.nextSkipTimeout);assert.equal(typeof queued,'function');
  s.change([{id:a}]);queued();s.requests[0].respond();s.controller.skipCurrentSegment();
  assert.equal(s.video.currentTime,5);assert.equal(s.controller.segments.length,0);
});
test('pending channel metadata blocks skipping, then matching metadata enables a non-excluded channel',()=>{
  const s=controllerFixture([{id:b}],false);assert.equal(s.requests.length,0);
  rememberPlayerChannel(s.win,response(v2,b));s.intervals[0]();assert.equal(s.requests.length,0);
  rememberPlayerChannel(s.win,response(v1,a));s.intervals[0]();assert.equal(s.requests.length,1);
});
test('navigation and the global disable setting prevent stale manual or queued skips',()=>{
  const s=controllerFixture();s.requests[0].respond();const queued=s.timers.get(s.controller.nextSkipTimeout);
  s.win.location.href=`?v=${v2}`;queued();s.controller.skipCurrentSegment();assert.equal(s.video.currentTime,5);
  s.win.location.href=`?v=${v1}`;s.config.enableSponsorBlock=false;queued();s.controller.skipCurrentSegment();assert.equal(s.video.currentTime,5);
});

test('unconfirmed navigation cannot use a stale initial response for channel exclusions',()=>{
  const win={location:{href:'https://www.youtube.com/tv'},ytInitialPlayerResponse:response(v1,a)};
  assert.equal(getCurrentVideoId(win),v1); // Preserve legacy fallback without exceptions.
  assert.equal(channelSkipPolicy(win,{},v1,[{id:b}]),'waiting-for-channel');
  const doc={getElementById:()=>({getVideoData:()=>({video_id:v1})})};
  assert.equal(channelSkipPolicy(win,doc,v1,[{id:b}]),'enabled');
});
test('Shorts paths and current hash navigation take precedence over stale outer query IDs',()=>{
  assert.equal(getCurrentVideoId({location:{href:`https://youtube.com/shorts/${v2}`}}),v2);
  assert.equal(getCurrentVideoId({location:{href:`https://youtube.com/tv?v=${v1}`,hash:`#/watch?v=${v2}`}}),v2);
});

test('markers fetch segments without scheduling or manual skipping; off makes no request',()=>{
  const s=controllerFixture([],true,'markers');s.requests[0].respond();s.controller.scheduleSkip();
  assert.equal(s.controller.nextSkipTimeout,null);assert.equal(s.controller.skipCurrentSegment(),false);assert.equal(s.video.currentTime,5);
  assert.equal(controllerFixture([],true,'off').requests.length,0);
});
test('ask requires confirmation, decline is remembered, and stale confirmation cannot seek',()=>{
  const s=controllerFixture([],true,'ask');s.requests[0].respond();s.controller.scheduleSkip();
  assert.equal(s.prompts.length,1);assert.equal(s.video.currentTime,5);
  s.prompts[0].decline();s.controller.scheduleSkip();assert.equal(s.prompts.length,1);
  const t=controllerFixture([],true,'ask');t.requests[0].respond();t.controller.scheduleSkip();
  t.prompts[0].confirm();assert.equal(t.video.currentTime,20);
  const u=controllerFixture([],true,'ask');u.requests[0].respond();u.controller.scheduleSkip();
  u.change([{id:a}]);u.prompts[0].confirm();assert.equal(u.video.currentTime,5);
});

test('ask waits for the GREEN menu to close and expires without seeking',()=>{
  const s=controllerFixture([],true,'ask');const query=s.doc.querySelector;
  const menu={style:{display:'block',visibility:'visible'}};
  s.doc.querySelector=selector=>selector==='.ytaf-ui-container'?menu:query(selector);
  s.requests[0].respond();s.controller.scheduleSkip();assert.equal(s.prompts.length,0);
  menu.style.display='none';s.controller.scheduleSkip();assert.equal(s.prompts.length,1);
  s.video.currentTime=21;s.controller.scheduleSkip();assert.equal(s.controller.pendingPrompt,null);
  s.prompts[0].confirm();assert.equal(s.video.currentTime,21);
});
