import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {rememberPlaybackMetadata} from '../src/playback-metadata.mjs';
import {rememberPlayerChannel} from '../src/sponsorblock-channels.mjs';
import {stripSponsoredQrCodePopups} from '../src/sponsored-qr-code-block.mjs';
import * as shortsFilters from '../src/shorts-response-filter.mjs';

test('combined preload and ad filters preserve YouTube playback and watch-time tracking', () => {
  const context = vm.createContext({
    rememberPlaybackMetadata, rememberPlayerChannel, stripSponsoredQrCodePopups, ...shortsFilters,
    configRead: key => key === 'enableAdBlock' || key === 'enableSponsoredQrCodeBlock',
    document: {addEventListener() {}, querySelector: () => null}, window: {},
    console: {info() {}, log() {}, warn() {}, error() {}}
  });
  const preload = readFileSync(new URL('../src/adblock-preload.js', import.meta.url), 'utf8');
  vm.runInContext(preload.slice(preload.indexOf('if (!window.__ytafPreloadExecuted)')), context);
  const adblock = readFileSync(new URL('../src/adblock.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replaceAll('export function ', 'function ');
  vm.runInContext(adblock, context);
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
