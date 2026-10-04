import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPlaybackReport, createPlaybackDiagnostics, frontendPlaybackReport } from '../src/playback-diagnostics.mjs';
import {menuFixture} from './helpers/menu-fixture.mjs';
test('report remains bounded, complete, and literal in a single scrolling textbox', () => {
  assert.match(readPlaybackReport({}), /updated native/);
  assert.equal(readPlaybackReport({h5vcc:{system:{getYtafMediaReport:()=> 'x'.repeat(70000)}}}).length, 65536);
  const f=menuFixture(); let report='<script>not executed</script>\n' + 'event\n'.repeat(100);
  const panel=createPlaybackDiagnostics(f.doc,{h5vcc:{system:{getYtafMediaReport:()=>report}}});
  const output=f.nodes.get('__diagnostics_report');
  assert.equal(output.textContent.endsWith(report),true);
  assert.equal(output.getAttribute('role'),'textbox');
  assert.equal(output.dataset.ytafControl,'reader');
  assert.equal(panel.children.length,3);
  assert.equal([...f.nodes.keys()].some(key=>/copy|next|previous|refresh/.test(key)),false);
  report='latest session'; f.doc.dispatchEvent({type:'ytaf-diagnostics-opened'});
  assert.equal(output.textContent.endsWith(report),true);
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
