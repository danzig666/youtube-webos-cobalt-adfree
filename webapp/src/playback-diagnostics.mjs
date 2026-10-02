export function readPlaybackReport(win) {
  try {
    const report = win.h5vcc?.system?.getYtafMediaReport?.();
    if (typeof report === 'string') return report.slice(0, 65536);
  } catch (_) { /* unavailable on older runtimes */ }
  return 'Playback diagnostics require the updated native Cobalt runtime.';
}
export function reportPages(report, linesPerPage = 8) {
  const lines = report.slice(0, 65536).split('\n');
  const pages = [];
  // Split long structured events into readable lines without interpreting HTML.
  const wrapped = [];
  lines.forEach((line) => {
    if (!line) { wrapped.push(''); return; }
    while (line.length > 68) {
      let end = line.lastIndexOf(' ', 68);
      if (end < 1) end = 68;
      wrapped.push(line.slice(0, end));
      line = line.slice(end).trimStart();
    }
    wrapped.push(line);
  });
  for (let i = 0; i < wrapped.length; i += linesPerPage) pages.push(wrapped.slice(i, i + linesPerPage).join('\n'));
  return pages.length ? pages : [''];
}
export async function copyPlaybackReport(win, report) {
  const api = win.h5vcc?.system;
  if (api?.requestYtafMediaReportCopy && api?.getYtafMediaReportCopyStatus) {
    api.requestYtafMediaReportCopy();
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => win.setTimeout(resolve, 100));
      const status = api.getYtafMediaReportCopyStatus();
      if (status === 2) return true;
      if (status === 3 || status === 0) return false;
    }
    return false;
  }
  if (win.navigator?.clipboard?.writeText) {
    try { await win.navigator.clipboard.writeText(report); return true; } catch (_) { return false; }
  }
  return false;
}
// Use the existing menu's focus/activation handler; no document-wide listeners.
export function createPlaybackDiagnostics(doc, win) {
  const panel = doc.createElement('div');
  panel.className = 'ytaf-playback-diagnostics';
  const title = doc.createElement('h2'); title.textContent = 'Diagnostics'; title.style.cssText = 'font-size:26px;margin:8px 0;'; panel.appendChild(title);
  const output = doc.createElement('pre');
  output.style.cssText = 'display:none;white-space:pre-wrap;font-size:16px;line-height:1.3;word-wrap:break-word;margin:8px 0;';
  const status = doc.createElement('div'); status.setAttribute('aria-live', 'polite');
  // The menu scrolls focused rows into view. Put report text before those rows
  // so focusing the page controls also brings the report into the viewport.
  panel.appendChild(output); panel.appendChild(status);
  let report = '', pages = [''], page = 0, opened = false;
  function render() {
    output.style.display = opened ? 'block' : 'none';
    output.textContent = opened ? pages[page] : '';
    status.textContent = opened ? `Report page ${page + 1} of ${pages.length}` : '';
  }
  function action(id, label, handler) {
    const row = doc.createElement('div');
    const button = doc.createElement('div');
    button.id = id; button.tabIndex = 1000 + panel.children.length;
    button.textContent = label; button.setAttribute('role', 'button');
    button.dataset.ytafControl = 'action'; button.className = 'ytaf-diagnostic-action';
    button.addEventListener('click', () => {
      if (Number(row.dataset.ytafIgnoreClickUntil || 0) > Date.now()) return;
      handler();
    });
    button.__ytafActivate = handler;
    row.appendChild(button); panel.appendChild(row);
  }
  action('__diagnostics_refresh', 'Show / refresh playback report', () => {
    report = readPlaybackReport(win); pages = reportPages(report); page = 0; opened = true; render();
  });
  action('__diagnostics_previous', 'Previous report page', () => { page = Math.max(0, page - 1); render(); });
  action('__diagnostics_next', 'Next report page', () => { page = Math.min(pages.length - 1, page + 1); render(); });
  action('__diagnostics_copy', 'Copy diagnostic report', async () => {
    status.textContent = 'Copying report…';
    try {
      report = readPlaybackReport(win);
      status.textContent = await copyPlaybackReport(win, report)
        ? 'Report copied.' : 'Clipboard unavailable. View the report.';
    } catch (_) { status.textContent = 'Clipboard unavailable. View the report.'; }
  });
  return panel;
}
