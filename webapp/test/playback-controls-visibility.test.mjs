import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackControlsReveal} from '../src/playback-controls-visibility.mjs';

function fixture() {
  let time = 1000;
  const events = [], listeners = new Map();
  function node(tag = 'DIV', parent = null) {
    return {tagName: tag, parentElement: parent, style: {display: 'block', visibility: 'visible', opacity: '1'},
      rect: {width: 800, height: 100, top: 600, bottom: 700, left: 80, right: 880},
      children: [], getBoundingClientRect() {return this.rect;},
      getAttribute() {return null;}, querySelectorAll() {return this.children;}};
  }
  const html = node('HTML'), body = node('BODY', html), controls = node('YT-FOCUS-CONTAINER', body);
  html.contains = candidate => {
    for (let current = candidate; current; current = current.parentElement) if (current === html) return true;
    return false;
  };
  body.classList = {contains: name => name === 'WEB_PAGE_TYPE_WATCH'};
  body.dispatchEvent = event => {events.push(event); return true;};
  controls.style.opacity = '0';
  const doc = {documentElement: html, body, activeElement: body, controls, video: {readyState: 4}, overlays: [],
    querySelector(selector) {return selector === 'video' ? this.video : selector.startsWith('yt-focus-container') ? this.controls : null;},
    querySelectorAll() {return this.overlays;}, addEventListener(type, fn) {listeners.set(type, fn);}};
  const win = {innerWidth: 1280, innerHeight: 720, Date: {now: () => time},
    location: {href: 'https://www.youtube.com/tv?v=aaaaaaaaaaa'},
    getComputedStyle: target => target.style,
    KeyboardEvent: class {constructor(type, options) {Object.assign(this, {type}, options);}},
    addEventListener(type, fn) {listeners.set(type, fn);}};
  const show = createPlaybackControlsReveal(doc, win);
  return {doc, win, show, controls, events, node, advance(ms) {time += ms;}, emit(type) {listeners.get(type)?.();}};
}

test('hidden native controls get one identifiable Enter pair; visible controls never get another activation', () => {
  const f = fixture();
  assert.equal(f.show(), f.controls);
  assert.deepEqual(f.events.map(({type, key, keyCode, which}) => [type, key, keyCode, which]),
    [['keydown', 'Enter', 13, 13], ['keyup', 'Enter', 13, 13]]);
  assert.equal(f.events.every(event => f.show.isSynthetic(event)), true);
  assert.equal(f.show.isSynthetic({key: 'Enter', keyCode: 13}), false);
  f.controls.style.opacity = '1'; f.advance(5000);
  assert.equal(f.show(), null); assert.equal(f.events.length, 2);
});

test('hidden controls attempts are bounded and reset on navigation, new media or visibility recovery', () => {
  const f = fixture(); f.show(); f.advance(1499); f.show(); assert.equal(f.events.length, 2);
  f.advance(1); f.show(); assert.equal(f.events.length, 4);
  f.advance(2000); f.show(); assert.equal(f.events.length, 4);
  f.emit('hashchange'); f.show(); assert.equal(f.events.length, 6);
  f.doc.video = {readyState: 4}; f.show(); assert.equal(f.events.length, 8);
  f.win.location.href = 'https://www.youtube.com/tv?v=bbbbbbbbbbb'; f.show(); assert.equal(f.events.length, 10);
  f.controls.style.opacity = '1'; f.show();
  f.controls.style.opacity = '0'; f.show(); assert.equal(f.events.length, 12);
  f.emit('loadedmetadata'); f.show(); assert.equal(f.events.length, 14);
});

test('actual ancestor visibility and geometry determine hidden controls, without relying on YouTube class hashes', () => {
  for (const kind of ['ancestor', 'offscreen', 'zero-size']) {
    const f = fixture(); f.controls.style.opacity = '1';
    if (kind === 'ancestor') {
      const parent = f.node('DIV', f.doc.body); parent.style.display = 'none'; f.controls.parentElement = parent;
    } else if (kind === 'offscreen') f.controls.rect = {...f.controls.rect, top: 900, bottom: 1000};
    else f.controls.rect = {...f.controls.rect, width: 0};
    assert.equal(f.show(), f.controls, kind);
  }
  const f = fixture(); f.controls.style.opacity = '1'; f.controls.rect.width = 0;
  f.controls.children.push(f.node('BUTTON', f.controls));
  assert.equal(f.show(), null); assert.equal(f.events.length, 0, 'visible overflowing button must not be activated');
});

test('watch-host focus is supported while menus, editable fields and interactive controls are protected', () => {
  for (const tag of ['YTLR-WATCH-DEFAULT', 'YTLR-PLAYER']) {
    const f = fixture(); f.doc.activeElement = f.node(tag, f.doc.body);
    assert.equal(f.show(), f.controls, tag);
  }
  for (const kind of ['input', 'button', 'nested-menu', 'overlay', 'settings', 'shorts', 'home']) {
    const f = fixture(), player = f.node('YTLR-WATCH-DEFAULT', f.doc.body);
    if (kind === 'input' || kind === 'button') f.doc.activeElement = f.node(kind.toUpperCase(), player);
    if (kind === 'nested-menu') {
      const menu = f.node('DIV', player); menu.getAttribute = key => key === 'role' ? 'menu' : null;
      f.doc.activeElement = f.node('SPAN', menu);
    }
    if (kind === 'overlay' || kind === 'settings') f.doc.overlays = [f.node('DIV', f.doc.body)];
    if (kind === 'shorts') f.doc.body.classList.contains = () => true;
    if (kind === 'home') f.doc.body.classList.contains = () => false;
    assert.equal(f.show(), null, kind); assert.equal(f.events.length, 0, kind);
  }
});

test('missing, disconnected or uninspectable controls never cause speculative keyboard commands', () => {
  for (const kind of ['missing', 'disconnected', 'layout', 'style', 'overlay-layout', 'metadata']) {
    const f = fixture();
    if (kind === 'missing') f.doc.controls = null;
    if (kind === 'disconnected') f.controls.parentElement = null;
    if (kind === 'layout') {f.controls.style.opacity = '1'; f.controls.rect = null;}
    if (kind === 'style') f.win.getComputedStyle = () => {throw Error('layout unavailable');};
    if (kind === 'overlay-layout') {const overlay = f.node('DIV', f.doc.body); overlay.rect = null; f.doc.overlays = [overlay];}
    if (kind === 'metadata') f.doc.video.readyState = 0;
    assert.equal(f.show(), null, kind); assert.equal(f.events.length, 0, kind);
  }
});

test('legacy numeric event fields are supplied and dispatch failures cannot strand a synthetic pressed key', () => {
  const f = fixture();
  f.win.KeyboardEvent = class {constructor(type, options) {this.type = type; this.key = options.key;}};
  f.doc.body.dispatchEvent = event => {
    f.events.push(event);
    if (event.type === 'keydown') throw Error('target failed');
  };
  assert.doesNotThrow(() => assert.equal(f.show(), null));
  assert.deepEqual(f.events.map(event => [event.type, event.keyCode, event.which]), [['keydown', 13, 13], ['keyup', 13, 13]]);
  assert.equal(f.events.every(event => f.show.isSynthetic(event)), true);
  f.show(); assert.equal(f.events.length, 2, 'a failure is still throttled');
});
