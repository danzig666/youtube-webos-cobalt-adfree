import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sponsorBlockAction,
  automaticSkipTarget,
  segmentKey
} from '../src/sponsorblock-actions.mjs';
import { showSegmentPrompt } from '../src/sponsorblock-prompt.mjs';
import {
  shortcutAction,
  createShortcutHandler,
  createShortcutSettings
} from '../src/remote-shortcuts.mjs';
import { createEndStop, createEndStopPanel } from '../src/stop-after-video.mjs';
import { menuFixture } from './helpers/menu-fixture.mjs';
test('SponsorBlock migration preserves old enabled/disabled categories and validates modes', () => {
  for (const legacy of [true, false])
    for (const mode of [
      undefined,
      'invalid',
      'auto',
      'ask',
      'markers',
      'off'
    ]) {
      const config = { old: legacy, sponsorBlockActions: { sponsor: mode } };
      assert.equal(
        sponsorBlockAction('sponsor', 'old', (key) => config[key]),
        ['auto', 'ask', 'markers', 'off'].includes(mode)
          ? mode
          : legacy
            ? 'auto'
            : 'off'
      );
    }
});
test('overlapping auto skip stops at an unapproved ask segment and respects a decline', () => {
  const ask = { category: 'intro', segment: [10, 25] },
    action = () => 'ask';
  assert.equal(automaticSkipTarget([ask], 5, 30, action, {}), 10);
  assert.equal(automaticSkipTarget([ask], 12, 30, action, {}), null);
  assert.equal(automaticSkipTarget([ask], 26, 30, action, {}), 30);
  assert.equal(
    automaticSkipTarget([ask], 12, 30, action, { [segmentKey(ask)]: true }),
    30
  );
});
function event(type, key, code) {
  return {
    type,
    key,
    keyCode: code,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {}
  };
}
test('custom shortcuts preserve defaults, validate saved actions, consume held keys and leave editing alone', () => {
  assert.equal(shortcutAction('0', {}), 'captions');
  assert.equal(shortcutAction('3', {}), 'faster');
  assert.equal(shortcutAction('9', { 9: 'arbitrary' }), 'none');
  const calls = [],
    doc = { body: { classList: { contains: () => true } } };
  const read = (key) =>
    key === 'enableNumericShortcuts' ? true : { 7: 'end_stop', 0: 'none' };
  const handle = createShortcutHandler(doc, read, (action) =>
    calls.push(action)
  );
  for (const type of ['keydown', 'keydown', 'keypress', 'keyup'])
    assert.equal(handle(event(type, '7', 55)), true);
  assert.deepEqual(calls, ['end_stop']);
  assert.equal(handle(event('keydown', '0', 48)), false);
  doc.activeElement = { tagName: 'INPUT' };
  assert.equal(handle(event('keydown', '7', 55)), false);
  doc.activeElement = null;
  handle(event('keydown', '7', 55));
  assert.equal(calls.length, 2);
});
test('remote mapping changes the selected key only and handles duplicate OK events', () => {
  const f = menuFixture();
  let stored = { 0: 'captions' };
  createShortcutSettings(
    f.doc,
    f.choices,
    () => stored,
    (_key, value) => {
      stored = value;
    }
  );
  f.press('__shortcut_key');
  assert.equal(f.nodes.get('__shortcut_action').textContent, 'Slower playback');
  f.press('__shortcut_action');
  f.click('__shortcut_action');
  assert.equal(stored[1], 'faster');
  assert.equal(stored[0], 'captions');
});
function endFixture() {
  let id = 'aaaaaaaaaaa';
  const handlers = {},
    whandlers = {},
    messages = [];
  let video = {
    ended: false,
    duration: 100,
    paused: false,
    pauses: 0,
    plays: 0,
    pause() {
      this.paused = true;
      this.pauses++;
    },
    play() {
      this.paused = false;
      this.plays++;
    }
  };
  const doc = {
    querySelector: (s) => (s === 'video' ? video : null),
    addEventListener: (name, fn) => (handlers[name] = fn)
  };
  const win = {
    location: { href: `https://www.youtube.com/tv#/watch?v=${id}` },
    addEventListener: (name, fn) => (whandlers[name] = fn)
  };
  const api = createEndStop(doc, win, (text) => messages.push(text));
  return {
    api,
    doc,
    win,
    messages,
    get video() {
      return video;
    },
    emit: (name, target = video) => handlers[name]({ target }),
    navigate(next) {
      win.location.href = `?v=${next}`;
      whandlers.hashchange();
    },
    replace() {
      video = { ...video, ended: false, paused: false, pauses: 0, plays: 0 };
    }
  };
}
test('stop after video waits for real EOS then holds new autoplay until explicit Continue', () => {
  const f = endFixture();
  f.api.activate();
  assert.equal(f.api.state(), 'armed');
  assert.equal(f.video.pauses, 0);
  f.emit('ended');
  assert.equal(f.api.state(), 'armed');
  f.video.ended = true;
  f.emit('ended');
  assert.equal(f.api.state(), 'stopped');
  f.navigate('bbbbbbbbbbb');
  f.replace();
  f.emit('play');
  assert.equal(f.video.paused, true);
  f.api.activate();
  assert.equal(f.api.state(), 'idle');
  assert.equal(f.video.plays, 1);
  f.emit('play');
  assert.equal(f.video.pauses, 1);
});
test('stop cancels on navigation, ignores stale EOS and refuses unbounded live media', () => {
  const f = endFixture();
  f.video.duration = Infinity;
  f.api.activate();
  assert.equal(f.api.state(), 'idle');
  f.video.duration = 100;
  f.api.activate();
  const old = f.video;
  f.navigate('bbbbbbbbbbb');
  assert.equal(f.api.state(), 'idle');
  old.ended = true;
  f.emit('ended', old);
  assert.equal(f.api.state(), 'idle');
  f.replace();
  f.api.activate();
  f.emit('ended', old);
  assert.equal(f.api.state(), 'armed');
  f.api.activate();
  assert.equal(f.api.state(), 'idle');
});
test('stop control tolerates held OK and synthetic clicks', () => {
  const f = menuFixture(),
    calls = [];
  let state = 'idle';
  const win = {
    __ytafEndStop: {
      state: () => state,
      activate() {
        calls.push(1);
        state = state === 'idle' ? 'armed' : 'idle';
        this.render();
      }
    }
  };
  createEndStopPanel(f.doc, win, () => {});
  f.press('__stop_after_video');
  f.click('__stop_after_video');
  assert.equal(calls.length, 1);
  assert.equal(
    f.nodes.get('__stop_after_video').textContent,
    'Cancel stop after this video'
  );
});
test('SponsorBlock prompt defaults to keep watching, restores focus and consumes trailing OK events', () => {
  const f = menuFixture(),
    win = {},
    calls = [];
  // Add browser attachment semantics to the small existing menu fixture.
  const create = f.doc.createElement.bind(f.doc);
  f.doc.createElement = () => {
    const node = create();
    node.contains = (target) =>
      node === target ||
      node.children.some((child) => child.contains?.(target));
    node.appendChild = (child) => {
      node.children.push(child);
      child.parentNode = node;
      child.parentElement = node;
    };
    node.removeChild = (child) => {
      node.children = node.children.filter((n) => n !== child);
      child.parentNode = null;
    };
    return node;
  };
  f.doc.body = f.doc.createElement();
  const previous = f.doc.createElement();
  previous.isConnected = true;
  previous.focus();
  showSegmentPrompt(
    f.doc,
    win,
    'Sponsor',
    () => calls.push('skip'),
    () => calls.push('keep')
  );
  win.__ytafSponsorPrompt.handleKey(event('keydown', 'Enter', 13));
  assert.deepEqual(calls, ['keep']);
  assert.equal(f.doc.activeElement, previous);
  assert.equal(win.__ytafPromptRelease(event('keypress', 'Enter', 13)), true);
  assert.equal(win.__ytafPromptRelease(event('keyup', 'Enter', 13)), true);
  assert.equal(win.__ytafPromptRelease, undefined);
  showSegmentPrompt(
    f.doc,
    win,
    'Sponsor',
    () => calls.push('skip'),
    () => calls.push('keep')
  );
  win.__ytafSponsorPrompt.handleKey(event('keydown', 'ArrowRight', 39));
  win.__ytafSponsorPrompt.handleKey(event('keyup', 'ArrowRight', 39));
  win.__ytafSponsorPrompt.handleKey(event('keydown', 'Enter', 13));
  assert.equal(calls.at(-1), 'skip');
});

test('held shortcut releases while menu is open; blur reset recovers lost keyup', () => {
  const doc={body:{classList:{contains:()=>true}}}, calls=[];
  const handle=createShortcutHandler(doc,()=>true,action=>calls.push(action));
  handle(event('keydown','1',49));handle(event('keyup','1',49),false);
  assert.equal(handle(event('keydown','1',49),false),false);
  handle(event('keydown','1',49));handle.reset();handle(event('keydown','1',49));
  assert.equal(calls.length,3);
});
test('failed autoplay pause reports once and Continue still releases the hold',()=>{
  const f=endFixture();f.api.activate();f.video.ended=true;f.emit('ended');f.replace();
  f.video.pause=()=>{throw new Error('native failure');};
  f.emit('play');f.emit('play');
  assert.equal(f.messages.filter(message=>message.includes('Could not pause')).length,1);
  f.api.activate();assert.equal(f.api.state(),'idle');
});
