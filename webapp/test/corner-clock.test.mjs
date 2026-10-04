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
    return {parentNode: null, parentElement: null, children: [], textContent: '', attributes: {}, style: {}, watch: false,
      get lastElementChild() {return this.children[this.children.length-1];},
      contains(node) {return this===node || this.children.some(child=>child.contains(node));},
      getBoundingClientRect() {return {left:10,top:10,right:1210,bottom:60,width:1200,height:50};},
      classList: {contains(name) {return name === 'WEB_PAGE_TYPE_WATCH' && this.node.watch;}},
      setAttribute(key, value) {this.attributes[key] = value;},
      appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        this.children.push(child);child.parentNode = child.parentElement = this;
      },
      removeChild(child) {this.children = this.children.filter(value => value !== child);child.parentNode = child.parentElement = null;}
    };
  }
  function body() {const node=element();node.classList.node=node;return node;}
  const doc = events({hidden: false, visibilityState: 'visible', body: body(), documentElement: element(), createElement: element});
  let timeline=null, menu=null;
  doc.documentElement.contains=node=>Boolean(doc.body?.contains(node));
  doc.querySelectorAll=selector=>selector.includes('progress-bar') ? timeline ? [timeline] : [] : menu ? [menu] : [];
  const win = events({
    innerWidth:1280,innerHeight:720,
    getComputedStyle:node=>({display:'block',visibility:'visible',opacity:'1',...node.style}),
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
    setTime(value) {time=value;},
    timeline(shown) {if(!timeline){timeline=element();doc.body.appendChild(timeline);}timeline.style.opacity=shown?'1':'0';},
    menu(shown) {if(!menu){menu=element();doc.body.appendChild(menu);}menu.style.display=shown?'block':'none';doc.emit(shown?'ytaf-menu-opened':'ytaf-menu-closed');},
    clock:()=>doc.body.children.find(node=>node.id==='ytaf-corner-clock')
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

test('enabled and legacy modes hide during clean playback and follow the visible seekbar or menu', () => {
  const f=fixture();installCornerClock(f.doc,f.win,f.read);f.set('browsing');
  assert.equal(f.doc.body.children.length,1);
  f.doc.body.watch=true;f.mutate();
  assert.equal(f.clock(),undefined);assert.equal(f.timers.size,1);
  f.set('always');assert.equal(f.clock(),undefined);
  f.timeline(true);f.advance(500);assert.ok(f.clock());
  f.timeline(false);f.advance(500);assert.equal(f.clock(),undefined);
  f.menu(true);assert.ok(f.clock());
  assert.equal(f.doc.body.lastElementChild,f.clock(),'white clock remains above settings');
  f.menu(false);assert.equal(f.clock(),undefined);
  f.set('controls');assert.equal(f.clock(),undefined);
  f.doc.body.watch=false;f.doc.emit('yt-navigate-finish');
  assert.ok(f.clock());assert.equal(f.timers.size,1);
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

test('clock supplies visible upper-right geometry without stylesheet rules and adapts to resize', () => {
  const f=fixture();f.settings.clockDisplay='always';
  f.win.innerWidth=1280;f.win.innerHeight=720;
  const controller=installCornerClock(f.doc,f.win,f.read), node=f.doc.body.children[0];
  assert.equal(controller.status,'mounted');
  assert.equal(node.style.position,'fixed');assert.equal(node.style.display,'block');
  assert.equal(node.style.visibility,'visible');assert.equal(node.style.opacity,'1');
  assert.equal(node.style.top,'36px');assert.equal(node.style.right,'64px');
  assert.equal(node.style.width,'82px');assert.equal(node.style.height,'26px');
  assert.equal(node.style.zIndex,'2147483647');assert.equal(node.style.pointerEvents,'none');
  assert.equal(node.style.backgroundColor,'transparent');assert.equal(node.style.color,'#fff');
  assert.equal(node.style.textShadow,'none');assert.equal(node.style.padding,'0');
  // Simulate external styling being overwritten, and a changed TV viewport.
  node.style.display='none';node.style.opacity='0';
  f.win.innerWidth=1920;f.win.innerHeight=1080;f.win.emit('resize');
  assert.equal(node.style.top,'54px');assert.equal(node.style.right,'96px');
  assert.equal(node.style.width,'123px');assert.equal(node.style.height,'39px');
  assert.equal(node.style.display,'block');assert.equal(node.style.opacity,'1');
  assert.equal(f.timers.size,1);
});

test('partial or missing MutationObserver cannot block clock startup or removed-node recovery', () => {
  for (const broken of [undefined, class {observe() {throw new TypeError('unsupported options');} disconnect() {}}]) {
    const f=fixture();f.win.MutationObserver=broken;f.settings.clockDisplay='always';
    const controller=installCornerClock(f.doc,f.win,f.read);
    assert.equal(controller.status,'mounted');assert.equal(controller.report().observer,'fallback');
    const node=f.doc.body.children[0];f.doc.body.removeChild(node);
    f.advance(1000);
    assert.equal(f.doc.body.children[0],node);assert.equal(f.timers.size,1);
    f.doc.body.watch=true;f.set('browsing');
    assert.equal(controller.status,'playback-hidden');assert.equal(f.doc.body.children.length,0);
    f.doc.body.watch=false;f.advance(1000);
    assert.equal(controller.status,'mounted');assert.equal(f.doc.body.children[0],node);
    f.set('off');assert.equal(controller.status,'off');assert.equal(f.timers.size,0);
    f.advance(3000);assert.equal(f.doc.body.children.length,0);
  }
});

test('enabled clock retries a missing startup body and exposes bounded diagnostic states', () => {
  const f=fixture();f.doc.body=null;f.settings.clockDisplay='always';
  const controller=installCornerClock(f.doc,f.win,f.read);
  assert.equal(controller.status,'waiting-for-body');assert.equal(f.timers.size,1);
  f.doc.body=f.body();f.advance(1000);
  assert.equal(controller.status,'mounted');
  assert.deepEqual(controller.report(),{mode:'controls',status:'mounted',mounted:true,observer:'active',time:'09:08',bounds:'10,10,1200,50',display:'block',visibility:'visible',zIndex:'2147483647'});
  f.doc.hidden=true;f.doc.emit('visibilitychange');
  assert.equal(controller.status,'background');assert.equal(f.timers.size,0);
  f.doc.hidden=false;f.win.emit('pageshow');assert.equal(controller.status,'mounted');
  controller.destroy();assert.equal(controller.status,'destroyed');assert.equal(f.timers.size,0);
});

test('OLED clock shifts a few pixels every three minutes without drifting outside the safe area',()=>{
  const f=fixture();f.set('controls');installCornerClock(f.doc,f.win,f.read);
  const node=f.clock(), initial=[node.style.top,node.style.right];
  f.advance(179999);assert.deepEqual([node.style.top,node.style.right],initial);
  f.advance(1);assert.deepEqual([node.style.top,node.style.right],['39px','65px']);
  f.advance(180000);assert.deepEqual([node.style.top,node.style.right],['42px','67px']);
  f.advance(6*180000);assert.deepEqual([node.style.top,node.style.right],initial);
  assert.equal(node.style.backgroundColor,'transparent');assert.equal(f.timers.size,1);
});
