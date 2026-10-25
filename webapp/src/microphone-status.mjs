// Display only bounded microphone status fields, never recordings or transcripts.
export function microphoneStatusReport(report) {
  const match =
    /^Magic Remote microphone: (Not started|Opening|Recording|Unavailable|Stopped)$/m.exec(
      report
    );
  if (!match) return 'Microphone status requires the updated native runtime.';
  const lines = ['Microphone: ' + match[1]];
  const detail = /^Microphone detail: ([A-Za-z0-9 :(),./_-]{1,120})$/m.exec(
    report
  );
  const audio =
    /^Microphone audio bytes: ([0-9]{1,10}); non-silent: (yes|no)$/m.exec(
      report
    );
  if (detail) lines.push(detail[1]);
  if (audio)
    lines.push(
      'Audio received: ' + audio[1] + ' bytes; non-silent: ' + audio[2]
    );
  return lines.join('\n');
}
