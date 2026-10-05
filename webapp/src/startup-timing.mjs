const stages = {
  preload: 'Early preload', document: 'YouTube document loaded',
  script: 'Settings script started', settings: 'Settings ready',
  hooks: 'Feature hooks ready', screen: 'First usable screen'
};
function clock(win) {return win.Date?.now?.() ?? Date.now();}
export function markStartup(win, stage) {
  if (!Object.prototype.hasOwnProperty.call(stages, stage)) return;
  const now = clock(win);
  let state = win.__ytafStartupTimings;
  if (!state) state = win.__ytafStartupTimings = {started: now, times: {}};
  if (state.times[stage] === undefined) state.times[stage] = Math.max(0, now - state.started);
}
export function startupReport(win) {
  const state = win.__ytafStartupTimings;
  if (!state) return 'Page startup timings: unavailable';
  return 'Page startup (milliseconds from first instrumentation):\n' +
    Object.keys(stages).map(key => {
      const time = state.times?.[key];
      return `${stages[key]}: ${Number.isFinite(time) && time >= 0 ? Math.round(time) + ' ms' : 'not reached'}`;
    }).join('\n');
}
export function watchStartupScreen(doc, win) {
  if (win.__ytafStartupScreenWatch) return;
  win.__ytafStartupScreenWatch = true;
  const started = clock(win);
  function inspect() {
    const body = doc.body;
    // Record only rendering/state, never the video URL, ID, account or title.
    const video = doc.querySelector('video');
    const cards = doc.querySelector('ytlr-tile-renderer, ytlr-compact-video-renderer, ytlr-video-renderer');
    const selector = body?.classList.contains('WEB_PAGE_TYPE_ACCOUNT_SELECTOR');
    const bounds = cards?.getBoundingClientRect?.();
    if ((video?.readyState >= 2) || selector || (bounds?.width > 0 && bounds?.height > 0)) {
      markStartup(win, 'screen'); return;
    }
    if (clock(win) - started < 60000) win.setTimeout(inspect, 500);
  }
  inspect();
}
