import {applyAdResponseFilters} from '../src/ad-response-filter.mjs';
import {applyDisplayFilters} from '../src/display-filters.mjs';
import {markStartup} from '../src/startup-timing.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {rememberPlaybackMetadata} from '../src/playback-metadata.mjs';
import {rememberPlayerChannel} from '../src/sponsorblock-channels.mjs';
import {stripSponsoredQrCodePopups} from '../src/sponsored-qr-code-block.mjs';
import * as shortsFilters from '../src/shorts-response-filter.mjs';

test('combined preload and ad filters preserve YouTube playback and watch-time tracking', () => {
  const context = vm.createContext({applyAdResponseFilters,rememberPlayerChannel,markStartup,
    rememberPlaybackMetadata, stripSponsoredQrCodePopups, ...shortsFilters,
    configRead: key => key === 'enableAdBlock' || key === 'enableSponsoredQrCodeBlock',
    document: {addEventListener() {}, querySelector: () => null}, window: {},
    console: {info() {}, log() {}, warn() {}, error() {}}
  });
  const preload = readFileSync(new URL('../src/adblock-preload.js', import.meta.url), 'utf8');
  vm.runInContext(preload.slice(preload.indexOf('if (!window.__ytafPreloadExecuted)')), context);
  vm.runInContext('const earlyParser = JSON.parse;', context);
  const adblock = readFileSync(new URL('../src/adblock.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replaceAll('export function ', 'function ');
  vm.runInContext(adblock, context);
  assert.equal(vm.runInContext('JSON.parse === earlyParser', context), true,
    'main must not add a second filter pass or strip ad markers before preload');
  const playbackTracking = {
    videostatsPlaybackUrl: {baseUrl: 'https://www.youtube.com/api/stats/playback?example=fixture'},
    videostatsWatchtimeUrl: {baseUrl: 'https://www.youtube.com/api/stats/watchtime?example=fixture'},
    videostatsDelayplayUrl: {baseUrl: 'https://www.youtube.com/api/stats/delayplay?example=fixture'}
  };
  const response = {
    videoDetails: {videoId: 'aaaaaaaaaaa', isLiveContent: false, lengthSeconds: '300'},
    playbackTracking, trackingParams: 'fixture-tracking',
    adPlacements: [{adPlacementRenderer: {}}],
    contents: {items: [{adSlotRenderer: {}}]},
    playerOverlays: {playerOverlayRenderer: {timelyActionRenderers: [
      {timelyActionRenderer: {type: 'TIMELY_ACTION_TYPE_SHOPPING'}},
      {timelyActionRenderer: {type: 'TIMELY_ACTION_TYPE_SURVEY'}}
    ]}}
  };
  context.input = JSON.stringify(response);
  const filtered = JSON.parse(vm.runInContext('JSON.stringify(JSON.parse(input))', context));
  assert.deepEqual(filtered.playbackTracking, playbackTracking);
  assert.equal(filtered.trackingParams, response.trackingParams);
  assert.deepEqual(filtered.adPlacements, []);
  assert.deepEqual(filtered.contents.items, []);
  assert.deepEqual(filtered.playerOverlays.playerOverlayRenderer.timelyActionRenderers,
    [{timelyActionRenderer: {type: 'TIMELY_ACTION_TYPE_SURVEY'}}]);
});

test('older runtimes without preload retain ad filtering and SponsorBlock channel metadata', () => {
  const context = vm.createContext({applyAdResponseFilters,rememberPlaybackMetadata,rememberPlayerChannel,
    configRead: key => key === 'enableAdBlock',window: {},document: {addEventListener() {}}});
  const source = readFileSync(new URL('../src/adblock.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replaceAll('export function ', 'function ');
  vm.runInContext(source, context);
  context.input = JSON.stringify({videoDetails: {videoId:'aaaaaaaaaaa',channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',author:'Creator'},
    contents:{items:[{richItemRenderer:{content:{adSlotRenderer:{}}}}]},adPlacements:[{}]});
  const result = JSON.parse(vm.runInContext('JSON.stringify(JSON.parse(input))',context));
  assert.deepEqual(result.adPlacements,[]);
  assert.deepEqual(result.contents.items,[]);
  assert.equal(context.window.__ytafPlayerChannels[0].name,'Creator');
});

test('early response hook applies optional display filters and preserves watch history data',()=>{
 const ctx=vm.createContext({applyAdResponseFilters,rememberPlayerChannel,markStartup,rememberPlaybackMetadata,applyDisplayFilters,...shortsFilters,
  configRead:key=>['enableShorts','hideEndScreens','hideGuestPrompts','enhanceThumbnails'].includes(key),
  document:{addEventListener(){},querySelector:()=>null},window:{},console:{log(){},warn(){},info(){}}});
 const source=readFileSync(new URL('../src/adblock-preload.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('if (!window.__ytafPreloadExecuted)')),ctx);
 ctx.input=JSON.stringify({videoDetails:{videoId:'aaaaaaaaaaa',lengthSeconds:'300'},playabilityStatus:{status:'OK'},
  endscreen:{endscreenRenderer:{}},playbackTracking:{videostatsWatchtimeUrl:{baseUrl:'history-preserved'}}});
 const response=JSON.parse(vm.runInContext('JSON.stringify(JSON.parse(input))',ctx));
 assert.equal(response.endscreen,undefined);assert.equal(response.playbackTracking.videostatsWatchtimeUrl.baseUrl,'history-preserved');
});
