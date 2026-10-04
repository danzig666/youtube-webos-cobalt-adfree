import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capabilityHardwareReport,capabilityPolicyReport,createCapabilityTest} from '../src/capability-test.mjs';
import {createPlaybackDiagnostics} from '../src/playback-diagnostics.mjs';
import {menuFixture} from './helpers/menu-fixture.mjs';
const part = fields => ({status:'ok',body:JSON.stringify({returnValue:true,...fields})});
const hardware = overrides => JSON.stringify({state:'done',config:part({configs:{
 'tv.hw.panelResolution':'UD','tv.hw.displayType':'OLED','tv.model.modelname':'OLED55C3',
 'tv.model.supportHDR':true,'tv.config.supportDolbyHDRContents':false
}}),system:part({sdkVersion:'8.3.0',UHD:'true',OLED:'true'}),decoder:{status:'ok',body:'H264=1920,1080,60\nVP9=3840,2160,60\nAV1=unknown\n'},...overrides});
test('hardware evidence distinguishes explicit false, unknown, and independent decoder results',()=>{
 const report=capabilityHardwareReport(hardware());
 assert.match(report,/Panel interpretation: 4K UHD/);assert.match(report,/HDR10 flag.*yes/);
 assert.match(report,/Dolby Vision flag: no/);assert.match(report,/HLG: unknown/);
 assert.match(report,/VP9: 3840 × 2160 @ 60 fps/);assert.match(report,/AV1: unknown/);
 assert.match(report,/No settings were changed/);
});
test('denied, malformed, unavailable and false service responses cannot imply unsupported hardware',()=>{
 for (const config of [{status:'timeout'}, {status:'unavailable'}, {status:'ok',body:'bad'},part({returnValue:false,configs:{'tv.model.supportHDR':true}})]) {
  const report=capabilityHardwareReport(hardware({config,system:{status:'unavailable'},decoder:{status:'failed'}}));
  assert.match(report,/HDR10 flag.*unknown/);assert.match(report,/Panel interpretation: unknown/);
  assert.match(report,/decoder limits unknown/);
 }
});
test('only allowlisted bounded hardware values are displayed; response bodies and identities stay private',()=>{
 const report=capabilityHardwareReport(hardware({config:part({configs:{
  'tv.model.modelname':'https://private.example/signed?token=secret','tv.hw.panelResolution':'X'.repeat(10000),
  cookies:'private cookie',account:'private account','tv.model.supportHDR':'bogus'
 }}),decoder:{status:'ok',body:'VP9=99999,2160,60\nsecret URL\n'}}));
 assert.equal(/secret|private|XXX/.test(report),false);assert.match(report,/VP9: unknown/);
 assert.match(report,/Model: unknown/);assert.match(report,/HDR10 flag.*unknown/);
});
test('Cobalt probes are read-only, labeled as policy, and work when APIs are absent',()=>{
 const doc={createElement:()=>({canPlayType:()=> 'probably'})};let calls=0;
 const report=capabilityPolicyReport(doc,{MediaSource:{isTypeSupported:()=>{calls++;return true;}}});
 assert.equal(calls,7);assert.match(report,/not independent hardware proof/);assert.match(report,/HDR10: MSE yes/);
 assert.match(capabilityPolicyReport({createElement:()=>({})},{}),/MSE unknown; video unknown/);
});
test('Magic Remote and repeated OK/synthesized clicks start only one native test, then write the same reader',()=>{
 const f=menuFixture(),pending=[];let starts=0,raw=JSON.stringify({state:'idle'});
 const win={setTimeout:fn=>pending.push(fn),h5vcc:{system:{
  getYtafMediaReport:()=> 'existing playback log',getYtafCapabilityTestReport:()=>raw,
  startYtafCapabilityTest:()=>{starts++;raw=JSON.stringify({state:'running'});return true;}
 }}};
 createPlaybackDiagnostics(f.doc,win);
 f.click('__run_capability_test');f.press('__run_capability_test');f.click('__run_capability_test');
 assert.equal(starts,1);assert.match(f.nodes.get('__diagnostics_report').textContent,/running/);
 raw=hardware();pending.shift()();
 const output=f.nodes.get('__diagnostics_report').textContent;
 assert.match(output,/Model: OLED55C3/);assert.match(output,/existing playback log/);
 f.doc.dispatchEvent({type:'ytaf-diagnostics-opened'});assert.equal(f.nodes.get('__diagnostics_report').textContent,output);
});
test('native job timeout is bounded and users can retry',()=>{
 const f=menuFixture(),pending=[];let starts=0,updates=0;
 const win={setTimeout:fn=>pending.push(fn),h5vcc:{system:{startYtafCapabilityTest:()=>{starts++;return true;},getYtafCapabilityTestReport:()=>'{"state":"running"}'}}};
 const test=createCapabilityTest(f.doc,win,()=>updates++);test.run();
 for (let i=0;pending.length&&i<60;i++) pending.shift()();
 assert.equal(pending.length,0);assert.match(test.report(),/timed out/);assert.equal(test.running(),false);
 test.run();assert.equal(starts,2);assert.ok(updates>=3);
});
test('older native runtime produces an actionable message and policy report without throwing',()=>{
 const f=menuFixture();const controller=createCapabilityTest(f.doc,{},()=>{});controller.run();
 assert.match(controller.report(),/requires the updated native/);assert.equal(controller.running(),false);
});
