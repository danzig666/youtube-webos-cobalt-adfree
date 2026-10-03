const refreshStates = new WeakMap();
// FEtopics is Home in the project's captured guide fixture and TizenTube's
// current TV navigation. Retain the older Home endpoint for older clients.
const homeBrowseIds = ['FEtopics', 'FEwhat_to_watch'];
// Cobalt 23 URLUtils exposes .search but has no .searchParams attribute.
// Keep this independent of URLSearchParams/polyfills supplied by YouTube.
function queryPart(part) {
  const split = part.indexOf('=');
  try {
    return [decodeURIComponent((split < 0 ? part : part.slice(0, split)).replace(/\+/g, ' ')),
      decodeURIComponent((split < 0 ? '' : part.slice(split + 1)).replace(/\+/g, ' '))];
  } catch (_) { return [null, null]; }
}
function queryValue(url, name) {
  for (const part of url.search.slice(1).split('&')) {
    const [key, value] = queryPart(part);
    if (key === name) return value;
  }
  return null;
}

function homeUrl(win) {
  try {
    const url = new URL(win.location.href);
    if (url.origin !== 'https://www.youtube.com' || !/^\/tv\/?$/.test(url.pathname) ||
        queryValue(url, 'v') !== null || queryValue(url, 'vq') !== null ||
        !['', '#', '#/', ...homeBrowseIds.map(id => '#/browse/' + id)].includes(url.hash)) return null;
    return url;
  } catch (_) { return null; }
}
export function isHomeScreen(doc, win) {
  if (['WEB_PAGE_TYPE_WATCH', 'WEB_PAGE_TYPE_SHORTS'].some(name => doc.body?.classList?.contains(name))) return false;
  return homeUrl(win) !== null;
}
function guideEntry(doc, id) {
  const ids = id === 'home' ? homeBrowseIds : [id];
  for (const node of Array.from(doc.querySelectorAll?.('ytlr-guide-entry-renderer') || [])) {
    const props = node.__instance?.props;
    if (ids.includes(props?.data?.navigationEndpoint?.browseEndpoint?.browseId) && typeof props.onSelect === 'function')
      return {node, props};
  }
  return null;
}
function visibleCard(doc, node) {
  if (!node || !doc.documentElement?.contains(node)) return false;
  const rects = node.getClientRects?.();
  return !rects || rects.length > 0;
}
function firstCard(doc) {
  return Array.from(doc.querySelectorAll?.('ytlr-tile-renderer, ytlr-grid-video-renderer') || [])
    .find(node => visibleCard(doc, node)) || null;
}
function route(win) {
  try { return new URL(win.location.href).hash; } catch (_) { return null; }
}
function playerPage(doc) {
  return ['WEB_PAGE_TYPE_WATCH', 'WEB_PAGE_TYPE_SHORTS'].some(name => doc.body?.classList?.contains(name));
}
function softReloadTarget(doc, win) {
  const root = doc.querySelector?.('ytlr-app') || doc.body;
  return typeof win.CustomEvent === 'function' && typeof root?.dispatchEvent === 'function' ? root : null;
}
// Command/event shape from NicholasBly/youtube-webos refreshPageLogic (GPL-3.0):
// https://github.com/NicholasBly/youtube-webos/blob/78a374a32774b92a2094e1cda8db4da0d83540d4/src/ui.js#L1067
// Ask YouTube to refresh its page in place; never send RELOAD_PAGE here.
function softReloadEvent(win) {
  return new win.CustomEvent('innertube-command', {
    bubbles: true, cancelable: false, composed: true,
    detail: {
      clickTrackingParams: '',
      signalServiceEndpoint: {
        signal: 'CLIENT_SIGNAL',
        actions: [{
          clickTrackingParams: '',
          signalAction: {signal: 'SOFT_RELOAD_PAGE'},
          commandMetadata: {webCommandMetadata: {clientAction: true}}
        }]
      }
    }
  });
}
// Only fixed statuses and counts are reported. Never serialize guide props,
// titles, account information or the current URL into diagnostics.
export function homeRefreshReport(doc, win) {
  const guides = Array.from(doc.querySelectorAll?.('ytlr-guide-entry-renderer') || []);
  const state = refreshStates.get(doc);
  return ['Home refresh:',
    `Last action: ${state?.mode || 'none'} / ${state?.status || 'not-requested'}`,
    `Soft refresh event support: ${Boolean(softReloadTarget(doc, win))}`,
    `On Home: ${isHomeScreen(doc, win)}; guide renderers: ${guides.length}`,
    `Callbacks: Home ${Boolean(guideEntry(doc, 'home'))}, Library ${Boolean(guideEntry(doc, 'FElibrary'))}, Subscriptions ${Boolean(guideEntry(doc, 'FEsubscriptions'))}`,
    `Visible video card: ${Boolean(firstCard(doc))}`
  ].join('\n');
}
export function createHomeRefresh(doc, win, notify, beforeSoftRefresh = () => {}) {
  let pending = false, timer = null, epoch = 0;
  function state(status) { refreshStates.set(doc, {mode: 'light', status}); }
  function cancel(status = 'cancelled') {
    if (timer !== null) win.clearTimeout?.(timer);
    if (pending) state(status);
    epoch++;
    timer = null; pending = false;
  }
  function later(fn) {
    const request = epoch;
    timer = win.setTimeout(() => {
      if (!pending || request !== epoch) return;
      timer = null; fn();
    }, 100);
  }
  function fail(status, message) {
    cancel(status); notify(message, 4000, 'yellow');
  }
  function softRefresh(homeCard, awayId) {
    const awayHash = '#/browse/' + awayId;
    const away = guideEntry(doc, awayId);
    if (!away) { fail('away-hook-lost', 'Light refresh: sidebar controls disappeared. Open the YouTube sidebar and try again.'); return; }
    state('leaving-home');
    try { beforeSoftRefresh(); away.props.onSelect(); }
    catch (_) {
      if (playerPage(doc) || (!isHomeScreen(doc, win) && route(win) !== awayHash)) cancel();
      else fail('away-callback-failed', 'Light refresh: YouTube could not open the other page. No reload requested.');
      return;
    }
    let attempts = 0, awayCard = null, leftByRoute = false;
    function safe() {
      if (!pending || playerPage(doc)) { cancel(); return false; }
      const hash = route(win);
      if (!isHomeScreen(doc, win) && hash !== awayHash) { cancel(); return false; }
      return true;
    }
    function returning() {
      if (!safe()) return;
      // If URL routing is available, wait for Home. Otherwise wait for the
      // away page's cards to leave; Cobalt clients can keep a constant URL.
      const homeVisible = leftByRoute ? isHomeScreen(doc, win)
        : awayCard ? !visibleCard(doc, awayCard) && firstCard(doc) !== null
        : false;
      if (homeVisible) { cancel('returned-home'); return; }
      if (++attempts >= 30) {
        fail('home-return-timeout', 'Light refresh could not confirm the return. Select Home in YouTube’s sidebar.'); return;
      }
      later(returning);
    }
    function leaving() {
      if (!safe()) return;
      leftByRoute = route(win) === awayHash;
      if (leftByRoute || (homeCard && !visibleCard(doc, homeCard))) {
        awayCard = firstCard(doc);
        // Re-read the guide: navigation may replace its component instances.
        const home = guideEntry(doc, 'home');
        if (!home) { fail('home-hook-lost', 'Light refresh: Home control disappeared. Select Home in YouTube’s sidebar.'); return; }
        attempts = 0;
        state('returning-home');
        try { home.props.onSelect(); later(returning); }
        catch (_) { fail('home-callback-failed', 'Light refresh could not return. Select Home in YouTube’s sidebar.'); }
      } else if (++attempts >= 30) {
        fail('departure-timeout', 'Light refresh: no page change detected. No reload requested.');
      } else later(leaving);
    }
    later(leaving);
  }
  // Respect navigation initiated while the round trip is in flight. Do not
  // react to keyup or trailing clicks from the button's original activation.
  win.addEventListener?.('keydown', event => {
    if (pending && ([37,38,39,40,461,8,27,404].includes(event.keyCode || event.which) ||
      ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape','='].includes(event.key))) cancel();
  }, true);
  function pointer(event) {
    if (!pending) return;
    for (let node = event.target; node; node = node.parentElement)
      if (node.id === '__refresh_home') return;
    cancel();
  }
  win.addEventListener?.('pointerdown', pointer, true);
  win.addEventListener?.('mousedown', pointer, true);
  win.addEventListener?.('pagehide', () => cancel('document-left'));
  function request() {
    if (pending) return false;
    if (!isHomeScreen(doc, win)) {
      state('not-home');
      notify('Open YouTube Home to refresh recommendations.', 2200, 'yellow'); return false;
    }
    if (softReloadTarget(doc, win)) {
      pending = true; state('soft-command-pending');
      notify('Refreshing YouTube Home…', 2000, 'green');
      later(() => {
        if (!isHomeScreen(doc, win)) { cancel(); return; }
        try {
          beforeSoftRefresh();
          const target = softReloadTarget(doc, win);
          if (!target) { fail('soft-target-lost', 'Home refresh: YouTube’s event target disappeared. Please try again.'); return; }
          target.dispatchEvent(softReloadEvent(win));
          // dispatchEvent is not an acknowledgement from YouTube. Report
          // only that the command was sent, not that new cards were fetched.
          cancel('soft-command-sent');
        } catch (_) { fail('soft-command-failed', 'Home refresh command failed. No reload requested.'); }
      });
      return true;
    }
    const home = guideEntry(doc, 'home');
    const away = guideEntry(doc, 'FElibrary') || guideEntry(doc, 'FEsubscriptions');
    const card = firstCard(doc);
    if (!home || !away) {
      state(!home ? 'home-hook-unavailable' : 'away-hook-unavailable');
      notify(!home ? 'Light refresh: Home control unavailable. Open YouTube’s sidebar and try again.'
        : 'Light refresh: Library/Subscriptions controls unavailable. Open YouTube’s sidebar and try again.', 4000, 'yellow');
      return false;
    }
    // Cards need not exist on route-changing clients. If neither route nor
    // card changes can be observed, time out visibly instead of restarting.
    pending = true; state('light-pending');
    notify('Trying a Home sidebar refresh…', 2000, 'green');
    later(() => {
      if (!isHomeScreen(doc, win)) { cancel(); return; }
      softRefresh(card, away.props.data.navigationEndpoint.browseEndpoint.browseId);
    });
    return true;
  }
  return request;
}
function actionButton(doc, activate, id, label, tabIndex) {
  const row = doc.createElement('div'), button = doc.createElement('div');
  button.id = id; button.tabIndex = tabIndex;
  button.className = 'ytaf-diagnostic-action'; button.dataset.ytafControl = 'action';
  button.setAttribute('role', 'button'); button.textContent = label;
  button.__ytafActivate = activate;
  button.addEventListener('click', () => {
    if (Number(row.dataset.ytafIgnoreClickUntil || 0) <= Date.now()) activate();
  });
  row.appendChild(button);
  return row;
}
export function createHomeRefreshButton(doc, refresh) {
  return actionButton(doc, refresh, '__refresh_home', 'Refresh Home recommendations', 904);
}
