import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPlaybackReport, createPlaybackDiagnostics, frontendPlaybackReport, playbackSummary } from '../src/playback-diagnostics.mjs';
import {menuFixture} from './helpers/menu-fixture.mjs';
test('report remains bounded, complete, and literal in a single scrolling textbox', () => {
  assert.match(readPlaybackReport({}), /updated native/);
  assert.equal(readPlaybackReport({h5vcc:{system:{getYtafMediaReport:()=> 'x'.repeat(70000)}}}).length, 65536);
  const f=menuFixture(); let calls=0; let report='<script>not executed</script>\n' + 'event\n'.repeat(100);
  const panel=createPlaybackDiagnostics(f.doc,{h5vcc:{system:{getYtafMediaReport:()=>{calls++;return report;}}}});
  const output=f.nodes.get('__diagnostics_report');
  assert.equal(calls,0);
  assert.equal(output.textContent,'');
  f.doc.dispatchEvent({type:'ytaf-diagnostics-opened'});
  assert.equal(calls,1);
  assert.equal(output.textContent.includes(report),true);
  assert.equal(output.getAttribute('role'),'textbox');
  assert.equal(output.dataset.ytafControl,'reader');
  assert.equal(panel.children.length,4);
  assert.equal([...f.nodes.keys()].some(key=>/copy|next|previous|refresh/.test(key)),false);
  report='latest session'; f.doc.dispatchEvent({type:'ytaf-diagnostics-opened'});
  assert.equal(output.textContent.includes(report),true);
});
test('app playback diagnostics expose actionable state without identities, response bodies or URLs',()=>{
  const video={readyState:4,paused:false,seeking:false,ended:false,currentTime:20,duration:300};
  const doc={querySelector:()=>video,documentElement:{contains:()=>true}};
  const win={sponsorblock:{video,fetchStatus:'fetch-error',fetchRetries:2,lastStatus:503,
    segments:[],skipPollInterval:1,videoID:'secret video ID',lastBody:'secret response',requestUrl:'signed secret URL'}};
  const report=frontendPlaybackReport(doc,win);
  assert.match(report,/SponsorBlock: fetch-error/);assert.match(report,/HTTP status: 503/);
  assert.match(report,/media binding: true/);assert.equal(report.includes('secret'),false);
});
test('clock geometry and thumbnail progress status are visible without serializing unrelated fields',()=>{
  const doc={querySelector:()=>null};
  const win={__ytafCornerClock:{report:()=>({mode:'always',status:'mounted',mounted:true,
    observer:'active',display:'block',visibility:'visible',bounds:'1200,20,82,34',zIndex:'2147483646',
    account:'secret',url:'signed secret URL'})},__ytafThumbnailProgress:{status:'Thumbnail progress updated.'}};
  const report=frontendPlaybackReport(doc,win);
  assert.match(report,/Clock: always \/ mounted/);
  assert.match(report,/bounds: 1200,20,82,34; layer: 2147483646/);
  assert.match(report,/Thumbnail progress: Thumbnail progress updated/);
  assert.equal(report.includes('secret'),false);
  win.__ytafCornerClock.report=()=>{throw Error('unavailable');};
  assert.match(frontendPlaybackReport(doc,win),/Clock: diagnostic status unavailable/);
});
test('health report shows delivery evidence and poll errors without serializing private fields',()=>{
  const doc={querySelector:()=>null};
  const win={Date:{now:()=>10000},__ytafPlaybackHealth:{report:()=>({foreground:true,keys:9,errors:1,
    updates:30,updateAge:'7s',progressAge:'8s',maxDelay:5000,stalls:1,url:'private'})},
    __ytafPlaybackControls:{report:()=>({attempts:2,pending:false})},
    sponsorblock:{lastPollAt:8000,pollErrors:3,mediaRebinds:1,fetchStatus:'idle'}};
  const report=frontendPlaybackReport(doc,win);
  assert.match(report,/maximum 5000ms; stalls 1/);assert.match(report,/last event 7s/);
  assert.match(report,/last 2s ago; errors 3; media replacements 1/);
  assert.doesNotMatch(report,/private/);
});
test('media errors report standardized codes without reading private error messages',()=>{
  const video={networkState:3,error:{code:3,get message(){throw Error('signed private URL');}}};
  const doc={querySelector:()=>video};
  const win={__ytafMediaSourceTracing:true};
  let report=frontendPlaybackReport(doc,win);
  assert.match(report,/Media error: decode \(code 3\)/);
  assert.match(report,/Media network state: 3/);
  assert.match(report,/MediaSource tracing: installed/);
  assert.doesNotMatch(report,/signed|private|URL/);
  for(const code of [NaN,Infinity,-1,100,'3','private token']) {
    video.error.code=code;
    assert.match(frontendPlaybackReport(doc,win),/Media error: unknown/);
  }
  Object.defineProperty(video,'error',{get(){throw Error('private failure');}});
  assert.match(frontendPlaybackReport(doc,win),/Media error: unavailable/);
});

test('decoder summary clearly distinguishes TV firmware, bundled fallback and unavailable evidence',()=>{
  const doc={querySelector:()=>({readyState:4,paused:false})};
  assert.match(playbackSummary(doc,{},'Audio decoder: TV built-in FFmpeg 59 (AAC)\n'),/TV built-in AAC decoder/);
  assert.match(playbackSummary(doc,{},'Audio decoder: Bundled FDK-AAC (AAC)\n'),/Bundled AAC decoder/);
  assert.match(playbackSummary(doc,{},'event=audio_decoder_selected type=audio decoder=Firmware-FFmpeg59 accepted=1'),/TV built-in AAC decoder/);
  assert.match(playbackSummary(doc,{},'event=audio_capability decoder=Firmware-FFmpeg59'),/Not reported/);
  assert.match(playbackSummary(doc,{},''),/Playback: Playing/);
  assert.doesNotMatch(playbackSummary(doc,{},'Audio decoder: secret token\n'),/secret|token/);
});

test('voice status is in the top diagnostics summary without searching the technical log',()=>{
  const doc={querySelector:()=>null};
  const win={__ytafVoiceSearch:{read:()=> 'hu-HU',recordings:1,requests:0,starts:0}};
  const summary=playbackSummary(doc,win,'Magic Remote microphone: Stopped\nMicrophone audio bytes: 32000; non-silent: yes\n');
  assert.match(summary,/Voice search: Hungarian \/ Magyar/);
  assert.match(summary,/has not reached a matching recognition request/);
  assert.match(summary,/Recordings: 1/);
  assert.match(summary,/Microphone: Stopped/);
  assert.match(summary,/Audio received: 32000 bytes/);
});
