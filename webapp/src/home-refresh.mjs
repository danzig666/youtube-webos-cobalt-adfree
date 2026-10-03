const marker = 'ytaf_refresh_home';
const consumedLaunches = new WeakSet();
function homeUrl(win) {
  try {
    const url = new URL(win.location.href);
    if (url.origin !== 'https://www.youtube.com' || !/^\/tv\/?$/.test(url.pathname) ||
        url.searchParams.has('v') || url.searchParams.has('vq') ||
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
  if (!url || url.searchParams.get(marker) !== '1' || consumedLaunches.has(win)) return false;
  consumedLaunches.add(win);
  return true;
}
export function createHomeRefresh(doc, win, notify) {
  let pending = false;
  return () => {
    if (!isHomeScreen(doc, win)) {
      notify('Open YouTube Home to refresh recommendations.', 2200, 'yellow');
      return false;
    }
    if (pending) return false;
    if (typeof win.location?.replace !== 'function' || typeof win.location?.reload !== 'function') {
      notify('Home refresh is unavailable in this runtime.', 2200, 'yellow');
      return false;
    }
    pending = true;
    notify('Refreshing Home recommendations…', 1500, 'green');
    win.setTimeout(() => {
      // Navigation during the brief notification must not reload a video.
      if (!isHomeScreen(doc, win)) { pending = false; return; }
      try {
        const url = homeUrl(win);
        // Changing a query forces a full Cobalt navigation. Repeating the
        // same URL with a hash would be ignored by Location.replace.
        if (url.searchParams.get(marker) === '1') win.location.reload();
        else { url.searchParams.set(marker, '1'); win.location.replace(url.href); }
      } catch (_) {
        pending = false;
        notify('Could not refresh Home. Please try again.', 2200, 'yellow');
      }
    }, 100);
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
