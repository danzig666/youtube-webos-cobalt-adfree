import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startConfiguredFeatures} from '../src/feature-bootstrap.mjs';
import {ensureSettingsMounted} from '../src/settings-mount.mjs';
test('features disabled at launch can start after enabling, once, without blocking other features',()=>{
  const handlers={},settings={ad:true,sponsor:false,dislike:true},calls=[],errors=[];
  const doc={addEventListener:(type,fn)=>handlers[type]=fn};let fail=true;
  startConfiguredFeatures(doc,key=>settings[key],{
    ad:()=>calls.push('ad'),sponsor:()=>calls.push('sponsor'),dislike:()=>{if(fail)throw Error('init');calls.push('dislike');}
  },key=>errors.push(key));
  assert.deepEqual(calls,['ad']);assert.deepEqual(errors,['dislike']);
  settings.sponsor=true;handlers['ytaf-config-changed']({detail:{key:'sponsor'}});
  handlers['ytaf-config-changed']({detail:{key:'sponsor'}});assert.deepEqual(calls,['ad','sponsor']);
  fail=false;handlers['ytaf-config-changed']({detail:{key:'dislike'}});
  handlers['ytaf-config-changed']({detail:{key:'__proto__'}});assert.deepEqual(calls,['ad','sponsor','dislike']);
});
test('the existing settings node is reattached after YouTube replaces its parent',()=>{
  let attached=false;const container={},appended=[];
  const doc={body:{appendChild:node=>{appended.push(node);attached=true;}},documentElement:{contains:()=>attached}};
  ensureSettingsMounted(doc,container);ensureSettingsMounted(doc,container);assert.deepEqual(appended,[container]);
  attached=false;ensureSettingsMounted(doc,container);assert.deepEqual(appended,[container,container]);
});
