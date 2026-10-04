import { createCapabilityTest } from './capability-test.mjs';
import { homeRefreshReport } from './home-refresh.mjs';
function clockReport(win) {
  try {
    const clock=win.__ytafCornerClock, details=clock?.report?.();
    if (!details) return `Clock: ${clock?.status || 'not initialized'}`;
    return [`Clock: ${details.mode} / ${details.status}; mounted: ${Boolean(details.mounted)}; observer: ${details.observer}`,
      details.mounted ? `Clock display: ${details.display || 'unknown'} / ${details.visibility || 'unknown'}; bounds: ${details.bounds || 'unavailable'}; layer: ${details.zIndex || 'unknown'}` : 'Clock display: not mounted'].join('\n');
  } catch (_) { return 'Clock: diagnostic status unavailable'; }
}
export function readPlaybackReport(win) {
  try {
    const report = win.h5vcc?.system?.getYtafMediaReport?.();
    if (typeof report === 'string') return report.slice(0, 65536);
  } catch (_) { /* unavailable on older runtimes */ }
  return 'Playback diagnostics require the updated native Cobalt runtime.';
}
function healthReport(win) {
  try {
    const health = win.__ytafPlaybackHealth?.report?.();
    const controls = win.__ytafPlaybackControls?.report?.();
    if (!health) return 'Script health: unavailable';
    return [`Script health: foreground ${Boolean(health.foreground)}; keys ${health.keys}; errors ${health.errors}`,
      `Playback updates: ${health.updates}; last event ${health.updateAge}; last advancing position ${health.progressAge}`,
      `Script timer delay: maximum ${health.maxDelay}ms; stalls ${health.stalls}`,
      `Controls recovery: ${controls?.attempts || 0} reveal attempts; pending ${Boolean(controls?.pending)}`].join('\n');
  } catch (_) { return 'Script health: unavailable'; }
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
    `Resume: ${win.__ytafResume?.status || 'not initialized'}`,
    `Local fallback: ${win.__ytafResume?.localStatus || 'not initialized'}`,
    clockReport(win),
    `Thumbnail progress: ${win.__ytafThumbnailProgress?.status || 'not initialized'}`,
    healthReport(win),
    `Settings initialized: ${Boolean(win.__ytafUiInitialized)}`,
    `SponsorBlock: ${sponsor ? statuses.includes(sponsor.fetchStatus)?sponsor.fetchStatus:'unknown' : 'not initialized'}`,
    `SponsorBlock segments: ${Array.isArray(sponsor?.segments)?sponsor.segments.length:0}; retries: ${number(sponsor?.fetchRetries)}`,
    `SponsorBlock media binding: ${Boolean(video && sponsor?.video===video)}; poll active: ${Boolean(sponsor?.skipPollInterval)}`,
    `SponsorBlock poll: last ${Number.isFinite(sponsor?.lastPollAt) ? Math.round(Math.max(0,(win.Date?.now?.() ?? Date.now()) - sponsor.lastPollAt)/1000)+'s ago' : 'unavailable'}; errors ${number(sponsor?.pollErrors)}; media replacements ${number(sponsor?.mediaRebinds)}`,
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
  const actionRow = doc.createElement('div');
  const button = doc.createElement('div');
  button.id = '__run_capability_test'; button.tabIndex = 990;
  button.className = 'ytaf-diagnostic-action'; button.dataset.ytafControl = 'action';
  button.setAttribute('role','button'); button.textContent = 'Run capability test';
  const test = createCapabilityTest(doc,win,refresh);
  button.__ytafActivate = () => test.run();
  button.addEventListener('click', () => {
    if (Number(actionRow.dataset.ytafIgnoreClickUntil || 0) <= Date.now()) test.run();
  });
  actionRow.appendChild(button);
  function refresh() {
    button.setAttribute('aria-disabled',String(test.running()));
    output.textContent = ((test.report() ? test.report()+'\n\n' : '')+frontendPlaybackReport(doc,win)+'\n\n'+homeRefreshReport(doc,win)+'\n\n'+readPlaybackReport(win)).slice(0,65536); }
  doc.addEventListener('ytaf-diagnostics-opened', refresh);
  panel.appendChild(actionRow); panel.appendChild(hint); panel.appendChild(output); refresh();
  return panel;
}
