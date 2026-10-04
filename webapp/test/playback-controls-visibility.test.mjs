import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackControlsReveal} from '../src/playback-controls-visibility.mjs';

function fixture() {
  let time = 1000, sequence = 0;
  const events = [], listeners = new Map(), timers = new Map();
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
  controls.contains = target => {for(let node=target;node;node=node.parentElement)if(node===controls)return true;return false;};
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
    setTimeout(fn, delay) {const id = ++sequence; timers.set(id, {fn, at: time + delay}); return id;},
    clearTimeout(id) {timers.delete(id);},
    addEventListener(type, fn) {listeners.set(type, fn);}};
  const show = createPlaybackControlsReveal(doc, win);
  return {doc, win, show, controls, events, node, timers, advance(ms) {
    const end = time + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    time = end;
  }, emit(type) {listeners.get(type)?.();}};
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

test('successful asynchronous reveal cycles remain usable when YouTube focuses a native button', () => {
  const f = fixture(), button = f.node('BUTTON', f.controls);
  f.doc.body.dispatchEvent = event => {
    f.events.push(event);
    if (event.type === 'keyup') f.win.setTimeout(() => {
      f.controls.style.opacity = '1'; f.doc.activeElement = button;
    }, 100);
    return true;
  };
  for (let cycle = 0; cycle < 4; cycle++) {
    f.doc.activeElement = f.doc.body; f.controls.style.opacity = '0';
    assert.equal(f.show(), f.controls, `cycle ${cycle}`);
    f.advance(600);
    assert.equal(f.doc.activeElement, button);
    assert.equal(f.events.length, (cycle + 1) * 2);
    assert.equal(f.timers.size, 0, 'success observation never starts polling');
  }
  assert.equal(f.show(), null, 'visible focused button never receives another Enter');
  assert.equal(f.events.length, 8);
});

test('ignored reveal requests stay bounded within ten seconds and recover after a quiet interval', () => {
  const f = fixture();
  f.show(); f.advance(1500); f.show(); f.advance(600);
  assert.equal(f.timers.size, 0);
  f.advance(7899); f.show(); assert.equal(f.events.length, 4);
  f.advance(1); f.show(); assert.equal(f.events.length, 6);
  f.show(); assert.equal(f.events.length, 6);
  f.advance(1500); f.show(); assert.equal(f.events.length, 8);
});

test('navigation cancels pending visibility observation and visible controls reset attempts before button focus guards', () => {
  const f = fixture(); f.show(); assert.equal(f.timers.size, 1);
  f.emit('hashchange'); assert.equal(f.timers.size, 0);
  f.show(); f.advance(1500); f.show(); f.advance(600);
  f.controls.style.opacity = '1'; f.doc.activeElement = f.node('BUTTON', f.controls);
  assert.equal(f.show(), null);
  f.controls.style.opacity = '0'; f.doc.activeElement = f.doc.body;
  assert.equal(f.show(), f.controls, 'visible focused controls must reset the exhausted attempt budget');
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

test('a full-screen controls shell with hidden timeline children is still hidden',()=>{
  const f=fixture();f.controls.style.opacity='1';
  const timeline=f.node('YTLR-PROGRESS-BAR',f.controls);timeline.style.display='none';
  f.controls.children=[timeline];
  assert.equal(f.show(),f.controls);
  assert.equal(f.events.length,2);
});
test('focus retained on a hidden native control can reveal controls again',()=>{
  const f=fixture(),button=f.node('BUTTON',f.controls);
  f.controls.children=[button];f.doc.activeElement=button;
  assert.equal(f.show(),f.controls);
  f.controls.style.opacity='1';
  assert.equal(f.show(),null,'a visible button must never receive an extra activation');
  assert.equal(f.events.length,2);
});

test('ordinary arrows reveal only after YouTube had a chance to show controls',()=>{
  const f=fixture(),event={type:'keydown',keyCode:38};
  f.show.handleKey(event);f.show.handleKey(event);f.advance(79);assert.equal(f.events.length,0);
  f.advance(1);assert.equal(f.events.length,2);
  f.controls.style.opacity='1';f.show.handleKey(event);f.advance(80);
  assert.equal(f.events.length,2,'visible controls never receive an extra Enter');
  assert.equal(f.show.report().attempts,1);
});
test('queued ordinary-key recovery cannot cross navigation or overlay focus',()=>{
  const f=fixture();f.show.handleKey({type:'keydown',keyCode:40});f.emit('hashchange');
  f.advance(80);assert.equal(f.events.length,0);
  f.show.handleKey({type:'keydown',keyCode:40});f.doc.overlays=[f.node()];f.advance(80);
  assert.equal(f.events.length,0);
  f.show.handleKey({type:'keyup',keyCode:40});
  f.doc.overlays=[];f.show.handleKey({type:'keydown',keyCode:40});f.doc.video={readyState:4};f.advance(80);
  assert.equal(f.events.length,0);
});
test('editable focus inside hidden controls still cannot trigger Enter',()=>{
  const f=fixture();f.doc.activeElement=f.node('INPUT',f.controls);
  assert.equal(f.show(),null);assert.equal(f.events.length,0);
});

test('Up dismisses visible controls without recovery reopening them on release or held repeats', () => {
  for (const repeatFlag of [true, undefined]) {
    const f = fixture(); f.controls.style.opacity = '1';
    f.show.handleKey({type:'keydown', keyCode:38});
    f.controls.style.opacity = '0'; // YouTube handles the genuine Up after capture.
    f.advance(100);
    for (let index = 0; index < 8; index++) {
      f.show.handleKey({type:'keydown', keyCode:38, repeat:repeatFlag}); f.advance(100);
    }
    f.show.handleKey({type:'keyup', keyCode:38}); f.advance(100);
    assert.equal(f.events.length, 0, 'the dismissal gesture must never inject Enter');
    f.show.handleKey({type:'keydown', keyCode:38}); f.advance(80);
    assert.equal(f.events.length, 2, 'a later fresh press can recover hidden controls');
  }
});

test('successful reveal observation does not turn the held arrow into another reveal request', () => {
  const f = fixture();
  f.doc.body.dispatchEvent = event => {
    f.events.push(event); if (event.type === 'keyup') f.controls.style.opacity = '1';
    return true;
  };
  f.show.handleKey({type:'keydown', keyCode:38}); f.advance(80);
  assert.equal(f.events.length, 2);
  f.show.handleKey({type:'keydown', keyCode:38}); f.controls.style.opacity = '0'; f.advance(100);
  f.show.handleKey({type:'keydown', keyCode:38}); f.advance(100);
  assert.equal(f.events.length, 2, 'the same held gesture must not undo native dismissal');
});

test('a missing arrow release recovers after a quiet interval and lifecycle reset clears the gesture', () => {
  const f = fixture(); f.controls.style.opacity = '1';
  f.show.handleKey({type:'keydown', keyCode:38}); f.controls.style.opacity = '0'; f.advance(500);
  assert.equal(f.events.length, 0);
  f.show.handleKey({type:'keydown', keyCode:38}); f.advance(80);
  assert.equal(f.events.length, 2);
  f.emit('blur'); f.show.handleKey({type:'keydown', keyCode:38}); f.advance(80);
  assert.equal(f.events.length, 4);
});

test('ordinary recovery requires known hidden controls before the key and the same controls afterward', () => {
  for (const kind of ['unknown', 'throwing', 'replacement']) {
    const f = fixture();
    if (kind === 'unknown') {f.controls.style.opacity = '1'; f.controls.rect = null;}
    if (kind === 'throwing') f.win.getComputedStyle = () => {throw Error('no layout');};
    assert.doesNotThrow(() => f.show.handleKey({type:'keydown', keyCode:38}));
    f.win.getComputedStyle = target => target.style;
    if (kind === 'replacement') {
      f.doc.controls = f.node('YT-FOCUS-CONTAINER', f.doc.body); f.doc.controls.style.opacity = '0';
    } else f.controls.style.opacity = '0';
    f.advance(80); assert.equal(f.events.length, 0, kind);
  }
});

test('a repeated arrow can dismiss newly shown controls before pending recovery fires', () => {
  const f = fixture();
  f.show.handleKey({type:'keydown', keyCode:38});
  f.advance(20); f.controls.style.opacity = '1'; // Native reveal completes first.
  f.show.handleKey({type:'keydown', keyCode:38, repeat:true});
  f.controls.style.opacity = '0'; // Native repeat dismisses them again.
  f.advance(100);
  assert.equal(f.events.length, 0, 'cancel the earlier recovery after visible-controls interaction');
});

test('fast repeats while controls stay hidden do not cancel the first recovery', () => {
  const f = fixture();
  f.show.handleKey({type:'keydown', keyCode:38}); f.advance(20);
  f.show.handleKey({type:'keydown', keyCode:38, repeat:true}); f.advance(60);
  assert.equal(f.events.length, 2);
});
