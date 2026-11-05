import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { sponsorBlockAction, segmentKey, automaticSkipTarget } from '../src/sponsorblock-actions.mjs';
import { channelSkipPolicy, channelExclusionsKey, getCurrentVideoId, getRouteVideoId } from '../src/sponsorblock-channels.mjs';
import { getSponsorBlockSkipTarget } from '../src/sponsorblock-skip-target.mjs';

const videoId = 'aaaaaaaaaaa';
const watchUrl = `https://www.youtube.com/tv#/watch?v=${videoId}`;
const homeUrl = 'https://www.youtube.com/tv#/browse/FEtopics';

// Runs the real controller in a minimal Cobalt-shaped page. The player and the
// initial response keep reporting the watched video after leaving it, as on TV.
function fixture() {
  const win = { location: { href: watchUrl }, ytInitialPlayerResponse: { videoDetails: { videoId } } };
  const requests = [], timers = new Map(), intervals = [];
  let next = 1;
  Object.assign(win, {
    addEventListener() {},
    setTimeout(fn) { const id = next++; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: fn => { intervals.push(fn); return 1; },
    clearInterval() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}
  });
  const video = { paused: false, currentTime: 5, duration: 100, addEventListener() {}, removeEventListener() {} };
  const doc = { body: {}, documentElement: { contains: () => false },
    querySelector: s => s === 'video' ? video : null, querySelectorAll: () => [], addEventListener() {} };
  const config = { enableSponsorBlock: true, sponsorBlockExcludedChannels: [], enableSponsorBlockSponsor: true };
  class XHR {
    open() {} setRequestHeader() {}
    send() { requests.push(this); }
    respond() {
      this.readyState = 4; this.status = 200;
      this.responseText = JSON.stringify([{ segment: [5, 20], category: 'sponsor', actionType: 'skip', UUID: 'u' }]);
      this.onload?.(); this.onreadystatechange?.();
    }
  }
  const context = vm.createContext({
    window: win, document: doc, XMLHttpRequest: XHR,
    MutationObserver: class { observe() {} disconnect() {} },
    sponsorBlockAction, segmentKey, automaticSkipTarget, showSegmentPrompt: () => () => {},
    configRead: k => config[k], channelExclusionsKey, channelSkipPolicy,
    readCurrentVideoId: getCurrentVideoId, getRouteVideoId,
    categories: ['sponsor'], categoryConfig: { sponsor: 'enableSponsorBlockSponsor' }, categoryColors: {},
    getSponsorBlockSkipTarget, showNotification() {}, text: (_s, k) => k,
    console: { warn() {}, info() {}, log() {} }
  });
  const source = fs.readFileSync(new URL('../src/sponsorblock.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replaceAll('export function ', 'function ');
  vm.runInContext(source + '\nglobalThis.controller = new SponsorBlockController();', context);
  const controller = context.controller;
  controller.start();
  const poll = () => intervals[0]();
  return { win, video, requests, controller, poll };
}

test('reopening the same video after Home skips its segments again', () => {
  const f = fixture();
  f.requests[0].respond(); f.poll();
  assert.equal(f.video.currentTime, 20);
  f.win.location.href = homeUrl; f.poll();
  f.win.location.href = watchUrl; f.video.currentTime = 5; f.poll(); f.poll();
  assert.equal(f.video.currentTime, 20);
  assert.equal(f.requests.length, 1, 'loaded segments are reused');
});

test('a response dropped while away is requested again on return', () => {
  const f = fixture();
  f.win.location.href = homeUrl; f.poll();
  f.win.location.href = watchUrl; f.poll(); f.poll();
  assert.equal(f.requests.length, 2);
  f.requests[1].respond(); f.poll();
  assert.equal(f.controller.fetchStatus, 'segments-loaded');
  assert.equal(f.video.currentTime, 20);
});

test('route ID ignores stale player data', () => {
  assert.equal(getRouteVideoId({ location: { href: homeUrl } }), null);
  assert.equal(getRouteVideoId({ location: { href: watchUrl } }), videoId);
  assert.equal(getRouteVideoId({ location: { href: 'https://x/tv#/watch?v=bad' } }), false);
});

test('markers move when the real duration replaces the fallback', () => {
  const f = fixture();
  const style = {}, marker = { style: { setProperty: (k, v) => { style[k] = v; } } };
  const rect = (left, width) => ({ getBoundingClientRect: () => ({ left, top: 0, width, height: 4 }) });
  Object.assign(f.controller, {
    markerNodes: [marker], markerHost: rect(0, 1000), progressSegment: rect(0, 1000),
    segments: [{ segment: [100, 200], category: 'sponsor' }], video: { duration: NaN }
  });
  f.win.ytInitialPlayerResponse = { videoDetails: { videoId, lengthSeconds: '200' } };
  f.controller.syncOverlayWithSegment();
  assert.equal(style.left, '500px');
  f.controller.video.duration = 1000;
  f.controller.syncOverlayWithSegment();
  assert.equal(style.left, '100px');
});
