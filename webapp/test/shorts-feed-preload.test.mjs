import {rememberPlayerChannel} from '../src/sponsorblock-channels.mjs';
import {applyAdResponseFilters} from '../src/ad-response-filter.mjs';
import {markStartup} from '../src/startup-timing.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {rememberPlaybackMetadata} from '../src/playback-metadata.mjs';
import test from 'node:test';
import * as filters from '../src/shorts-response-filter.mjs';

const source = readFileSync(new URL('../src/adblock-preload.js', import.meta.url), 'utf8');
const normal = { tileRenderer: { onSelectCommand: { watchEndpoint: { videoId: 'normal' } } } };
const shortTile = { tileRenderer: { onSelectCommand: { reelWatchEndpoint: {
  overlay: { reelPlayerOverlayRenderer: { style: 'REEL_PLAYER_OVERLAY_STYLE_SHORTS' } }
} } } };

function parser(enabled = false, downstream = false, preferences = {}) {
  const settings = {enableShorts: enabled, enableAdBlock: true,
    enableSponsoredQrCodeBlock: true, ...preferences};
  const context = vm.createContext({applyAdResponseFilters,rememberPlayerChannel,markStartup,rememberPlaybackMetadata,
    ...filters,
    configRead: key => settings[key],
    document: { addEventListener() {}, querySelector: () => null },
    window: {},
    console: { info() {}, log() {}, warn() {}, error() {} }
  });
  vm.runInContext(source.slice(source.indexOf('if (!window.__ytafPreloadExecuted)')), context);
  if (downstream) {
    vm.runInContext(`
      const previousParse = JSON.parse;
      JSON.parse = function () { return previousParse.apply(this, arguments); };
    `, context);
  }
  return (value) => {
    context.input = JSON.stringify(value);
    return JSON.parse(vm.runInContext('JSON.stringify(JSON.parse(input))', context));
  };
}

test('preload filters paginated feed responses through a later parser hook', () => {
  const response = { continuationContents: { sectionListContinuation: { contents: [
    { shelfRenderer: { tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS' } },
    normal
  ] } } };
  const filtered = parser(false, true)(response);
  assert.deepEqual(filtered.continuationContents.sectionListContinuation.contents, [normal]);
});

test('preload filters Shorts tiles and direct reel items while keeping ordinary videos', () => {
  const response = { contents: { items: [normal, shortTile, { reelItemRenderer: { videoId: 'short' } }] } };
  assert.deepEqual(parser()(response).contents.items, [normal]);
  assert.deepEqual(parser(true)(response), response);
});

test('preload filters continuation commands without deleting mixed shelves', () => {
  const response = { onResponseReceivedActions: [{ appendContinuationItemsAction: {
    continuationItems: [{ shelfRenderer: { content: { horizontalListRenderer: {
      items: [normal, shortTile]
    } } } }]
  } }] };
  const filtered = parser()(response);
  assert.deepEqual(filtered.onResponseReceivedActions[0].appendContinuationItemsAction
    .continuationItems[0].shelfRenderer.content.horizontalListRenderer.items, [normal]);
});

test('player responses and unrelated JSON are preserved', () => {
  const parse = parser();
  for (const response of [
    { videoDetails: { videoId: 'playing' }, contents: { items: [shortTile] } },
    { settings: { items: [shortTile] } }
  ]) assert.deepEqual(parse(response), response);
  assert.equal(filters.isShortsPath({}), false);
});

test('cold-start preload removes complete Home ad tiles before the main bundle exists', () => {
  const response = {contents: {items: [
    normal,
    {adSlotRenderer: {slotId: 'home'}},
    {richItemRenderer: {content: {adSlotRenderer: {slotId: 'nested'}}}},
    {tileRenderer: {content: {adSlotRenderer: {slotId: 'tile'}}}},
    {tvMastheadRenderer: {title: 'ad'}},
    {continuationItemRenderer: {continuationEndpoint: {continuationCommand: {token: 'keep'}}}}
  ]}};
  const result = parser(true)(response);
  assert.deepEqual(result.contents.items, [normal, response.contents.items.at(-1)]);
  assert.equal(Object.keys(result.contents.items[0]).length, 1);
});

test('continuation filtering removes wrapped and Shorts ads through a later parser hook', () => {
  const response = {onResponseReceivedActions: [{appendContinuationItemsAction: {
    continuationItems: [normal,
      {richItemRenderer: {content: {adSlotRenderer: {}}}},
      {tileRenderer: {onSelectCommand: {reelWatchEndpoint: {adClientParams: {isAd: 'true'}}}}},
      {reelItemRenderer: {navigationEndpoint: {reelWatchEndpoint: {videoType: 'REEL_VIDEO_TYPE_AD'}}}}
    ]
  }}]};
  assert.deepEqual(parser(true, true)(response).onResponseReceivedActions[0]
    .appendContinuationItemsAction.continuationItems, [normal]);
});

test('early ad and sponsored QR filters respect their independent saved switches', () => {
  const response = {adPlacements: [{ad: 1}], playerAds: [{ad: 2}],
    contents: {items: [normal, {adSlotRenderer: {}}]},
    playerOverlays: {playerOverlayRenderer: {timelyActionRenderers: [
      {timelyActionRenderer: {type: 'TIMELY_ACTION_TYPE_SHOPPING'}},
      {timelyActionRenderer: {type: 'TIMELY_ACTION_TYPE_SURVEY'}}
    ]}}
  };
  for (const enableAdBlock of [true, false]) {
    for (const enableSponsoredQrCodeBlock of [true, false]) {
      const result = parser(true, false, {enableAdBlock, enableSponsoredQrCodeBlock})(response);
      assert.deepEqual(result.adPlacements, enableAdBlock ? [] : response.adPlacements);
      assert.deepEqual(result.playerAds, enableAdBlock ? [] : response.playerAds);
      assert.deepEqual(result.contents.items, enableAdBlock ? [normal] : response.contents.items);
      assert.equal(result.playerOverlays.playerOverlayRenderer.timelyActionRenderers.length,
        enableSponsoredQrCodeBlock ? 1 : 2);
    }
  }
});
