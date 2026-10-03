import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startPlaybackResume,normalizePlaybackPositions,hasExplicitStart} from '../src/playback-resume.mjs';
import {rememberPlaybackMetadata,playbackMetadata} from '../src/playback-metadata.mjs';
import {playbackFixture} from './helpers/playback-fixture.mjs';
const start = f => startPlaybackResume(f.doc,f.win,f.read,f.save,f.notify);
test('VOD progress saves on pause and restores once after starting playback',()=>{
  const f=playbackFixture();start(f);f.video.currentTime=85;f.media('pause');
  assert.equal(f.writes.at(-1)[0].position,85);
  const g=playbackFixture();g.settings.playbackPositions=f.writes.at(-1);start(g);
  g.media('loadedmetadata');assert.equal(g.video.currentTime,0);
  g.media('playing');assert.equal(g.video.currentTime,85);
  g.video.currentTime=0;g.media('playing');assert.equal(g.video.currentTime,0);
});
test('native/cloud resume, explicit timestamps, manual seeking and incompatible durations win over local bookmarks',()=>{
  for(const variant of ['cloud','timestamp','manual','duration']) {
    const f=playbackFixture();f.settings.playbackPositions=[f.bookmark()];
    if(variant==='cloud') f.video.currentTime=35;
    if(variant==='timestamp') f.win.location.href+='&t=0';
    if(variant==='duration') f.settings.playbackPositions[0].duration=350;
    const api=start(f);if(variant==='manual')api.manual();f.media('playing');
    assert.equal(f.video.currentTime,variant==='cloud'?35:0,variant);
  }
  assert.equal(hasExplicitStart({hash:'#/watch?v=aaaaaaaaaaa&start=20'}),true);
});
test('live DVR, Shorts, unknown metadata, mismatched player, ads and disabled preference do not save or restore',()=>{
  for(const variant of ['live','dvr','shorts','unknown','wrongplayer','ad','disabled','metadata-duration']) {
    const f=playbackFixture();f.settings.playbackPositions=[f.bookmark()];
    if(variant==='live')f.win.__ytafPlaybackMetadata[0].live=true;
    if(variant==='dvr')f.video.seekable={length:1,start:()=>30};
    if(variant==='shorts')f.doc.body.classList.contains=()=>false;
    if(variant==='unknown')f.win.__ytafPlaybackMetadata[0].live=null;
    if(variant==='wrongplayer')f.doc.player={getVideoData:()=>({video_id:'bbbbbbbbbbb'})};
    if(variant==='ad')f.doc.player={getAdState:()=>1};
    if(variant==='disabled')f.settings.rememberPlaybackPosition=false;
    if(variant==='metadata-duration')f.win.__ytafPlaybackMetadata[0].duration=200;
    start(f);f.media('playing');assert.equal(f.video.currentTime,0,variant);
    f.video.currentTime=50;f.media('pause');assert.equal(f.writes.length,0,variant);
  }
});
test('position sampling is throttled, exit flushes, and completion removes the bookmark',()=>{
  const f=playbackFixture();start(f);f.video.currentTime=20;f.media('timeupdate');
  assert.equal(f.writes.length,1);f.video.currentTime=24;f.media('timeupdate');assert.equal(f.writes.length,1);
  f.advance(10000);f.media('timeupdate');assert.equal(f.writes.length,2);
  f.video.currentTime=28;f.media('timeupdate');f.win.emit('pagehide');assert.equal(f.writes.at(-1)[0].position,28);
  f.video.currentTime=300;f.video.ended=true;f.media('ended');assert.deepEqual(f.writes.at(-1),[]);
});
test('navigation flushes the old captured sample and waits for new metadata',()=>{
  const f=playbackFixture();start(f);f.video.currentTime=60;f.media('timeupdate');
  f.video.currentTime=65;f.media('timeupdate');
  f.win.location.href='https://www.youtube.com/tv?v=bbbbbbbbbbb';f.win.emit('hashchange');
  assert.equal(f.writes.at(-1)[0].id,'aaaaaaaaaaa');assert.equal(f.writes.at(-1)[0].position,65);
  f.win.__ytafPlaybackMetadata.unshift({id:'bbbbbbbbbbb',live:false,duration:300});
  f.media('timeupdate');assert.equal(f.writes.length,2);
  f.video.currentTime=0;f.media('loadedmetadata');f.media('playing');
  f.video.currentTime=40;f.media('pause');assert.equal(f.writes.at(-1)[0].id,'bbbbbbbbbbb');
  f.doc.emit('pause',{target:{currentTime:200}});assert.equal(f.writes.at(-1)[0].position,40);
});
test('failed saves are throttled with one warning and clear discards saved positions',()=>{
  const f=playbackFixture();let attempts=0;
  const api=startPlaybackResume(f.doc,f.win,f.read,()=>{attempts++;return false;},f.notify);
  f.video.currentTime=60;f.media('timeupdate');f.video.currentTime=61;f.media('timeupdate');
  assert.equal(attempts,1);f.media('pause');assert.equal(attempts,2);assert.equal(f.notifications.length,1);
  const g=playbackFixture();g.settings.playbackPositions=[g.bookmark()];start(g).clear();
  g.media('playing');assert.equal(g.video.currentTime,0);assert.deepEqual(g.writes.at(-1),[]);
  assert.equal(typeof api.flush,'function');
});
test('bookmark normalization is bounded, expires old entries and discards unrelated fields',()=>{
  const f=playbackFixture();const entry=f.bookmark();
  const valid=normalizePlaybackPositions([{...entry,url:'secret',account:'secret'},entry,
    {...entry,id:'bbbbbbbbbbb',position:299},{...entry,id:'ccccccccccc',updated:0}],f.win.Date.now());
  assert.deepEqual(valid,[entry]);
  const many=Array.from({length:150},(_,i)=>({...entry,id:String(i).padStart(11,'0')}));
  assert.equal(normalizePlaybackPositions(many,f.win.Date.now()).length,100);
});
test('metadata cache matches identity and retains confirmed live status over stale initial responses',()=>{
  const f=playbackFixture();rememberPlaybackMetadata(f.win,{videoDetails:{videoId:'aaaaaaaaaaa',isLiveContent:true,lengthSeconds:'300'}});
  f.win.ytInitialPlayerResponse={videoDetails:{videoId:'aaaaaaaaaaa',isLiveContent:false,lengthSeconds:'300'}};
  assert.equal(playbackMetadata(f.win,'aaaaaaaaaaa').live,true);
  rememberPlaybackMetadata(f.win,{videoDetails:{videoId:'bad',isLiveContent:false}});
  assert.equal(playbackMetadata(f.win,'bbbbbbbbbbb'),null);
});

function nativeReport(f,position,frames=1,generation=1) {
  f.win.h5vcc={system:{getYtafMediaReport:()=>`Current player: Shared Starfish\nSession: 8 generation: ${generation}\nPlayback rate: requested 1x applied 1x\nNative presentation: ${position} seconds\nPresented frames: ${frames}\n`}};
}
test('an accepted DOM target does not report resumed until a native frame reaches it',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];nativeReport(f,0);
  const api=start(f);f.media('playing');assert.equal(f.video.currentTime,90);
  f.video.seeking=true;f.advance(1500);assert.equal(f.notifications.length,0);assert.match(api.status,/waiting/);
  nativeReport(f,90.2,2,2);f.advance(500);assert.match(api.status,/reached/);
  assert.match(f.notifications.at(-1)[0],/Resumed/);assert.equal(f.timers.size,0);
});
test('YouTube account target is retargeted instead of overwritten by a local bookmark',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];f.video.currentTime=120;
  const seeks=[];f.doc.player={getVideoData:()=>({video_id:'aaaaaaaaaaa'}),seekTo:(time)=>seeks.push(time)};
  nativeReport(f,0);const api=start(f);f.media('playing');assert.deepEqual(seeks,[120]);
  nativeReport(f,120.2,4,2);f.advance(500);assert.match(api.status,/reached/);
  assert.equal(f.notifications.length,0);
});
test('ignored resume seek retries finitely and times out without claiming success or losing bookmark',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark()];nativeReport(f,0);
  let writes=0;Object.defineProperty(f.video,'currentTime',{get:()=>0,set:()=>writes++});
  const api=start(f);f.media('playing');f.advance(12000);
  assert.equal(writes,3);assert.equal(f.timers.size,0);assert.match(api.status,/timed out/);
  assert.match(f.notifications.at(-1)[0],/Could not confirm/);assert.equal(f.settings.playbackPositions[0].position,90);
});
test('clicking a settings control does not cancel pending resume; actual timeline interaction does',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark()];const api=start(f);
  f.doc.emit('pointerdown',{target:{closest:()=>null}});f.media('playing');assert.equal(f.video.currentTime,90);
  f.doc.emit('pointerdown',{target:{closest:()=>({})}});assert.equal(f.timers.size,0);
  assert.match(api.status,/Manual/);
});
test('pending resume cancellation handles navigation, disabling, clearing and page exit',()=>{
  for(const variant of ['navigate','disable','clear','exit']) {
    const f=playbackFixture();f.settings.playbackPositions=[f.bookmark()];const api=start(f);f.media('playing');
    if(variant==='navigate'){f.win.location.href='?v=bbbbbbbbbbb';f.win.emit('hashchange');}
    if(variant==='disable'){f.settings.rememberPlaybackPosition=false;f.doc.emit('ytaf-config-changed',{detail:{key:'rememberPlaybackPosition'}});}
    if(variant==='clear')api.clear();if(variant==='exit')f.win.emit('pagehide');
    const notifications=f.notifications.length;f.advance(20000);assert.equal(f.timers.size,0,variant);
    assert.equal(f.notifications.length,notifications,variant);
  }
});
