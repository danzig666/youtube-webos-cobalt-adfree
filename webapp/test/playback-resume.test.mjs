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
  g.media('playing');g.advance(1500);assert.equal(g.video.currentTime,85);
  g.video.currentTime=0;g.media('playing');assert.equal(g.video.currentTime,0);
});
test('native/cloud resume, explicit timestamps, manual seeking and incompatible durations win over local bookmarks',()=>{
  for(const variant of ['cloud','timestamp','manual','duration']) {
    const f=playbackFixture();f.settings.playbackPositions=[f.bookmark()];
    if(variant==='cloud') f.video.currentTime=35;
    if(variant==='timestamp') f.win.location.href+='&t=0';
    if(variant==='duration') f.settings.playbackPositions[0].duration=350;
    const api=start(f);if(variant==='manual')api.manual();f.media('playing');f.advance(2000);
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
    if(variant==='disabled')f.settings.playbackResumeMode='youtube';
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
  const api=start(f);f.media('playing');f.advance(1500);assert.equal(f.video.currentTime,90);
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
  const api=start(f);f.media('playing');f.advance(13500);
  assert.equal(writes,3);assert.equal(f.timers.size,0);assert.match(api.status,/timed out/);
  assert.match(f.notifications.at(-1)[0],/Could not confirm/);assert.equal(f.settings.playbackPositions[0].position,90);
});
test('clicking a settings control does not cancel pending resume; actual timeline interaction does',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark()];const api=start(f);
  f.doc.emit('pointerdown',{target:{closest:()=>null}});f.media('playing');f.advance(1500);assert.equal(f.video.currentTime,90);
  f.doc.emit('pointerdown',{target:{closest:()=>({})}});assert.equal(f.timers.size,0);
  assert.match(api.status,/Manual/);
});
test('pending resume cancellation handles navigation, disabling, clearing and page exit',()=>{
  for(const variant of ['navigate','disable','clear','exit']) {
    const f=playbackFixture();f.settings.playbackPositions=[f.bookmark()];const api=start(f);f.media('playing');f.advance(1500);
    if(variant==='navigate'){f.win.location.href='?v=bbbbbbbbbbb';f.win.emit('hashchange');}
    if(variant==='disable'){f.settings.playbackResumeMode='youtube';f.doc.emit('ytaf-config-changed',{detail:{key:'playbackResumeMode'}});}
    if(variant==='clear')api.clear();if(variant==='exit')f.win.emit('pagehide');
    const notifications=f.notifications.length;f.advance(20000);assert.equal(f.timers.size,0,variant);
    assert.equal(f.notifications.length,notifications,variant);
  }
});
test('an account seek already in flight is not restarted by a synthetic timeupdate',()=>{
  const f=playbackFixture();f.video.currentTime=120;f.video.seeking=true;nativeReport(f,0);
  const seeks=[];f.doc.player={getVideoData:()=>({video_id:'aaaaaaaaaaa'}),seekTo:time=>seeks.push(time)};
  start(f);f.media('playing');f.media('timeupdate');assert.deepEqual(seeks,[]);
  nativeReport(f,120.2,4,2);f.video.currentTime=120.2;f.video.seeking=false;f.media('seeked');
  assert.deepEqual(seeks,[]);assert.equal(f.timers.size,0);assert.equal(f.notifications.length,0);
});


test('YouTube-only mode never restores or rewrites TV bookmarks, including unknown or missing mode',()=>{
  for(const mode of ['youtube',undefined,'invalid']) {
    const f=playbackFixture();f.settings.playbackResumeMode=mode;
    f.settings.playbackPositions=[f.bookmark(90)];
    const api=start(f);f.media('playing');f.advance(2000);
    assert.equal(f.video.currentTime,0,String(mode));
    f.video.currentTime=55;f.media('timeupdate');f.media('pause');f.win.emit('pagehide');
    assert.equal(f.writes.length,0,String(mode));assert.equal(f.settings.playbackPositions[0].position,90);
    assert.match(api.localStatus,/off/);
  }
});
test('TV fallback waits 1500 ms for YouTube after playback starts',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];start(f);
  f.advance(10000);f.media('loadedmetadata');assert.equal(f.video.currentTime,0);
  f.media('playing');f.advance(1499);assert.equal(f.video.currentTime,0);
  f.advance(1);assert.equal(f.video.currentTime,90);
});
test('YouTube account position arriving during the fallback grace period takes precedence',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];nativeReport(f,0);
  const seeks=[];f.doc.player={getVideoData:()=>({video_id:'aaaaaaaaaaa'}),seekTo:time=>seeks.push(time)};
  start(f);f.media('playing');f.advance(1000);f.video.currentTime=120;nativeReport(f,120,4);
  f.media('timeupdate');f.advance(1000);assert.deepEqual(seeks,[]);assert.equal(f.video.currentTime,120);
  assert.equal(f.writes.at(-1)[0].position,120);
});
test('a late account target is verified after initialization at zero without any TV bookmark',()=>{
  const f=playbackFixture();f.settings.playbackResumeMode='youtube';f.settings.rememberPlaybackPosition=false;nativeReport(f,0);
  const seeks=[];f.doc.player={getVideoData:()=>({video_id:'aaaaaaaaaaa'}),seekTo:time=>seeks.push(time)};
  const api=start(f);f.media('playing');f.advance(800);f.video.currentTime=120;f.media('timeupdate');
  assert.deepEqual(seeks,[120]);assert.equal(f.writes.length,0);
  nativeReport(f,120.2,4,2);f.advance(500);assert.match(api.status,/YouTube.*reached/);
  f.media('pause');assert.equal(f.writes.length,0);
});
test('explicit timestamps suppress TV fallback but still verify YouTube native playback',()=>{
  for(const target of [0,120]) {
    const f=playbackFixture();f.win.location.href+=`&t=${target}`;
    f.settings.playbackPositions=[f.bookmark(90)];nativeReport(f,0);
    const seeks=[];f.doc.player={getVideoData:()=>({video_id:'aaaaaaaaaaa'}),seekTo:time=>seeks.push(time)};
    start(f);f.video.currentTime=target;f.media('playing');f.advance(1600);
    assert.deepEqual(seeks,target?[120]:[]);assert.equal(f.writes.length,0);
  }
});
test('a later account seek already playing cancels an obsolete local retry',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];nativeReport(f,0);
  const seeks=[];f.doc.player={getVideoData:()=>({video_id:'aaaaaaaaaaa'}),seekTo:time=>{seeks.push(time);f.video.currentTime=time;}};
  const api=start(f);f.media('playing');f.advance(1500);assert.deepEqual(seeks,[90]);
  f.advance(200);f.video.currentTime=120;nativeReport(f,120,4,2);f.media('timeupdate');f.advance(3000);
  assert.deepEqual(seeks,[90]);assert.equal(f.timers.size,0);assert.match(api.status,/YouTube.*reached/);
  assert.equal(f.notifications.length,0);
});
test('a later account target replaces the pending TV target when native playback has not reached either',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];nativeReport(f,0);
  const seeks=[];f.doc.player={getVideoData:()=>({video_id:'aaaaaaaaaaa'}),seekTo:time=>{seeks.push(time);f.video.currentTime=time;}};
  const api=start(f);f.media('playing');f.advance(1500);f.advance(200);
  f.video.currentTime=120;f.media('timeupdate');assert.deepEqual(seeks,[90,120]);
  nativeReport(f,120.2,4,2);f.advance(500);assert.match(api.status,/YouTube.*reached/);
  assert.equal(f.notifications.length,0);assert.equal(f.writes.length,0);
});
test('loadedmetadata before SPA navigation does not permanently disable the new video',()=>{
  const f=playbackFixture();start(f);f.video.currentTime=60;f.media('timeupdate');
  f.doc.player={getVideoData:()=>({video_id:'bbbbbbbbbbb'})};
  f.win.__ytafPlaybackMetadata.unshift({id:'bbbbbbbbbbb',live:false,duration:300});
  f.video.currentTime=0;f.media('loadedmetadata');
  f.win.location.href='https://www.youtube.com/tv?v=bbbbbbbbbbb';f.win.emit('hashchange');
  f.media('playing');f.video.currentTime=50;f.media('pause');
  assert.equal(f.writes.at(-1)[0].id,'bbbbbbbbbbb');assert.equal(f.writes.at(-1)[0].position,50);
});
test('an unconfirmed DOM target is never saved, while presented native time is saved',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];nativeReport(f,0);
  const api=start(f);api.manual();f.video.currentTime=120;f.media('pause');
  assert.equal(f.writes.length,0);assert.equal(f.settings.playbackPositions[0].position,90);
  nativeReport(f,120.2,3,2);f.video.currentTime=120.4;f.media('pause');
  assert.equal(f.writes.at(-1)[0].position,120.2);assert.match(api.localStatus,/Saved on this TV at 2:00/);
});
test('resume timeout preserves a good TV bookmark instead of replacing it with failed playback',()=>{
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];nativeReport(f,0);
  const api=start(f);f.media('playing');f.advance(13500);assert.match(api.status,/timed out/);
  f.video.currentTime=10;nativeReport(f,10,3);f.media('timeupdate');f.media('pause');f.win.emit('pagehide');
  assert.equal(f.writes.length,0);assert.equal(f.settings.playbackPositions[0].position,90);
});
test('leaving playback or making a manual seek cancels the TV fallback grace period',()=>{
  for(const action of ['navigate','manual','exit','mode']) {
    const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];const api=start(f);f.media('playing');
    f.advance(500);
    if(action==='navigate'){f.win.location.href='?v=bbbbbbbbbbb';f.win.emit('hashchange');}
    if(action==='manual')api.manual();
    if(action==='exit')f.win.emit('pagehide');
    if(action==='mode'){f.settings.playbackResumeMode='youtube';f.doc.emit('ytaf-config-changed',{detail:{key:'playbackResumeMode'}});}
    f.advance(2000);assert.equal(f.video.currentTime,0,action);assert.equal(f.timers.size,0,action);
  }
});


test('a player identity change alone cannot save the previous media source under a new video',()=>{
  const f=playbackFixture();start(f);f.video.currentTime=65;f.media('timeupdate');
  f.doc.player={getVideoData:()=>({video_id:'bbbbbbbbbbb'})};
  f.win.__ytafPlaybackMetadata.unshift({id:'bbbbbbbbbbb',live:false,duration:300});
  f.win.location.href='https://www.youtube.com/tv?v=bbbbbbbbbbb';f.win.emit('hashchange');
  f.media('timeupdate');f.media('pause');
  assert.equal(f.settings.playbackPositions.some(entry=>entry.id==='bbbbbbbbbbb'),false);
  f.video.currentTime=0;f.media('loadedmetadata');f.media('playing');
  f.video.currentTime=35;f.media('pause');assert.equal(f.writes.at(-1)[0].id,'bbbbbbbbbbb');
  assert.equal(f.writes.at(-1)[0].position,35);
});
test('an available native bridge with an inactive or invalid snapshot cannot confirm or save a DOM target',()=>{
  for(const snapshot of ['Current player: Shared Starfish (inactive)\nSession: 8 generation: 1\nPlayback rate: requested 1x applied 1x\nNative presentation: 0 seconds\nPresented frames: 0\n','unavailable']) {
    const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];
    f.win.h5vcc={system:{getYtafMediaReport:()=>snapshot}};
    const api=start(f);f.video.currentTime=120;f.media('playing');f.media('pause');
    assert.equal(f.writes.length,0);assert.equal(f.settings.playbackPositions[0].position,90);
    api.manual();f.video.currentTime=120.5;f.media('timeupdate');assert.equal(f.writes.length,0);
  }
  const f=playbackFixture();f.settings.playbackPositions=[f.bookmark(90)];nativeReport(f,0);
  const api=start(f);f.media('playing');f.advance(1500);
  f.win.h5vcc.system.getYtafMediaReport=()=>'';f.video.currentTime=90.5;f.advance(500);
  assert.match(api.status,/waiting/);assert.equal(f.notifications.length,0);
  nativeReport(f,90.5,3,2);f.advance(500);assert.match(api.status,/reached/);
});


test('changing resume mode during navigation cannot bypass source identity checks',()=>{
  const f=playbackFixture();f.settings.playbackResumeMode='youtube';nativeReport(f,65);
  start(f);f.video.currentTime=65;f.media('timeupdate');
  f.doc.player={getVideoData:()=>({video_id:'bbbbbbbbbbb'})};
  f.win.__ytafPlaybackMetadata.unshift({id:'bbbbbbbbbbb',live:false,duration:300});
  f.win.location.href='https://www.youtube.com/tv?v=bbbbbbbbbbb';f.win.emit('hashchange');
  f.settings.playbackResumeMode='youtube-local';
  f.doc.emit('ytaf-config-changed',{detail:{key:'playbackResumeMode'}});
  f.media('pause');assert.equal(f.writes.length,0);
  f.video.currentTime=0;f.media('loadedmetadata');f.media('playing');
  f.video.currentTime=35;nativeReport(f,35,2,2);f.media('pause');
  assert.equal(f.writes.at(-1)[0].id,'bbbbbbbbbbb');assert.equal(f.writes.at(-1)[0].position,35);
});


function recentFixture() {
  const f=playbackFixture();f.settings.playbackResumeMode='youtube';
  f.win.__ytafThumbnailProgress={getResumePosition:id=>id==='aaaaaaaaaaa'?f.bookmark(90):null};
  f.doc.player={getVideoData:()=>({video_id:'aaaaaaaaaaa'})};
  return f;
}
test('confirmed cache queues during loadstart before metadata and first playback, without a grace delay',()=>{
  const f=recentFixture();f.video.readyState=0;f.video.duration=NaN;nativeReport(f,0,0);
  let position=0;const requests=[];
  Object.defineProperty(f.video,'currentTime',{get:()=>position,set:value=>{position=value;requests.push({value,ready:f.video.readyState});}});
  f.doc.player.seekTo=()=>assert.fail('pre-metadata must use Cobalt’s retained initial currentTime');
  const api=start(f);f.media('loadstart');
  assert.deepEqual(requests,[{value:90,ready:0}]);assert.equal(f.timers.size,0);
  f.advance(20000);assert.equal(requests.length,1,'network loading does not consume retry/confirmation timeout');
  f.video.readyState=1;f.video.duration=300;f.media('loadedmetadata');
  assert.deepEqual(requests,[{value:90,ready:0}]);assert.equal(f.notifications.length,0);
  nativeReport(f,90.2,1,2);f.video.readyState=4;f.media('playing');
  assert.match(api.status,/Last watched.*reached/);assert.equal(f.notifications.length,1);
  assert.equal(f.writes.length,0);assert.equal(f.timers.size,0);
});
test('metadata is an immediate fallback when loadstart had no matching player identity',()=>{
  const f=recentFixture();const api=start(f);f.video.readyState=0;f.video.duration=NaN;
  f.doc.player={getVideoData:()=>({video_id:'bbbbbbbbbbb'})};f.media('loadstart');assert.equal(f.video.currentTime,0);
  f.doc.player={getVideoData:()=>({video_id:'aaaaaaaaaaa'})};f.video.readyState=1;f.video.duration=300;
  f.media('loadedmetadata');assert.equal(f.video.currentTime,90);assert.match(api.status,/waiting for playback confirmation/);
});
test('queued account positions, explicit timestamps, live/unknown data and ads suppress early cache injection',()=>{
  for(const variant of ['account','timestamp','live','unknown','ad','duration']) {
    const f=recentFixture();f.video.readyState=0;f.video.duration=NaN;
    if(variant==='account')f.video.currentTime=120;
    if(variant==='timestamp')f.win.location.href+='&t=0';
    if(variant==='live')f.win.__ytafPlaybackMetadata[0].live=true;
    if(variant==='unknown')f.win.__ytafPlaybackMetadata[0].live=null;
    if(variant==='ad')f.doc.player.getAdState=()=>1;
    if(variant==='duration')f.win.__ytafPlaybackMetadata[0].duration=350;
    start(f);f.media('loadstart');assert.equal(f.video.currentTime,variant==='account'?120:0,variant);
    assert.equal(f.timers.size,0,variant);
  }
});
test('late YouTube targets replace a queued cache target before the first native frame',()=>{
  const f=recentFixture();f.video.readyState=0;f.video.duration=NaN;nativeReport(f,0,0);
  const api=start(f);f.media('loadstart');assert.equal(f.video.currentTime,90);
  f.video.currentTime=120;f.video.readyState=1;f.video.duration=300;f.media('loadedmetadata');
  assert.equal(f.video.currentTime,120);
  nativeReport(f,120.2,1,2);f.media('playing');assert.match(api.status,/YouTube.*reached/);
  assert.equal(f.notifications.length,0);
});
test('a page reset of the pre-metadata request is repaired at metadata rather than after playing',()=>{
  const f=recentFixture();f.video.readyState=0;f.video.duration=NaN;nativeReport(f,0,0);
  start(f);f.media('loadstart');assert.equal(f.video.currentTime,90);
  f.video.currentTime=0;f.video.readyState=1;f.video.duration=300;f.media('loadedmetadata');
  assert.equal(f.video.currentTime,90);
});
test('old native frames cannot confirm an early target for a new source',()=>{
  const f=recentFixture();nativeReport(f,90,10,1);const api=start(f);
  f.video.readyState=0;f.video.duration=NaN;f.media('loadstart');
  f.video.readyState=1;f.video.duration=300;nativeReport(f,90.1,11,1);f.media('loadedmetadata');
  assert.equal(f.notifications.length,0);assert.match(api.status,/waiting/);
  nativeReport(f,90.2,1,2);f.media('playing');assert.match(api.status,/reached/);
});
test('manual seek and navigation cancel pre-metadata resume without later retries',()=>{
  for(const action of ['manual','navigate','emptied']){
    const f=recentFixture();f.video.readyState=0;f.video.duration=NaN;const api=start(f);f.media('loadstart');
    if(action==='manual'){api.manual();f.video.currentTime=30;}
    if(action==='navigate'){f.win.location.href='https://www.youtube.com/tv#/';f.doc.body.classList.contains=()=>false;f.win.emit('hashchange');}
    if(action==='emptied')f.media('emptied');
    f.advance(30000);assert.equal(f.notifications.length,0,action);assert.equal(f.timers.size,0,action);
    if(action==='manual'){f.video.readyState=1;f.video.duration=300;f.media('loadedmetadata');f.media('playing');assert.equal(f.video.currentTime,30);}
  }
});

test('the first frame in an initially empty native generation confirms an early cached target',()=>{
  const f=recentFixture();f.video.readyState=0;f.video.duration=NaN;nativeReport(f,0,0,1);
  const api=start(f);f.media('loadstart');f.video.readyState=1;f.video.duration=300;f.media('loadedmetadata');
  nativeReport(f,90.2,1,1);f.media('playing');assert.match(api.status,/Last watched.*reached/);
  assert.equal(f.notifications.length,1);assert.equal(f.timers.size,0);
});
test('late account retargeting cannot confirm frames from the outgoing native source',()=>{
  const f=recentFixture();f.video.readyState=0;f.video.duration=NaN;nativeReport(f,120,10,1);
  const api=start(f);f.media('loadstart');f.video.currentTime=120;
  f.video.readyState=1;f.video.duration=300;nativeReport(f,120.1,11,1);f.media('loadedmetadata');
  assert.match(api.status,/waiting/);assert.equal(f.notifications.length,0);
  nativeReport(f,120.2,1,2);f.media('playing');assert.match(api.status,/YouTube.*reached/);
});
test('metadata invalidating an early cached source cancels retries and pending confirmation',()=>{
  for(const variant of ['live','ad','duration']){
    const f=recentFixture();f.video.readyState=0;f.video.duration=NaN;const api=start(f);f.media('loadstart');
    f.video.readyState=1;f.video.duration=300;
    if(variant==='live')f.win.__ytafPlaybackMetadata[0].live=true;
    if(variant==='ad')f.doc.player.getAdState=()=>1;
    if(variant==='duration'){f.video.duration=350;f.win.__ytafPlaybackMetadata[0].duration=350;}
    f.media('loadedmetadata');f.advance(15000);assert.equal(f.timers.size,0,variant);
    assert.equal(f.notifications.length,0,variant);assert.match(api.status,/not eligible|does not match/,variant);
  }
});

test('an old player metadata event cannot authorize early resume after only its identity changes',()=>{
  const f=recentFixture();f.video.readyState=0;f.video.duration=NaN;
  f.doc.player={getVideoData:()=>({video_id:'bbbbbbbbbbb'})};start(f);f.media('loadstart');
  f.video.readyState=1;f.video.duration=300;f.media('loadedmetadata');
  f.doc.player={getVideoData:()=>({video_id:'aaaaaaaaaaa'})};f.media('playing');
  assert.equal(f.video.currentTime,0);assert.equal(f.timers.size,0);
  f.media('loadedmetadata');assert.equal(f.video.currentTime,90);
});
