const marker = 'ytaf_refresh_home';
const consumedLaunches = new WeakSet();
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
        !['', '#', '#/', '#/browse/FEwhat_to_watch'].includes(url.hash)) return null;
    return url;
  } catch (_) { return null; }
}
export function isHomeScreen(doc, win) {
  if (['WEB_PAGE_TYPE_WATCH', 'WEB_PAGE_TYPE_SHORTS'].some(name => doc.body?.classList?.contains(name))) return false;
  return homeUrl(win) !== null;
}
// Cobalt 23 History only exposes length, and sessionStorage is recreated with
// its Window. Use a harmless URL flag with supported Location.replace/reload.
// Bypass startup routing only once per document; an ordinary webOS relaunch
// still applies the saved startup page. The flag disappears on a fresh launch.
export function consumeHomeRefresh(win) {
  const url = homeUrl(win);
  if (!url || !['1', '2'].includes(queryValue(url, marker)) || consumedLaunches.has(win)) return false;
  consumedLaunches.add(win);
  return true;
}
function guideEntry(doc, id) {
  for (const node of Array.from(doc.querySelectorAll?.('ytlr-guide-entry-renderer') || [])) {
    const props = node.__instance?.props;
    if (props?.data?.navigationEndpoint?.browseEndpoint?.browseId === id && typeof props.onSelect === 'function')
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
export function createHomeRefresh(doc, win, notify, beforeSoftRefresh = () => {}) {
  let pending = false, timer = null;
  function cancel() {
    if (timer !== null) win.clearTimeout?.(timer);
    timer = null; pending = false;
  }
  function later(fn) { timer = win.setTimeout(() => { timer = null; fn(); }, 100); }
  function reload(homeHref = null) {
    // Soft recovery can return from our own temporary browse destination.
    // Its caller has already excluded playback and unrelated navigation.
    if (playerPage(doc) || (!homeHref && !isHomeScreen(doc, win))) { cancel(); return; }
    if (typeof win.location?.replace !== 'function' || typeof win.location?.reload !== 'function') {
      cancel(); notify('Home refresh is unavailable in this runtime.', 2200, 'yellow'); return;
    }
    notify('Reloading YouTube Home…', 1500, 'green');
    try {
      const url = homeHref ? new URL(homeHref) : homeUrl(win);
      // Identical replace URLs with a hash are ignored by Cobalt.
      if (['1', '2'].includes(queryValue(url, marker)) && url.href === win.location.href) win.location.reload();
      else {
        const parts = url.search.slice(1).split('&').filter(part => part && queryPart(part)[0] !== marker);
        // If recovery returns from an away hash, change the query as well:
        // Cobalt otherwise treats it as a hash-only change, not a reload.
        const value = homeHref && queryValue(new URL(win.location.href), marker) === '1' ? '2' : '1';
        parts.push(marker + '=' + value); url.search = '?' + parts.join('&');
        win.location.replace(url.href);
      }
    } catch (_) {
      cancel(); notify('Could not refresh Home. Please try again.', 2200, 'yellow');
    }
  }
  function softRefresh(homeCard, awayId) {
    const homeHref = win.location.href;
    const awayHash = '#/browse/' + awayId;
    const away = guideEntry(doc, awayId);
    try { beforeSoftRefresh(); away.props.onSelect(); }
    catch (_) {
      if (playerPage(doc) || (!isHomeScreen(doc, win) && route(win) !== awayHash)) cancel();
      else reload(homeHref);
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
        : firstCard(doc) !== null;
      if (homeVisible) { cancel(); return; }
      if (++attempts >= 30) { reload(homeHref); return; }
      later(returning);
    }
    function leaving() {
      if (!safe()) return;
      leftByRoute = route(win) === awayHash;
      if (leftByRoute || !visibleCard(doc, homeCard)) {
        awayCard = firstCard(doc);
        // Re-read the guide: navigation may replace its component instances.
        const home = guideEntry(doc, 'FEwhat_to_watch');
        if (!home) { reload(homeHref); return; }
        attempts = 0;
        try { home.props.onSelect(); later(returning); }
        catch (_) { reload(homeHref); }
      } else if (++attempts >= 30) {
        // The callbacks can be exposed but ignored on another TV client.
        // Reload only if we are still on Home; never force another page out.
        reload();
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
    for (let node = event.target; node; node = node.parentElement) if (node.id === '__refresh_home') return;
    cancel();
  }
  win.addEventListener?.('pointerdown', pointer, true);
  win.addEventListener?.('mousedown', pointer, true);
  win.addEventListener?.('pagehide', cancel);
  return () => {
    if (!isHomeScreen(doc, win)) {
      notify('Open YouTube Home to refresh recommendations.', 2200, 'yellow'); return false;
    }
    if (pending) return false;
    pending = true;
    const home = guideEntry(doc, 'FEwhat_to_watch');
    const away = guideEntry(doc, 'FElibrary') || guideEntry(doc, 'FEsubscriptions');
    const card = firstCard(doc);
    // Both guide callbacks and a visible Home card are needed to observe the
    // actual transition. The SDK-independent reload remains the fallback.
    const soft = home && away && card;
    if (!soft && (typeof win.location?.replace !== 'function' || typeof win.location?.reload !== 'function')) {
      cancel(); notify('Home refresh is unavailable in this runtime.', 2200, 'yellow'); return false;
    }
    notify(soft ? 'Refreshing Home without restarting YouTube…' : 'Reloading YouTube Home…', 1500, 'green');
    later(() => {
      if (!pending) return;
      if (!isHomeScreen(doc, win)) { cancel(); return; }
      if (soft) softRefresh(card, away.props.data.navigationEndpoint.browseEndpoint.browseId);
      else reload();
    });
    return true;
  };
}
export function createHomeRefreshButton(doc, refresh) {
  const row = doc.createElement('div'), button = doc.createElement('div');
  button.id = '__refresh_home'; button.tabIndex = 904;
  button.className = 'ytaf-diagnostic-action'; button.dataset.ytafControl = 'action';
  button.setAttribute('role', 'button'); button.textContent = 'Refresh Home recommendations';
  button.__ytafActivate = refresh;
  button.addEventListener('click', () => {
    if (Number(row.dataset.ytafIgnoreClickUntil || 0) <= Date.now()) refresh();
  });
  row.appendChild(button);
  return row;
}
