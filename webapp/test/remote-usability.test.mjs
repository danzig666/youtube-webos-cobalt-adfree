import { createShortcutHandler } from '../src/remote-shortcuts.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { canUseNumericShortcuts, createRemoteHelp } from '../src/remote-help.mjs';
import { menuFixture } from './helpers/menu-fixture.mjs';
const watch = {classList: {contains: name => name === 'WEB_PAGE_TYPE_WATCH'}};
test('numeric shortcuts leave input fields, editable descendants and search roles alone', () => {
  const event = {type: 'keydown', key: '1'};
  for (const target of [{tagName:'INPUT'}, {tagName:'TEXTAREA'}, {tagName:'SELECT'},
    {isContentEditable:true}, {getAttribute: () => 'searchbox'},
    {parentElement:{getAttribute: () => 'textbox'}}]) {
    assert.equal(canUseNumericShortcuts({...event, target}, {body:watch}, true), false);
    assert.equal(canUseNumericShortcuts(event, {body:watch, activeElement:target}, true), false);
  }
  assert.equal(canUseNumericShortcuts(event, {body:watch}, true), true);
});
test('numeric shortcuts are opt-out, player-only, and ignore repeat and modifiers', () => {
  const event={type:'keydown'};
  assert.equal(canUseNumericShortcuts(event, {body:watch}, false), false);
  assert.equal(canUseNumericShortcuts(event, {}, true), false);
  for (const extra of [{repeat:true}, {ctrlKey:true}, {shiftKey:true}, {type:'keyup'}])
    assert.equal(canUseNumericShortcuts({...event,...extra}, {body:watch}, true), false);
});
test('the real remote handler respects numeric shortcut and typing preferences', () => {
  const source=fs.readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
  const calls=[]; let enabled=true;
  const doc={body:watch};
  const context=vm.createContext({document:doc, canUseNumericShortcuts,
    handleNumericShortcut:createShortcutHandler(doc,key=>key==='enableNumericShortcuts'?enabled:{},action=>calls.push(action==='slower'?-1:1)),
    isContainerOpen:()=>false, menuHasFocus:()=>false, isGreenKey:()=>false,
    configRead:()=>enabled, isSubtitleShortcut:()=>false,
    adjustPlaybackRate:value=>{calls.push(value);return true;}});
  const from=source.indexOf('  function getRemoteKeyCode('), to=source.indexOf('  function adjustPlaybackRate(',from);
  vm.runInContext('let closedActivationReleaseUntil=0,heldActivationControl=null;\n'+source.slice(from,to)+source.slice(source.indexOf('  const eventHandler = (evt) => {'),source.indexOf('\n  // Red, Green, Yellow, Blue')),context);
  function key(target) { context.input={type:'keydown',key:'1',keyCode:49,target,preventDefault(){},stopPropagation(){}}; vm.runInContext('eventHandler(input)',context); }
  key(); key({tagName:'INPUT'}); enabled=false; key();
  assert.deepEqual(calls,[-1]);
});
test('remote help opens once for one OK press and closes on the next press', () => {
  const f=menuFixture(), panel=createRemoteHelp(f.doc);
  f.press('__remote_help'); f.click('__remote_help');
  assert.equal(panel.children[0].style.display,'block');
  assert.equal(f.nodes.get('__remote_help').getAttribute('aria-expanded'),'true');
  f.press('__remote_help'); assert.equal(panel.children[0].style.display,'none');
});
test('opening settings restores the previous menu item and a closed menu cannot steal focus', () => {
  const source=fs.readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
  const frames=[]; let opened=true, focused=null;
  const items=[1,103].map(tabIndex=>({tabIndex,focus(){focused=tabIndex;}}));
  const context=vm.createContext({lastTabIndex:103, currentFocusIndex:-1,
    sections:{current:()=> 'general',currentButton:()=>items[0]},
    ensureSettingsMounted(){},
    uiContainer:{style:{},querySelectorAll:()=>items},menuContent:{style:{}},
    divTitle:{},document:{activeElement:null,dispatchEvent(){}},CustomEvent:class{},
    queueMenuItemScroll(){},console:{info(){}},suspendSpatialNavigation(){},applyVisibleContainerStyles(){},
    isContainerOpen:()=>opened,setTimeout:fn=>frames.push(fn)});
  const from=source.indexOf('  function focusMenuItem('),to=source.indexOf('  function menuHasFocus()',from);
  vm.runInContext('let latestFocus=null,menuOffset=0;\n'+source.slice(from,to),context);
  vm.runInContext('openContainer()',context); frames.shift()(); assert.equal(focused,103);
  focused=null; vm.runInContext('openContainer()',context); opened=false; frames.shift()(); assert.equal(focused,null);
});
