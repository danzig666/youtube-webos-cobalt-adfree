import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackSeek,seekTarget,canSeekFromFocus} from '../src/playback-seek.mjs';
import {playbackFixture} from './helpers/playback-fixture.mjs';
function fixture(mode='delayed') {
  const f=playbackFixture(), previews=[];f.settings.channelSeekBehavior=mode;f.video.currentTime=100;
  const handler=createPlaybackSeek(f.doc,f.win,f.read,value=>previews.push(value),f.notify);
  return {...f,handler,previews,tap(code){handler(f.key(code));handler(f.key(code,'keyup'));}};
}
test('disabled channel seeking passes keys through; quick mode seeks after 500 ms in ten-second steps without OK',()=>{
  const native=fixture('youtube');assert.equal(native.handler(native.key(427)),false);assert.equal(native.video.currentTime,100);
  const f=fixture('immediate');f.video.paused=true;f.tap(427);assert.equal(f.video.currentTime,100);f.advance(500);assert.equal(f.video.currentTime,110);
  f.tap(428);f.advance(500);assert.equal(f.video.currentTime,100);assert.equal(f.video.paused,true);assert.equal(f.timers.size,0);
});
test('short delay accumulates rapid taps and commits only the latest target',()=>{
  const f=fixture();const writes=[];let position=100;
  Object.defineProperty(f.video,'currentTime',{get:()=>position,set:value=>writes.push(value)});
  f.tap(427);f.advance(150);f.tap(427);f.advance(150);f.tap(428);f.advance(799);
  assert.deepEqual(writes,[]);f.advance(1);assert.deepEqual(writes,[110]);
  f.tap(427);f.advance(800);assert.deepEqual(writes,[110,120]);
  position=120;f.media('seeked');assert.equal(f.previews.at(-1),120);
});
test('held repeat is bounded and trailing release cannot reach YouTube',()=>{
  const f=fixture('immediate'),first=f.key(427);assert.equal(f.handler(first),true);
  f.handler(f.key(427));assert.equal(f.video.currentTime,100);f.advance(401);f.handler(f.key(427));f.advance(600);assert.equal(f.video.currentTime,100);
  for(const type of ['keypress','keyup']) {const event=f.key(427,type);assert.equal(f.handler(event),true);assert.equal(event.consumed,true);}
  f.advance(499);assert.equal(f.video.currentTime,100);f.advance(1);assert.equal(f.video.currentTime,120);
  f.tap(427);f.advance(500);assert.equal(f.video.currentTime,130);
});
test('OK commits pending target while BACK cancels and both releases are consumed',()=>{
  for(const code of [13,461,27,8]) {
    const f=fixture();f.tap(427);assert.equal(f.handler(f.key(code)),true);
    f.advance(1100);assert.equal(f.video.currentTime,code===13?110:100);
    assert.equal(f.handler(f.key(code,'keyup')),true);
  }
});
test('navigation, menu, metadata, blur, preference and other navigation keys cancel queued seeks',()=>{
  for(const variant of ['hash','menu','metadata','blur','config','otherkey','identity','element','focus']) {
    const f=fixture();f.tap(427);
    if(variant==='hash')f.win.emit('hashchange');
    if(variant==='menu')f.doc.emit('ytaf-menu-opened');
    if(variant==='metadata')f.media('loadedmetadata');
    if(variant==='blur')f.win.emit('blur');
    if(variant==='config')f.doc.emit('ytaf-config-changed',{detail:{key:'channelSeekBehavior'}});
    if(variant==='otherkey')f.tap(40);
    if(variant==='identity')f.win.location.href='?v=bbbbbbbbbbb';
    if(variant==='element')f.doc.video={...f.video};
    if(variant==='focus')f.doc.activeElement={tagName:'BUTTON'};
    f.advance(1100);assert.equal(f.video.currentTime,100,variant);assert.equal(f.previews.at(-1),null,variant);
  }
});
test('settings, Shorts and interactive YouTube controls keep their arrow keys',()=>{
  const f=fixture('immediate');assert.equal(f.handler(f.key(427),false),false);
  for(const [tag,role] of [['INPUT',null],['BUTTON',null],['DIV','dialog'],['DIV','menu'],['DIV','combobox']]) {
    f.doc.activeElement={tagName:tag,getAttribute:key=>key==='role'?role:null};
    assert.equal(canSeekFromFocus(f.doc,f.video),false);assert.equal(f.handler(f.key(427)),false);
  }
  f.doc.activeElement={tagName:'DIV',id:'video-progress',getAttribute:key=>key==='role'?'slider':null};
  assert.equal(canSeekFromFocus(f.doc,f.video),true);
  f.doc.body.classList.contains=()=>false;assert.equal(f.handler(f.key(427)),false);
});
test('seek boundaries include live DVR and gaps; invalid timelines and native errors are safe',()=>{
  const video={readyState:4,duration:Infinity,seekable:{length:2,start:i=>[30,80][i],end:i=>[60,120][i]}};
  assert.equal(seekTarget(video,0),30);assert.equal(seekTarget(video,1000),119.9);
  assert.equal(seekTarget(video,75),80);assert.equal(seekTarget({...video,readyState:0},50),null);
  assert.equal(seekTarget({...video,seekable:{length:0}},50),null);
  const f=fixture('immediate');Object.defineProperty(f.video,'currentTime',{get:()=>100,set:()=>{throw Error('native');}});
  assert.doesNotThrow(()=>{f.tap(427);f.advance(500);});assert.equal(f.notifications.length,1);
});

test('quick mode coalesces repeated taps into one native seek 500 ms after the last press',()=>{
  const f=fixture('immediate'),writes=[];
  Object.defineProperty(f.video,'currentTime',{get:()=>100,set:value=>writes.push(value)});
  f.tap(427);f.advance(300);f.tap(427);f.advance(300);f.tap(428);f.advance(499);
  assert.deepEqual(writes,[]);f.advance(1);assert.deepEqual(writes,[110]);
});

test('lost key release recovers, and the one-second option waits after the final release',()=>{
  const held=fixture('immediate');held.handler(held.key(427));held.advance(1999);
  assert.equal(held.video.currentTime,100);held.advance(1);assert.equal(held.video.currentTime,110);
  held.tap(428);held.advance(500);assert.equal(held.video.currentTime,100);
  assert.equal(held.handler(held.key(427,'keyup')),true);
  const f=fixture('relaxed');f.tap(427);f.advance(700);f.tap(427);f.advance(999);
  assert.equal(f.video.currentTime,100);f.advance(1);assert.equal(f.video.currentTime,120);
});

test('hidden YouTube watch host keeps automatic delay while its buttons keep navigation',()=>{
  const f=fixture('immediate');
  const host={tagName:'YTLR-WATCH-DEFAULT',parentElement:f.doc.body,getAttribute:()=>null};
  f.doc.activeElement=host;f.tap(427);f.advance(499);assert.equal(f.video.currentTime,100);
  f.advance(1);assert.equal(f.video.currentTime,110);
  f.doc.activeElement={tagName:'BUTTON',parentElement:host,getAttribute:()=>null};
  assert.equal(f.handler(f.key(427)),false);
});

test('revealed native button focus retains automatic seeking after seeked without stale targets',()=>{
  const f=playbackFixture();f.settings.channelSeekBehavior='immediate';f.video.currentTime=100;
  const button={tagName:'BUTTON',getAttribute:()=>null}, controls={contains:node=>node===button};
  let reveals=0;
  const handler=createPlaybackSeek(f.doc,f.win,f.read,()=>{},f.notify,()=>{
    if(reveals++)return null;f.doc.activeElement=button;return controls;
  });
  const tap=()=>{assert.equal(handler(f.key(427)),true);handler(f.key(427,'keyup'));};
  tap();f.advance(500);assert.equal(f.video.currentTime,110);f.media('seeked');
  f.advance(2000);f.video.currentTime=140;tap();f.advance(499);assert.equal(f.video.currentTime,140);
  f.advance(1);assert.equal(f.video.currentTime,150);
  f.doc.emit('mousedown');assert.equal(handler(f.key(427)),false);
});

test('the target is previewed on keydown before revealing controls and before the delayed native write',()=>{
  const f=playbackFixture();f.settings.channelSeekBehavior='immediate';f.video.currentTime=100;
  const events=[];
  const handler=createPlaybackSeek(f.doc,f.win,f.read,target=>events.push(['preview',target]),f.notify,()=>{
    assert.deepEqual(events,[['preview',110]]);assert.equal(f.video.currentTime,100);return null;
  });
  handler(f.key(427));assert.deepEqual(events,[['preview',110]]);
  f.advance(600);assert.equal(f.video.currentTime,100);
  handler(f.key(427,'keyup'));f.advance(499);assert.equal(f.video.currentTime,100);
  f.advance(1);assert.equal(f.video.currentTime,110);
});

test('watch-page recommendation cards and their progress bars retain Left/Right navigation',()=>{
 const f=fixture('immediate');
 const host={tagName:'YTLR-WATCH-DEFAULT',parentElement:f.doc.body};
 for(const kind of ['tile','grid','bare-child','card-progress']) {
  const list={tagName:'DIV',parentElement:host,getAttribute:key=>key==='role'?'grid':null};
  const card={tagName:kind==='tile'?'YTLR-TILE-RENDERER':'DIV',parentElement:kind==='bare-child'?host:list};
  f.doc.activeElement=kind==='card-progress'?{tagName:'YTLR-PROGRESS-BAR',parentElement:card}:card;
  for(const code of [37,39,427,428]) {
   const event=f.key(code);assert.equal(f.handler(event),false,kind);
   assert.equal(Boolean(event.consumed),false,kind);
  }
  f.advance(3000);assert.equal(f.video.currentTime,100,kind);
 }
});
test('Down cancels the preview and pending seek before browsing the list below the timeline',()=>{
 const f=fixture('immediate'),host={tagName:'YTLR-WATCH-DEFAULT',parentElement:null};host.parentElement=f.doc.body;
 f.doc.activeElement=host;f.tap(427);assert.equal(f.previews.at(-1),110);
 f.advance(200);assert.equal(f.handler(f.key(40)),false);assert.equal(f.previews.at(-1),null);
 f.doc.activeElement={tagName:'YTLR-COMPACT-VIDEO-RENDERER',parentElement:host};
 const left=f.key(428);assert.equal(f.handler(left),false);assert.equal(Boolean(left.consumed),false);
 f.advance(3000);assert.equal(f.video.currentTime,100);
});
test('retained controls cannot authorize a recommendation link or card after focus leaves transport buttons',()=>{
 for(const kind of ['card','link']) {
  const f=playbackFixture();f.settings.channelSeekBehavior='immediate';f.video.currentTime=100;
  const button={tagName:'BUTTON'},card={tagName:kind==='card'?'YTLR-TILE-RENDERER':'A'};
  const controls={contains:node=>[button,card].includes(node)};
  const handler=createPlaybackSeek(f.doc,f.win,f.read,()=>{},f.notify,()=>{f.doc.activeElement=button;return controls;});
  handler(f.key(427));handler(f.key(427,'keyup'));f.doc.activeElement=card;
  f.advance(500);assert.equal(f.video.currentTime,100,kind);
  assert.equal(handler(f.key(427)),false,kind);
 }
});

test('all native Left/Right events pass through even while a channel seek is pending',()=>{
 for(const arrow of [37,39]) {
  const f=fixture('immediate');f.tap(427);assert.equal(f.previews.at(-1),110);
  for(const type of ['keydown','keypress','keyup']) {
   const event=f.key(arrow,type);assert.equal(f.handler(event),false);assert.equal(Boolean(event.consumed),false);
  }
  f.advance(2000);assert.equal(f.video.currentTime,100);assert.equal(f.previews.at(-1),null);
 }
});
test('channel key names work when legacy numeric codes are absent; Page Up/Down stay native',()=>{
 const f=fixture('immediate');
 for(const [key,target] of [['ChannelUp',110],['ChannelDown',100]]) {
  for(const type of ['keydown','keyup'])assert.equal(f.handler({...f.key(0,type),key}),true);
  f.advance(500);assert.equal(f.video.currentTime,target);
 }
 for(const code of [33,34])assert.equal(f.handler(f.key(code)),false);
 for(const code of [427,428])assert.equal(fixture('youtube').handler(f.key(code)),false);
});

function nativeControlsFixture() {
 const f=fixture('immediate');
 const node=(tag,parent=null,role=null)=>({tagName:tag,parentElement:parent,
  getAttribute:key=>key==='role'?role:null});
 const controls=node('YT-FOCUS-CONTAINER',f.doc.body);
 controls.contains=target=>{for(let n=target;n;n=n.parentElement)if(n===controls)return true;return false;};
 f.doc.controls=controls;
 f.doc.querySelector=selector=>selector==='video'?f.doc.video:
  selector==='yt-focus-container[idomkey="controls"]'?f.doc.controls:f.doc.player;
 return {...f,controls,node};
}
test('channel seeking starts on already-open native transport controls without first revealing them',()=>{
 for(const kind of ['button','button-child','controls-root','timeline-wrapper']) {
  const f=nativeControlsFixture(),button=f.node('BUTTON',f.controls);
  let focus=kind==='button-child'?f.node('SPAN',button):kind==='controls-root'?f.controls:button;
  if(kind==='timeline-wrapper') {
   const timeline=f.node('DIV',f.controls);timeline.getAttribute=key=>key==='idomkey'?'progress-bar':null;
   focus=f.node('DIV',timeline);
  }
  f.doc.activeElement=focus;
  assert.equal(f.handler(f.key(427)),true,kind);f.handler(f.key(427,'keyup'));
  assert.equal(f.previews.at(-1),110,kind);f.advance(499);assert.equal(f.video.currentTime,100,kind);
  f.advance(1);assert.equal(f.video.currentTime,110,kind);
  f.tap(428);f.advance(500);assert.equal(f.video.currentTime,100,kind);
 }
});
test('native arrow navigation does not permanently disable channel seeking on visible controls',()=>{
 const f=nativeControlsFixture();f.doc.activeElement=f.node('BUTTON',f.controls);
 for(const code of [37,39,38]) {
  assert.equal(f.handler(f.key(code)),false);f.handler(f.key(code,'keyup'));
  f.tap(427);f.advance(500);
 }
 assert.equal(f.video.currentTime,130);
});
test('newly rendered transport controls remain eligible before and during a delayed channel seek',()=>{
 const f=nativeControlsFixture();f.doc.activeElement=f.node('BUTTON',f.controls);
 f.tap(427);
 const fresh=f.node('YT-FOCUS-CONTAINER',f.doc.body);
 fresh.contains=target=>target.parentElement===fresh;
 f.doc.controls=fresh;f.doc.activeElement=f.node('BUTTON',fresh);
 f.advance(500);assert.equal(f.video.currentTime,110);
 f.tap(428);f.advance(500);assert.equal(f.video.currentTime,100);
});
test('known controls never authorize recommendation, menu, editable or unrelated slider descendants',()=>{
 for(const kind of ['card','grid','link','dialog','menu','input','volume']) {
  const f=nativeControlsFixture();f.doc.activeElement=f.node('BUTTON',f.controls);f.tap(427);
  let focus;
  if(kind==='card')focus=f.node('BUTTON',f.node('YTLR-TILE-RENDERER',f.controls));
  if(kind==='grid')focus=f.node('BUTTON',f.node('DIV',f.controls,'grid'));
  if(kind==='link')focus=f.node('A',f.controls);
  if(['dialog','menu'].includes(kind))focus=f.node('BUTTON',f.node('DIV',f.controls,kind));
  if(kind==='input')focus=f.node('INPUT',f.controls);
  if(kind==='volume'){focus=f.node('DIV',f.controls,'slider');focus.id='volume';}
  f.doc.activeElement=focus;f.advance(500);assert.equal(f.video.currentTime,100,kind);
  for(const code of [427,428,37,39])assert.equal(f.handler(f.key(code)),false,kind);
 }
});
