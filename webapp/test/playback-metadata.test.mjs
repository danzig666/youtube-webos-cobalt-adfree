import assert from 'node:assert/strict';
import test from 'node:test';
import {rememberPlaybackMetadata, playbackMetadata} from '../src/playback-metadata.mjs';

const firstId = 'aaaaaaaaaaa', secondId = 'bbbbbbbbbbb';
const response = (videoId = firstId, fields = {}) => ({videoDetails: {videoId, ...fields}});

test('partial player responses preserve confirmed VOD and its duration', () => {
  const win = {};
  rememberPlaybackMetadata(win, response(firstId, {isLiveContent: false, lengthSeconds: '300'}));
  for (const lengthSeconds of [undefined, null, '', 'unknown', -1, 0, Infinity, true, [25], {}]) {
    rememberPlaybackMetadata(win, {playerResponse: response(firstId, {lengthSeconds})});
    assert.deepEqual(playbackMetadata(win, firstId), {id: firstId, live: false, duration: 300});
  }
});

test('explicit updates replace known fields; a live signal wins over conflicting VOD data', () => {
  const win = {};
  rememberPlaybackMetadata(win, response(firstId, {isLiveContent: false, lengthSeconds: 300}));
  rememberPlaybackMetadata(win, {
    ...response(firstId, {isLiveContent: false, lengthSeconds: '320'}),
    microformat: {playerMicroformatRenderer: {liveBroadcastDetails: {isLiveNow: true}}}
  });
  assert.deepEqual(playbackMetadata(win, firstId), {id: firstId, live: true, duration: 320});
  rememberPlaybackMetadata(win, response(firstId, {isLiveContent: 'false'}));
  assert.equal(playbackMetadata(win, firstId).live, true);
  rememberPlaybackMetadata(win, response(firstId, {isLiveContent: false, lengthSeconds: 330}));
  assert.deepEqual(playbackMetadata(win, firstId), {id: firstId, live: false, duration: 330});
  rememberPlaybackMetadata(win, response(firstId, {isLiveContent: true}));
  assert.equal(playbackMetadata(win, firstId).live, true);
});

test('unknown streams stay unknown and another video cannot supply their metadata', () => {
  const win = {};
  rememberPlaybackMetadata(win, response(firstId, {isLiveContent: false, lengthSeconds: 300}));
  rememberPlaybackMetadata(win, {
    ...response(secondId),
    microformat: {playerMicroformatRenderer: {liveBroadcastDetails: {isLiveNow: false}}}
  });
  assert.deepEqual(playbackMetadata(win, secondId), {id: secondId, live: null, duration: null});
  rememberPlaybackMetadata(win, response('invalid', {isLiveContent: true}));
  assert.deepEqual(playbackMetadata(win, firstId), {id: firstId, live: false, duration: 300});
});

test('cache retains eight recently received video IDs and ignores stale initial data on a hit', () => {
  const win = {ytInitialPlayerResponse: response(firstId, {isLiveContent: false, lengthSeconds: 100})};
  rememberPlaybackMetadata(win, response(firstId, {isLiveContent: true, lengthSeconds: 300}));
  assert.equal(playbackMetadata(win, firstId).live, true);
  delete win.ytInitialPlayerResponse;
  for (let i = 0; i < 7; i++) rememberPlaybackMetadata(win, response(String(i).padStart(11, '0')));
  rememberPlaybackMetadata(win, response(firstId));
  rememberPlaybackMetadata(win, response(secondId));
  assert.equal(win.__ytafPlaybackMetadata.length, 8);
  assert.deepEqual(playbackMetadata(win, firstId), {id: firstId, live: true, duration: 300});
  assert.equal(playbackMetadata(win, '00000000000'), null);
  assert.equal(playbackMetadata(win, 'ccccccccccc'), null);
  assert.deepEqual(Object.keys(playbackMetadata(win, firstId)).sort(), ['duration', 'id', 'live']);
});
