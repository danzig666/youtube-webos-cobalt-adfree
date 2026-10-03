export function readPlaybackReport(win) {
  try {
    const report = win.h5vcc?.system?.getYtafMediaReport?.();
    if (typeof report === 'string') return report.slice(0, 65536);
  } catch (_) { /* unavailable on older runtimes */ }
  return 'Playback diagnostics require the updated native Cobalt runtime.';
}
export function frontendPlaybackReport(doc,win) {
  const video=doc.querySelector('video'), sponsor=win.sponsorblock;
  const number=value=>Number.isFinite(value)?Math.round(value*100)/100:'unknown';
  const attached=Boolean(video && doc.documentElement?.contains(video));
  const statuses=['idle','disabled','fetching','segments-loaded','no-segments','fetch-error','channel-excluded','waiting-for-channel'];
  return ['App playback state:',
    `Video element: ${video?'present':'absent'} / ${attached?'attached':'detached'}`,
    video ? `Media: ready ${number(video.readyState)} paused ${Boolean(video.paused)} seeking ${Boolean(video.seeking)} ended ${Boolean(video.ended)}` : 'Media: unavailable',
    video ? `Position: ${number(video.currentTime)} / ${number(video.duration)} seconds` : 'Position: unavailable',
    `Settings initialized: ${Boolean(win.__ytafUiInitialized)}`,
    `SponsorBlock: ${sponsor ? statuses.includes(sponsor.fetchStatus)?sponsor.fetchStatus:'unknown' : 'not initialized'}`,
    `SponsorBlock segments: ${Array.isArray(sponsor?.segments)?sponsor.segments.length:0}; retries: ${number(sponsor?.fetchRetries)}`,
    `SponsorBlock media binding: ${Boolean(video && sponsor?.video===video)}; poll active: ${Boolean(sponsor?.skipPollInterval)}`,
    `SponsorBlock HTTP status: ${Number.isFinite(sponsor?.lastStatus)?sponsor.lastStatus:'unavailable'}`
  ].join('\n');
}
export function createPlaybackDiagnostics(doc, win) {
  const panel = doc.createElement('div'); panel.className = 'ytaf-playback-diagnostics';
  const hint = doc.createElement('div'); hint.className = 'ytaf-setting-help';
  hint.textContent = 'Scroll with the wheel or ↑ ↓ to read the full report. ← returns to categories.';
  const output = doc.createElement('div');
  output.id = '__diagnostics_report'; output.tabIndex = 1000;
  output.className = 'ytaf-diagnostics-report'; output.dataset.ytafControl = 'reader';
  output.setAttribute('role', 'textbox'); output.setAttribute('aria-readonly', 'true');
  output.setAttribute('aria-multiline', 'true'); output.setAttribute('aria-label', 'Playback diagnostics');
  function refresh() { output.textContent = (frontendPlaybackReport(doc,win)+'\n\n'+readPlaybackReport(win)).slice(0,65536); }
  doc.addEventListener('ytaf-diagnostics-opened', refresh);
  panel.appendChild(hint); panel.appendChild(output); refresh();
  return panel;
}
