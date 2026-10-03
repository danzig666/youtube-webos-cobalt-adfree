export function readPlaybackReport(win) {
  try {
    const report = win.h5vcc?.system?.getYtafMediaReport?.();
    if (typeof report === 'string') return report.slice(0, 65536);
  } catch (_) { /* unavailable on older runtimes */ }
  return 'Playback diagnostics require the updated native Cobalt runtime.';
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
  function refresh() { output.textContent = readPlaybackReport(win); }
  doc.addEventListener('ytaf-diagnostics-opened', refresh);
  panel.appendChild(hint); panel.appendChild(output); refresh();
  return panel;
}
