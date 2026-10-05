import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/adblock-main.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replaceAll('export async function ', 'async function ');
test('relaunch and global error logging omit launch URLs, reasons, messages and stacks', async () => {
  const secret = 'PRIVATE_SENTINEL_SIGNED_URL_TOKEN', logs = [], handlers = new Map();
  const log = (...values) => logs.push(values);
  let now = 1000, relaunched;
  const context = vm.createContext({Date: {now: () => now}, console: {info: log, warn: log, error: log},
    window: {launchParams: {url: secret}, addEventListener: (name, fn) => handlers.set(name, fn)},
    document: {addEventListener: (name, fn) => handlers.set(name, fn)},
    markStartup() {}, watchStartupScreen() {}, resetAutoLogin() {}, handleRelaunch: detail => {relaunched = detail;}, handleInitialLaunch() {throw new Error(secret);},
    userScriptStartUI() {throw new Error(secret);}, configRead() {}, startConfiguredFeatures() {throw new Error(secret);},
    userScriptStartAdBlock() {}, userScriptStartSponsorBlock() {}, userScriptStartReturnYouTubeDislike() {}});
  vm.runInContext(source, context);
  const detail = {url: secret}; handlers.get('webOSRelaunch')({detail});
  assert.equal(relaunched, detail, 'private launch information still reaches the relaunch handler');
  handlers.get('error')({message: secret, filename: secret, error: {name: 'TypeError', message: secret, stack: secret}});
  handlers.get('unhandledrejection')({reason: {name: secret, message: secret, stack: secret}});
  handlers.get('unhandledrejection')({reason: secret});
  assert.equal(JSON.stringify(logs).includes(secret), false);
  assert.equal(logs.some(args => String(args[0]).includes('TypeError')), true);
  for (let i = 0; i < 100; i++) handlers.get('error')({error: new Error(secret)});
  assert.equal(logs.filter(args => /Global error|Unhandled promise/.test(args[0])).length, 8);
  now += 60001; handlers.get('error')({error: new Error(secret)});
  assert.equal(logs.filter(args => /Global error|Unhandled promise/.test(args[0])).length, 9);
});

test('launch routing preserves pairing data without writing it to logs', () => {
  const secret = 'PRIVATE_PAIRING_SENTINEL', logs = [];
  const launchSource = fs.readFileSync(new URL('../src/utils.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
  const context = vm.createContext({URL, URLSearchParams, configRead: () => 'home',
    window: {location: {href: ''}}, console: {info: (...args) => logs.push(args)}});
  vm.runInContext(launchSource, context);
  vm.runInContext(`handleLaunch({contentTarget: 'pairingCode=${secret}&theme=cl'})`, context);
  assert.equal(context.window.location.href.includes(secret), true);
  assert.equal(JSON.stringify(logs).includes(secret), false);
});
