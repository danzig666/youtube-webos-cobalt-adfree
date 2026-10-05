import test from 'node:test';
import assert from 'node:assert/strict';
import {markStartup,startupReport,watchStartupScreen} from '../src/startup-timing.mjs';
function fixture() {
 let now=1000,card=null,video=null,selector=false;
 const jobs=[],win={Date:{now:()=>now},setTimeout:fn=>jobs.push(fn)};
 const doc={body:{classList:{contains:()=>selector}},querySelector:s=>s==='video'?video:card};
 return {win,doc,jobs,time:v=>now=v,card:v=>card=v,video:v=>video=v,selector:v=>selector=v};
}
test('startup milestones keep first times and expose only approved numeric data',()=>{
 const f=fixture();markStartup(f.win,'preload');f.time(1450);markStartup(f.win,'settings');
 f.time(1900);markStartup(f.win,'settings');markStartup(f.win,'secret');
 f.win.__ytafStartupTimings.times.secret='token';
 assert.match(startupReport(f.win),/Settings ready: 450 ms/);
 assert.match(startupReport(f.win),/YouTube document loaded: not reached/);
 assert.doesNotMatch(startupReport(f.win),/token|secret/);
 f.win.__ytafStartupTimings.times.document='signed-url';
 assert.doesNotMatch(startupReport(f.win),/signed-url/);
});
test('startup screen waits for visible cards and polling expires after a minute',()=>{
 const f=fixture();markStartup(f.win,'preload');
 f.card({getBoundingClientRect:()=>({width:0,height:0})});watchStartupScreen(f.doc,f.win);
 assert.equal(f.jobs.length,1);watchStartupScreen(f.doc,f.win);assert.equal(f.jobs.length,1);
 f.time(61000);f.jobs.shift()();assert.equal(f.jobs.length,0);
 assert.match(startupReport(f.win),/First usable screen: not reached/);
});
test('visible home cards, ready video and account selection each mark usable screen',()=>{
 for (const kind of ['card','video','account']) {
  const f=fixture();markStartup(f.win,'preload');watchStartupScreen(f.doc,f.win);f.time(2100);
  if(kind==='card')f.card({getBoundingClientRect:()=>({width:300,height:200})});
  if(kind==='video')f.video({readyState:2});if(kind==='account')f.selector(true);
  f.jobs.shift()();assert.equal(f.jobs.length,0);
  assert.match(startupReport(f.win),/First usable screen: 1100 ms/);
 }
});
