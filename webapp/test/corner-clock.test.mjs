import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installCornerClock} from '../src/corner-clock.mjs';

function fixture() {
  let time = new Date(2026, 0, 1, 9, 7, 59, 900).getTime(), sequence = 0;
  const timers = new Map(), observers = [];
  const settings = {clockDisplay: 'off'};
  function events(object = {}) {
    const listeners = new Map();
    return Object.assign(object, {
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
      emit(type, data = {}) { for (const callback of [...(listeners.get(type) || [])]) callback({type, ...data}); }
    });
  }
  function element() {
    return {parentNode: null, children: [], textContent: '', attributes: {}, watch: false,
      classList: {contains(name) {return name === 'WEB_PAGE_TYPE_WATCH' && this.node.watch;}},
      setAttribute(key, value) {this.attributes[key] = value;},
      appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        this.children.push(child);child.parentNode = this;
      },
      removeChild(child) {this.children = this.children.filter(value => value !== child);child.parentNode = null;}
    };
  }
  function body() {const node=element();node.classList.node=node;return node;}
  const doc = events({hidden: false, visibilityState: 'visible', body: body(), documentElement: element(), createElement: element});
  const win = events({
    Date: class extends Date {constructor() {super(time);}},
    setTimeout(callback, delay) {const id=++sequence;timers.set(id,{callback,at:time+delay});return id;},
    clearTimeout(id) {timers.delete(id);},
    MutationObserver: class {
      constructor(callback) {this.callback=callback;this.targets=[];observers.push(this);}
      observe(target, options) {this.targets.push({target,options});}
      disconnect() {this.targets=[];}
    }
  });
  function advance(ms) {
    const end=time+ms;
    for (;;) {
      const next=[...timers].filter(([, timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!next) break;
      time=next[1].at;timers.delete(next[0]);next[1].callback();
    }
    time=end;
  }
  return {doc,win,timers,observers,body,settings,advance,read:key=>settings[key],
    set(mode) {settings.clockDisplay=mode;doc.emit('ytaf-config-changed',{detail:{key:'clockDisplay'}});},
    mutate() {for (const observer of observers) if (observer.targets.length) observer.callback();},
    setTime(value) {time=value;}
  };
}

test('clock is off by default; live enabling shows local 24-hour time without Intl', () => {
  const f=fixture();installCornerClock(f.doc,f.win,f.read);
  assert.equal(f.doc.body.children.length,0);assert.equal(f.timers.size,0);assert.equal(f.observers.length,0);
  f.set('always');
  const node=f.doc.body.children[0];
  assert.equal(node.id,'ytaf-corner-clock');assert.equal(node.textContent,'09:07');
  assert.equal(node.attributes['aria-label'],'Current time');
  assert.equal(f.timers.size,1);
  f.advance(99);assert.equal(node.textContent,'09:07');
  f.advance(1);assert.equal(node.textContent,'09:08');assert.equal(f.timers.size,1);
  f.set('unknown');assert.equal(f.doc.body.children.length,0);assert.equal(f.timers.size,0);
});

test('reinstalling and rebuilding YouTube body retain a single clock and minute timer', () => {
  const f=fixture();f.settings.clockDisplay='always';
  const controller=installCornerClock(f.doc,f.win,f.read), node=f.doc.body.children[0];
  assert.equal(installCornerClock(f.doc,f.win,f.read),controller);
  for (let i=0;i<20;i++) {controller.refresh();f.mutate();}
  assert.equal(f.doc.body.children.length,1);assert.equal(f.timers.size,1);
  f.doc.body.removeChild(node);f.mutate();
  assert.equal(f.doc.body.children[0],node);
  const oldBody=f.doc.body;f.doc.body=f.body();f.mutate();
  assert.equal(f.doc.body.children[0],node);assert.equal(oldBody.children.length,0);
  assert.equal(f.observers.length,1);assert.equal(f.timers.size,1);
  assert.ok(f.observers[0].targets.every(target=>!target.options.subtree));
});

test('browsing clock follows navigation; always mode also shows during playback', () => {
  const f=fixture();installCornerClock(f.doc,f.win,f.read);f.set('browsing');
  assert.equal(f.doc.body.children.length,1);
  f.doc.body.watch=true;f.mutate();
  assert.equal(f.doc.body.children.length,0);assert.equal(f.timers.size,0);
  f.set('always');assert.equal(f.doc.body.children.length,1);
  f.set('browsing');assert.equal(f.doc.body.children.length,0);
  f.doc.body.watch=false;f.doc.emit('yt-navigate-finish');
  assert.equal(f.doc.body.children.length,1);assert.equal(f.timers.size,1);
});

test('background stops the timer; resume displays current wall time immediately', () => {
  const f=fixture();installCornerClock(f.doc,f.win,f.read);f.set('always');
  f.doc.hidden=true;f.doc.emit('visibilitychange');
  assert.equal(f.doc.body.children.length,0);assert.equal(f.timers.size,0);
  assert.equal(f.observers[0].targets.length,0);
  f.setTime(new Date(2026,0,1,21,14,25).getTime());
  f.doc.hidden=false;f.win.emit('pageshow');
  assert.equal(f.doc.body.children[0].textContent,'21:14');assert.equal(f.timers.size,1);
});

test('disable and destroy remove the clock and cancel every scheduled callback', () => {
  const f=fixture();const controller=installCornerClock(f.doc,f.win,f.read);f.set('always');
  const queued=[...f.timers.values()][0].callback;
  f.set('off');f.mutate();assert.equal(f.doc.body.children.length,0);assert.equal(f.timers.size,0);
  f.set('always');controller.destroy();controller.destroy();
  queued();f.set('always');f.win.emit('pageshow');f.doc.emit('visibilitychange');
  assert.equal(f.doc.body.children.length,0);assert.equal(f.timers.size,0);
  assert.equal(f.observers[0].targets.length,0);assert.equal(f.win.__ytafCornerClock,undefined);
});
