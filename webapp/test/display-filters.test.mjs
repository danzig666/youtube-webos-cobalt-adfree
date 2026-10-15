import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDisplayFilters,sharperThumbnail,installDisplayPreferences} from '../src/display-filters.mjs';
const all={hideEndScreens:true,enhanceThumbnails:true,hideGuestPrompts:true};
const id='aaaaaaaaaaa',url='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
test('end-screen removal preserves tracking, media data and the rest of the response',()=>{
 const tracking={videostatsWatchtimeUrl:{baseUrl:'private-sentinel'}};
 const value={videoDetails:{videoId:id},playabilityStatus:{status:'OK'},endscreen:{endscreenRenderer:{}},playbackTracking:tracking,streamingData:{formats:[{url:'signed-sentinel'}]}};
 assert.equal(applyDisplayFilters(value,{hideEndScreens:true}),true);
 assert.equal(value.endscreen,undefined);assert.equal(value.playbackTracking,tracking);assert.equal(value.streamingData.formats[0].url,'signed-sentinel');
 const other={endscreen:{endscreenRenderer:{}}};assert.equal(applyDisplayFilters(other,all),false);assert.ok(other.endscreen);
});
test('thumbnail upgrades are limited to standard public video images in real response thumbnail arrays',()=>{
 const response={contents:{thumbnails:[{url,width:480}],outside:url,custom:{thumbnails:[{url:'https://dearrow-thumb.ajay.app/api/'+id}]},better:{thumbnails:[{url,width:1920}]}}};
 assert.equal(applyDisplayFilters(response,{enhanceThumbnails:true}),true);
 assert.equal(response.contents.thumbnails[0].url,'https://i.ytimg.com/vi/'+id+'/sddefault.jpg');
 assert.equal(response.contents.outside,url);assert.equal(response.contents.better.thumbnails[0].url,url);
 assert.match(response.contents.custom.thumbnails[0].url,/dearrow/);
 for(const unsafe of ['https://i.ytimg.com.evil/vi/'+id+'/hqdefault.jpg','https://i.ytimg.com/vi/'+id+'/hq720.jpg','https://other.invalid/vi/'+id+'/hqdefault.jpg'])assert.equal(sharperThumbnail(unsafe),unsafe);
});
test('guest filtering removes recommendation nudges but keeps account errors, consent and ordinary alerts',()=>{
 const response={contents:{items:[{feedNudgeRenderer:{buttons:[{signInEndpoint:{}}]}},{alertWithActionsRenderer:{title:{simpleText:'Sign in for better recommendations'}}},{alertWithActionsRenderer:{title:{simpleText:'Account error'}}},{feedNudgeRenderer:{title:{simpleText:'Accept privacy settings'}}},{tileRenderer:{videoId:id}}]}};
 assert.equal(applyDisplayFilters(response,{hideGuestPrompts:true}),true);assert.equal(response.contents.items.length,3);
 assert.equal(response.contents.items[0].alertWithActionsRenderer.title.simpleText,'Account error');
 assert.equal(response.contents.items[1].feedNudgeRenderer.title.simpleText,'Accept privacy settings');
});
test('defaults are no-ops and malformed/very deep data is bounded',()=>{
 const input={contents:{thumbnails:[{url}],items:[{gridButtonRenderer:{title:{runs:[{text:'Sign in for better recommendations'}]}}}]}};
 const before=JSON.stringify(input);assert.equal(applyDisplayFilters(input,{}),false);assert.equal(JSON.stringify(input),before);
 const deep={contents:{}};let node=deep.contents;for(let i=0;i<100;i++)node=node.child={};
 node.thumbnails=[{url}];assert.doesNotThrow(()=>applyDisplayFilters(deep,all));assert.equal(node.thumbnails[0].url,url);
});
test('logo visibility toggles live without changing video geometry or reloading navigation',()=>{
 const flags=new Set(),listeners={};let enabled=false;
 const doc={documentElement:{classList:{add:k=>flags.add(k),remove:k=>flags.delete(k)}},addEventListener:(key,fn)=>listeners[key]=fn};
 installDisplayPreferences(doc,()=>enabled);assert.equal(flags.size,0);enabled=true;listeners['ytaf-config-changed']({detail:{key:'hideYouTubeLogo'}});assert.ok(flags.has('ytaf-hide-youtube-logo'));
 enabled=false;listeners['ytaf-config-changed']({detail:{key:'hideYouTubeLogo'}});assert.equal(flags.size,0);
});
