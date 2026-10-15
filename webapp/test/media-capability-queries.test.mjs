import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCapabilityBitrate as normalize,installMediaCapabilityQueries,capabilityQueryReport} from '../src/media-capability-queries.mjs';
const mime=extra=>'video/webm; codecs="vp09.00.51.08"; '+extra;
test('decimal bitrates are rounded up without relaxing frame-rate, size or codec parameters',()=>{
 assert.equal(normalize(mime('bitrate=4241906.25; framerate=62.5; width=1920')),mime('bitrate=4241907; framerate=62.5; width=1920'));
 assert.equal(normalize(mime('bitrate=2147483646.00000000001')),mime('bitrate=2147483647'));
 assert.equal(normalize(mime('bitrate=0.0')),mime('bitrate=0'));
});
test('malformed, duplicate, quoted, huge and non-media values remain untouched',()=>{
 for(const value of [mime('bitrate=-1.2'),mime('bitrate="1.2"'),mime('bitrate=2147483647.0000001'),mime('bitrate=1e10'),mime('bitrate=12.3oops'),mime('bitrate=1.1; Bitrate=2'),mime('x=";bitrate=1.1"'),mime('bitrate=1.1; width="bad'), 'text/plain; bitrate=1.1',null,undefined])assert.equal(normalize(value),value);
});
function fixture() {
 const calls=[];let rate=1.25;
 class Media {canPlayType(type){calls.push({method:'video',self:this,type});return /bitrate=10;/.test(type)?'probably':'';}}
 const win={MediaSource:{isTypeSupported(type,extra){calls.push({method:'MSE',self:this,type,extra});return /bitrate=10;/.test(type)&&!type.includes('framerate=75');}},HTMLMediaElement:Media};
 const doc={querySelector:()=>({playbackRate:rate})};return {win,doc,calls};
}
test('native rejection retries just the normalized bitrate and preserves receiver, arguments and return type',()=>{
 const f=fixture();installMediaCapabilityQueries(f.win,f.doc);const api=f.win.MediaSource;
 assert.equal(api.isTypeSupported(mime('bitrate=9.25; framerate=60'),'extra'),true);
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].self,api);assert.equal(f.calls[1].extra,'extra');
 const media=new f.win.HTMLMediaElement();assert.equal(media.canPlayType(mime('bitrate=9.25; framerate=60')),'probably');
 assert.equal(installMediaCapabilityQueries(f.win,f.doc),f.win.__ytafCapabilityQueries);
});
test('already supported probes and integer bitrates are not retried; excessive frame rates stay rejected',()=>{
 const f=fixture();installMediaCapabilityQueries(f.win,f.doc);
 assert.equal(f.win.MediaSource.isTypeSupported(mime('bitrate=10; framerate=60')),true);assert.equal(f.calls.length,1);
 assert.equal(f.win.MediaSource.isTypeSupported(mime('bitrate=9.25; framerate=75')),false);
 assert.ok(f.calls.every(c=>c.type.includes('framerate=75')||c.type.includes('framerate=60')));
});
test('reports are bounded and omit raw MIME values, URLs and codec payloads',()=>{
 const f=fixture();installMediaCapabilityQueries(f.win,f.doc);
 for(let i=0;i<1000;i++)f.win.MediaSource.isTypeSupported(`video/webm; codecs="secret-token"; width=${i}; bitrate=1.25; url="https://signed.invalid/token"`);
 const report=capabilityQueryReport(f.win);assert.doesNotMatch(report,/secret-token|signed.invalid|https:/);assert.ok(report.split('\n').length<=14);
});
test('native exceptions propagate and retry failures preserve the original rejection',()=>{
 const win={MediaSource:{isTypeSupported(type){if(type.includes('9.25'))return false;throw Error('native');}}};
 installMediaCapabilityQueries(win,{querySelector:()=>null});assert.equal(win.MediaSource.isTypeSupported(mime('bitrate=9.25')),false);
 assert.throws(()=>win.MediaSource.isTypeSupported('bad'),/native/);
});
