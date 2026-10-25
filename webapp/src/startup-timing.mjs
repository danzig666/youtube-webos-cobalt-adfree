const stages = {
  preload: 'Early preload', document: 'YouTube document loaded',
  script: 'Settings script started', settings: 'Settings ready',
  hooks: 'Feature hooks ready', screen: 'First usable screen',
  account: 'Account selection visible', feed: 'Video list visible', video: 'Video ready'
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
    const feed = !selector && bounds?.width > 0 && bounds?.height > 0;
    if (selector) markStartup(win, 'account');
    if (feed) markStartup(win, 'feed');
    if (video?.readyState >= 2) markStartup(win, 'video');
    if ((video?.readyState >= 2) || selector || feed) markStartup(win, 'screen');
    // Account selection is usable, but Home can appear much later. Keep its
    // interval visible instead of mistaking the account screen for completed startup.
    if (feed || video?.readyState >= 2) return;
    if (clock(win) - started < 60000) win.setTimeout(inspect, 500);
  }
  inspect();
}

export function startupSummary(win, nativeReport = '') {
  const time = value => Number.isFinite(value) && value >= 0 ? (value / 1000).toFixed(2) + 's' : null;

  const times = win.__ytafStartupTimings?.times || {};
  const parts = [];
  for (const [label, name] of [['Audio system ready','audio'],['Graphics ready','graphics'],['Font catalog ready','fonts']]) {
    const match = new RegExp('^'+label+': (\\d+) ms$','m').exec(nativeReport);
    if (match) parts.push(name+' '+time(Number(match[1])));
  }
  const key = Number.isFinite(times.feed) ? 'feed' : Number.isFinite(times.video) ? 'video' : 'screen';
  const page = time(times[key]);
  if (page) parts.push('page ' + (key === 'feed' ? 'list' : key) + ' ' + page);
  return 'Startup: ' + (parts.length ? parts.join(' | ') : 'waiting for measurements');
}
