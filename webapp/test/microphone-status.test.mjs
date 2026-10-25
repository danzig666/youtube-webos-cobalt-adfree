import test from 'node:test';
import assert from 'node:assert/strict';
import {microphoneStatusReport} from '../src/microphone-status.mjs';

test('microphone status shows a bounded operation/code and audio counters without copying other native report data', () => {
  const report =
    'Magic Remote microphone: Unavailable\nMicrophone detail: LG rejected microphone recording (code 6020)\nMicrophone audio bytes: 0; non-silent: no\nSecret account: private\n';
  assert.match(
    microphoneStatusReport(report),
    /LG rejected microphone recording \(code 6020\)/
  );
  assert.match(microphoneStatusReport(report), /Audio received: 0 bytes/);
  assert.doesNotMatch(microphoneStatusReport(report), /private|Secret/);
  assert.doesNotMatch(
    microphoneStatusReport(
      'Magic Remote microphone: Unavailable\nMicrophone detail: https:\/\/private?token=secret\n'
    ),
    /secret|private/
  );
});
