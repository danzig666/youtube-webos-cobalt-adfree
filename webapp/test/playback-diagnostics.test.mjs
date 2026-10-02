import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPlaybackReport, reportPages, copyPlaybackReport } from '../src/playback-diagnostics.mjs';
test('reports have bounded pages and preserve literal text', () => {
  assert.match(readPlaybackReport({}), /updated native/);
  assert.equal(readPlaybackReport({h5vcc:{system:{getYtafMediaReport:()=> 'x'.repeat(70000)}}}).length, 65536);
  const pages = reportPages('<script>not executed</script>\n' + 'word '.repeat(1000));
  assert.ok(pages.length > 1);
  assert.ok(pages.every(p => p.split('\n').length <= 10));
  assert.ok(pages.join('\n').includes('<script>not executed</script>'));
});
test('copy waits for native confirmation and reports unavailable', async () => {
  let requested = 0, polls = 0;
  const win = {setTimeout: fn => fn(), h5vcc: {system: {
    requestYtafMediaReportCopy: () => requested++,
    getYtafMediaReportCopyStatus: () => ++polls < 2 ? 1 : 2
  }}};
  assert.equal(await copyPlaybackReport(win, 'report'), true); assert.equal(requested, 1);
  win.h5vcc.system.getYtafMediaReportCopyStatus = () => 3;
  assert.equal(await copyPlaybackReport(win, 'report'), false);
  assert.equal(await copyPlaybackReport({}, 'report'), false);
});
