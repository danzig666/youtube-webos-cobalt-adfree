import assert from 'node:assert/strict';
import {test} from 'node:test';
import {startThumbnailProgress} from '../src/thumbnail-progress.mjs';
import {startPlaybackResume} from '../src/playback-resume.mjs';

function fixture({native = true, observer = true} = {}) {
  let clock = 10000, sequence = 0, scans = 0, disconnected = 0;
  const timers = new Map(), classes = new Set(), observations = [];
  const observers = [];
  function emitter(value = {}) {
    const listeners = new Map();
    value.addEventListener = (type, fn) => { if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn); };
    value.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
    value.emit = (type, event = {}) => { for(const fn of listeners.get(type)||[])fn({type,...event}); };
    return value;
  }
  function element(tagName = 'div', bounds = {left:100,top:100,width:320,height:180}) {
    const attrs = {};
    return {tagName:tagName.toUpperCase(),bounds,children:[],style:{},parentNode:null,parentElement:null,
      getBoundingClientRect(){return {...this.bounds};},getAttribute:key=>attrs[key]||null,setAttribute:(key,value)=>attrs[key]=value,
      appendChild(child){child.parentNode?.removeChild(child);this.children.push(child);child.parentNode=child.parentElement=this;},
      removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=child.parentElement=null;},
      contains(node){return this===node||this.children.some(child=>child.contains(node));},
      closest(){for(let node=this;node;node=node.parentElement)if(node.tagName==='YTLR-TILE-RENDERER')return node;return null;},
      focus(){assert.fail('must not change focus');},dispatchEvent(){assert.fail('must not dispatch refresh/account commands');}};
  }
  const root=element('html'),body=element('body');root.appendChild(body);body.classList={contains:name=>classes.has(name)};
  const video={readyState:4,currentTime:0,duration:300,seeking:false,ended:false,seekable:{length:0}};
  const doc=emitter({body,documentElement:root,activeElement:body,hidden:false,visibilityState:'visible',video,player:null,nodes:[],
    createElement:element,getElementById:()=>doc.player,
    querySelector:selector=>selector==='video'?doc.video:doc.player,
    querySelectorAll(){scans++;return Object.assign({length:doc.nodes.length},doc.nodes);}});
  const win=emitter({location:{href:'https://www.youtube.com/tv#/',reload(){assert.fail('must not reload');},replace(){assert.fail('must not navigate');}},
    innerWidth:1280,innerHeight:720,Date:{now:()=>clock},
    getComputedStyle:node=>({display:'block',visibility:'visible',opacity:'1',position:'static',...node.style}),
    setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:clock+delay});return id;},clearTimeout:id=>timers.delete(id),
    __ytafPlaybackMetadata:[]});
  let nativeState={position:0,frames:1,session:1,generation:1,active:true,valid:true};
  if(native)win.h5vcc={system:{getYtafMediaReport:()=>nativeState.valid
    ?`Current player: Shared Starfish${nativeState.active?'':' (inactive)'}\nSession: ${nativeState.session} generation: ${nativeState.generation}\nPlayback rate: requested 1x applied 1x\nNative presentation: ${nativeState.position} seconds\nPresented frames: ${nativeState.frames}\n`:'unavailable'}};
  if(observer)win.MutationObserver=class {
    constructor(fn){this.callback=fn;observers.push(this);} observe(target,options){observations.push({target,options,owner:this});}
    disconnect(){disconnected++;for(let i=observations.length-1;i>=0;i--)if(observations[i].owner===this)observations.splice(i,1);}
  };
  function mutate(type='attributes',target=doc.body,attributeName='class') {
    for(const observer of observers){
      const applies=observations.some(({target:watched,options,owner})=>owner===observer&&
        (watched===target||(options.subtree&&watched.contains(target)))&&
        (type==='attributes'?options.attributes&&options.attributeFilter.includes(attributeName):options[type]));
      if(applies)observer.callback([{type,target,attributeName}]);
    }
  }
  const api=startThumbnailProgress(doc,win);
  function advance(ms){const end=clock+ms;let count=0;for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(++count<100,'bounded retries');clock=next[1].at;timers.delete(next[0]);next[1].fn();}clock=end;}
  function route(hash){win.location.href=`https://www.youtube.com/tv${hash}`;win.emit('hashchange');}
  function page(...names){classes.clear();for(const name of names)classes.add(name);mutate();}
  function metadata(id,extra={}) {win.__ytafPlaybackMetadata.unshift({id,live:false,duration:300,...extra});}
  function play(id='aaaaaaaaaaa',position=90,beforeMetadata=()=>{}){
    route(`#/watch?v=${id}`);page('WEB_PAGE_TYPE_WATCH');metadata(id);
    doc.player={getVideoData:()=>({video_id:id})};
    video.currentTime=position;video.seeking=false;video.ended=false;
    beforeMetadata();doc.emit('loadedmetadata',{target:video});
    nativeState={...nativeState,position,frames:1,session:nativeState.session+1,active:true,valid:true};
    doc.emit('playing',{target:video});
  }
  function browse(hash='#/'){route(hash);page('WEB_PAGE_TYPE_BROWSE');}
  function thumbnail(id='aaaaaaaaaaa') {
    const card=element('ytlr-tile-renderer'),host=element('ytlr-thumbnail-details');
    card.__instance={props:{data:{navigationEndpoint:{watchEndpoint:{videoId:id}}}}};
    host.style.backgroundImage=`url("https://i.ytimg.com/vi/${id}/hqdefault.jpg")`;
    card.appendChild(host);doc.body.appendChild(card);doc.nodes.push(host);return {card,host};
  }
  const width=host=>host.children.find(node=>node.className==='ytaf-thumbnail-progress')?.children[0].style.width;
  return {doc,win,video,api,timers,observations,element,mutate,advance,route,page,metadata,play,browse,thumbnail,width,
    media:type=>doc.emit(type,{target:video}),native:state=>Object.assign(nativeState,state),get scans(){return scans;},get disconnected(){return disconnected;}};
}

test('confirmed Watch progress updates only the matching existing thumbnail and preserves the feed',()=>{
  const f=fixture(),a=f.thumbnail(),b=f.thumbnail('bbbbbbbbbbb'),order=f.doc.body.children.slice();
  f.doc.activeElement=b.card;b.card.scrollTop=140;f.play();f.browse();
  assert.equal(f.width(a.host),'30%');assert.equal(f.width(b.host),undefined);
  assert.deepEqual(f.doc.body.children,order);assert.equal(f.doc.activeElement,b.card);assert.equal(b.card.scrollTop,140);
  assert.match(f.api.status,/updated on 1 card/);f.advance(10000);assert.equal(f.timers.size,0);
});
test('initial browsing and preview playback do not create progress overlays or timers',()=>{
  const f=fixture(),{host}=f.thumbnail();f.video.currentTime=90;f.media('playing');f.media('timeupdate');f.browse();f.advance(10000);
  assert.equal(f.width(host),undefined);assert.equal(f.scans,0);assert.equal(f.timers.size,0);
});
test('ads, live/DVR, Shorts, unknown metadata and a wrong player never become a progress snapshot',()=>{
  for(const variant of ['ads','live','dvr','shorts','unknown','wrongplayer']) {
    const f=fixture(),{host}=f.thumbnail();f.route('#/watch?v=aaaaaaaaaaa');f.page('WEB_PAGE_TYPE_WATCH');
    f.metadata('aaaaaaaaaaa');f.video.currentTime=90;f.native({position:90});
    if(variant==='ads')f.doc.player={getAdState:()=>1};
    if(variant==='live')f.win.__ytafPlaybackMetadata[0].live=true;
    if(variant==='dvr')f.video.seekable={length:1,start:()=>30};
    if(variant==='shorts')f.page('WEB_PAGE_TYPE_SHORTS');
    if(variant==='unknown')f.win.__ytafPlaybackMetadata[0].live=null;
    if(variant==='wrongplayer')f.doc.player={getVideoData:()=>({video_id:'bbbbbbbbbbb'})};
    f.media('playing');f.browse();f.advance(3000);assert.equal(f.width(host),undefined,variant);
  }
});
test('requested seeks never change thumbnail progress until a matching native frame is presented',()=>{
  const f=fixture(),{host}=f.thumbnail();f.play();
  f.video.currentTime=210;f.video.seeking=true;f.media('seeking');f.media('timeupdate');
  f.video.seeking=false;f.media('seeked');f.browse();assert.equal(f.width(host),'30%');
  f.play('aaaaaaaaaaa',30);f.browse();assert.equal(f.width(host),'10%','confirmed backward seek lowers progress');
});
test('inactive or unparseable native reports cannot save an echoed DOM target',()=>{
  for(const variant of [{active:false},{valid:false},{frames:0}]) {
    const f=fixture(),{host}=f.thumbnail();f.route('#/watch?v=aaaaaaaaaaa');f.page('WEB_PAGE_TYPE_WATCH');f.metadata('aaaaaaaaaaa');
    f.video.currentTime=120;f.native({position:120,...variant});f.media('playing');f.browse();f.advance(3000);
    assert.equal(f.width(host),undefined);
  }
});
test('native EOS displays completion only when the final position was already confirmed',()=>{
  const f=fixture(),{host}=f.thumbnail();f.play('aaaaaaaaaaa',299.5);f.video.currentTime=300;f.video.ended=true;
  f.native({active:false});f.media('ended');f.browse();assert.equal(f.width(host),'100%');
  const g=fixture(),other=g.thumbnail();g.play('aaaaaaaaaaa',299.5);g.video.seeking=true;g.media('seeking');
  g.video.seeking=false;g.video.currentTime=300;g.video.ended=true;g.native({active:false});g.media('ended');g.browse();
  assert.notEqual(g.width(other.host),'100%','an unconfirmed manual seek cannot promote an old sample to completion');
});
test('new-video source guard survives temporarily unavailable native reports',()=>{
  const f=fixture(),a=f.thumbnail(),b=f.thumbnail('bbbbbbbbbbb');f.play('aaaaaaaaaaa',65);
  f.route('#/watch?v=bbbbbbbbbbb');f.metadata('bbbbbbbbbbb');f.doc.player={getVideoData:()=>({video_id:'bbbbbbbbbbb'})};
  f.media('loadedmetadata');f.native({active:false});f.media('playing');
  f.native({active:true});f.media('timeupdate');f.browse();assert.equal(f.width(b.host),undefined);
  assert.ok(f.width(a.host));
  f.play('bbbbbbbbbbb',35);f.browse();assert.ok(f.width(b.host));
});
test('browser-only fallback requires advancing completed playback rather than a single target',()=>{
  const f=fixture({native:false}),{host}=f.thumbnail();f.play();f.browse();assert.equal(f.width(host),undefined);
  f.play();f.advance(1000);f.video.currentTime=91;f.media('timeupdate');f.browse();assert.equal(f.width(host),`${91/300*100}%`);
});
test('return scans are bounded while mutation-driven reconciliation handles later recycled cards',()=>{
  const f=fixture(),{card,host}=f.thumbnail();f.play();f.browse();f.advance(3000);
  assert.equal(f.scans,5);assert.equal(f.timers.size,0);
  card.__instance.props.data.navigationEndpoint.watchEndpoint.videoId='bbbbbbbbbbb';
  f.mutate('characterData',host);f.advance(100);assert.equal(f.width(host),undefined);
  host.style.backgroundImage='url("https://i.ytimg.com/vi/bbbbbbbbbbb/hqdefault.jpg")';
  f.mutate('attributes',host,'style');f.advance(100);assert.equal(f.width(host),undefined);
  assert.equal(f.timers.size,0);
});
test('Watch observation excludes player subtrees, and body replacement reattaches browse reconciliation',()=>{
  const f=fixture(),{host}=f.thumbnail();f.play();
  const bodyWatch=f.observations.find(entry=>entry.target===f.doc.body);
  assert.deepEqual(bodyWatch.options,{attributes:true,attributeFilter:['class']});
  f.browse();f.advance(3000);const oldBody=f.doc.body,newBody=f.element('body');
  newBody.classList={contains:()=>false};f.doc.documentElement.removeChild(oldBody);f.doc.documentElement.appendChild(newBody);f.doc.body=newBody;
  const fresh=f.thumbnail();f.mutate('childList',f.doc.documentElement);
  assert.equal(f.width(host),undefined);assert.equal(f.width(fresh.host),'30%');
  assert.ok(f.observations.some(entry=>entry.target===newBody&&entry.options.subtree));
});
test('background cancels scans and observation until focus, visibility or pageshow resumes',()=>{
  for(const event of ['blur','pagehide']) {
    const f=fixture(),{host}=f.thumbnail();f.play();f.browse();f.win.emit(event);
    assert.equal(f.width(host),undefined);assert.equal(f.timers.size,0);assert.equal(f.observations.length,0);
    f.mutate();f.advance(3000);assert.equal(f.width(host),undefined);
    f.win.emit(event==='blur'?'focus':'pageshow');assert.equal(f.width(host),'30%');
  }
});
test('destroy removes overlays and event subscriptions and discards ephemeral data',()=>{
  const f=fixture(),{host}=f.thumbnail();f.play();f.browse();f.api.destroy();
  assert.equal(f.width(host),undefined);assert.equal(f.observations.length,0);assert.equal(f.timers.size,0);
  f.play();f.browse();f.advance(3000);assert.equal(f.width(host),undefined);assert.match(f.api.status,/stopped/);
});


test('Back and reopen resume the actual position behind the red bar without writing TV bookmarks or refreshing the feed',()=>{
  const f=fixture(),{card,host}=f.thumbnail();f.win.__ytafThumbnailProgress=f.api;
  const notifications=[],writes=[];
  const resume=startPlaybackResume(f.doc,f.win,key=>key==='playbackResumeMode'?'youtube':[],value=>writes.push(value),text=>notifications.push(text));
  const nodes=f.doc.body.children.slice();f.doc.activeElement=card;card.scrollTop=80;
  f.play();f.browse();assert.equal(f.width(host),'30%');
  // Resume is requested during metadata, before the first playing event.
  f.play('aaaaaaaaaaa',0);assert.equal(f.video.currentTime,90);
  assert.equal(f.api.getResumePosition('aaaaaaaaaaa').position,90);
  f.advance(500);assert.equal(f.video.currentTime,90);
  assert.equal(notifications.length,0,'an accepted target is not confirmed playback');
  f.native({position:90.2,frames:2,generation:2});f.video.currentTime=90.2;f.media('timeupdate');
  assert.match(resume.status,/Last watched.*reached/);assert.equal(notifications.length,1);
  f.video.currentTime=100;f.native({position:100,frames:8});f.media('timeupdate');
  f.browse();f.play('aaaaaaaaaaa',0);f.advance(1500);assert.equal(f.video.currentTime,100,'a quick third visit uses updated progress, not the previous frozen launch');
  f.native({position:100.2,frames:9,generation:3});f.video.currentTime=100.2;f.media('timeupdate');
  f.browse();assert.equal(writes.length,0,'YouTube mode never writes durable TV bookmarks');
  assert.deepEqual(f.doc.body.children,nodes);assert.equal(f.doc.activeElement,card);assert.equal(card.scrollTop,80);
  assert.equal(f.api.getResumePosition('bbbbbbbbbbb'),null);
});
test('constant-URL body navigation resets manual seeking and restores a reopened video',()=>{
  const f=fixture();f.win.__ytafThumbnailProgress=f.api;
  const resume=startPlaybackResume(f.doc,f.win,key=>key==='playbackResumeMode'?'youtube':[],()=>assert.fail('no TV bookmark writes'),()=>{});
  f.play();resume.manual();f.page('WEB_PAGE_TYPE_BROWSE');
  // Some TV SPA transitions retain the watch URL; only the body class changes.
  f.win.emit('keydown',{keyCode:39});
  f.page('WEB_PAGE_TYPE_WATCH');f.video.currentTime=0;f.media('loadedmetadata');
  f.native({position:0,session:3});f.media('playing');
  assert.equal(f.video.currentTime,90);assert.match(resume.status,/waiting for playback confirmation/);
  f.native({position:90.2,frames:2,generation:2});f.media('timeupdate');assert.match(resume.status,/Last watched.*reached/);
});
test('a YouTube account target supersedes current-session progress while the early cached seek awaits confirmation',()=>{
  const f=fixture();f.win.__ytafThumbnailProgress=f.api;
  const notifications=[];
  const resume=startPlaybackResume(f.doc,f.win,key=>key==='playbackResumeMode'?'youtube':[],()=>assert.fail('no TV bookmark writes'),text=>notifications.push(text));
  f.play();f.browse();f.play('aaaaaaaaaaa',0);f.advance(1000);
  f.video.currentTime=120;f.native({position:120,frames:3});f.media('timeupdate');f.advance(1000);
  assert.equal(f.video.currentTime,120);assert.equal(notifications.length,0);assert.match(resume.status,/YouTube/);
});
test('completed or unconfirmed playback cannot produce a current-session resume target',()=>{
  const f=fixture();f.play('aaaaaaaaaaa',299.5);f.video.currentTime=300;f.video.ended=true;
  f.native({active:false});f.media('ended');f.browse();assert.equal(f.api.getResumePosition('aaaaaaaaaaa'),null);
  const g=fixture();g.play('aaaaaaaaaaa',0);g.video.currentTime=90;g.media('timeupdate');g.browse();
  assert.equal(g.api.getResumePosition('aaaaaaaaaaa'),null);
  g.api.destroy();assert.equal(g.api.getResumePosition('aaaaaaaaaaa'),null);
});
test('explicit zero timestamp and incompatible durations suppress current-session resume',()=>{
  for(const variant of ['timestamp','duration']){
    const f=fixture();f.win.__ytafThumbnailProgress=f.api;
    const resume=startPlaybackResume(f.doc,f.win,key=>key==='playbackResumeMode'?'youtube':[],()=>assert.fail('no TV bookmark writes'),()=>{});
    f.play();f.browse();
    if(variant==='duration'){f.video.duration=350;f.metadata('aaaaaaaaaaa',{duration:350});}
    f.play('aaaaaaaaaaa',0,()=>{
      if(variant==='duration')f.win.__ytafPlaybackMetadata[0].duration=350;
      if(variant==='timestamp')f.win.location.href+='&t=0';
    });
    f.advance(2000);assert.equal(f.video.currentTime,0,variant);
  }
});
