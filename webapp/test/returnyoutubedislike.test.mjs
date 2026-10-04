import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/returnyoutubedislike.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replaceAll('export function ', 'function ');
function fixture() {
  const timers = new Map(), requests = [], listeners = new Map(), observers = [];
  let nextTimer = 0, enabled = true;
  function node() {
    const classes = new Set();
    return { children: [], classList: {add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name)},
    setAttribute() {}, insertBefore(child) { this.children.unshift(child); child.parentElement = this; },
    removeChild(child) { this.children = this.children.filter(item => item !== child); child.parentElement = null; },
    querySelector() { return this.children[0] || null; }, get firstChild() { return this.children[0] || null; } };
  }
  const root = node(), label = node(), button = node();
  button.querySelector = () => label;
  const doc = {documentElement: root, body: root, activeElement: null, readyState: 'complete',
    contains: () => true, createElement: node, querySelector: selector => selector === '[idomkey="dislike-button"]' ? button : null,
    querySelectorAll: () => [], getElementById: () => null,
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); }};
  const location = {hash: '#/watch?v=aaaaaaaaaaa'};
  const schedule = callback => { const id = ++nextTimer; timers.set(id, callback); return id; };
  class XHR {
    open() {}
    send() { requests.push(this); }
    abort() { this.aborted = true; this.onabort?.(); }
    respond(value) { this.status = 200; this.responseText = JSON.stringify(value); this.onload?.(); }
  }
  const win = {location, addEventListener: doc.addEventListener.bind(doc)};
  const context = vm.createContext({window: win, document: doc, location, URLSearchParams, Date,
    setTimeout: schedule, clearTimeout: id => timers.delete(id), XMLHttpRequest: XHR,
    MutationObserver: class { constructor(callback) {this.callback = callback; observers.push(this);} observe() {this.connected = true;} disconnect() {this.connected = false;} },
    configRead: () => enabled});
  vm.runInContext(source + '\nglobalThis.createController=()=>new ReturnYouTubeDislike();', context);
  function start(id = 'aaaaaaaaaaa') {
    location.hash = '#/watch?v=' + id;
    const controller = context.createController(); controller.init(id); return controller;
  }
  return {start, requests, timers, observers, button, label, context, root, location,
    disable() { enabled = false; }};
}

test('old RYD response cannot replace the new video count or revive destroyed observers', () => {
  const f = fixture(), first = f.start();
  const delayedReply = f.requests[0].onload;
  first.destroy();
  assert.equal(f.requests[0].aborted, true);
  const second = f.start('bbbbbbbbbbb');
  f.requests[1].respond({dislikes: 40});
  assert.equal(f.label.firstChild.textContent, '40');
  f.requests[0].status = 200; f.requests[0].responseText = '{"dislikes":999}';
  delayedReply(); first.refresh();
  assert.equal(f.label.firstChild.textContent, '40');
  assert.equal(first.dislikeButton, null);
  assert.equal(first.dislikeButtonObserver, null);
  assert.equal(second.dislikes, 40);
});

test('disabling RYD restores the native label and invalidates already queued callbacks', () => {
  const f = fixture(), controller = f.start();
  f.requests[0].respond({dislikes: 42});
  controller.handleGlobalActivate({type:'click', target: null});
  const queued = [...f.timers.values()], observerCallbacks = f.observers.map(observer => observer.callback);
  f.disable(); controller.destroy();
  assert.equal(f.label.children.length, 0);
  assert.equal(f.root.classList.contains('ytaf-ryd-active'), false);
  assert.equal(f.timers.size, 0);
  queued.forEach(callback => callback()); observerCallbacks.forEach(callback => callback());
  assert.equal(f.timers.size, 0);
  assert.equal(f.label.children.length, 0);
  assert.equal(f.observers.some(observer => observer.connected), false);
});

test('navigation before the delayed controller replacement rejects stale RYD replies', () => {
  const f = fixture(), controller = f.start();
  f.location.hash = '#/watch?v=bbbbbbbbbbb';
  f.requests[0].respond({dislikes: 99});
  assert.equal(f.label.children.length, 0);
  assert.equal(controller.dislikes, 'n/a');
});

test('malformed RYD payloads fall back to the native button without throwing', () => {
  for (const value of [null, {}, {dislikes: -1}, {dislikes: 'wrong'}]) {
    const f = fixture(), controller = f.start();
    assert.doesNotThrow(() => f.requests[0].respond(value));
    assert.equal(controller.votesLoaded, true);
    assert.equal(f.button.classList.contains('ytaf-ryd-show-native'), true);
    assert.equal(f.label.children.length, 0);
  }
});
