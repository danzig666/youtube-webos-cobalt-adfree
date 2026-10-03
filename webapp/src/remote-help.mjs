export function canUseNumericShortcuts(event, doc, enabled, homeRefresh = false) {
  if (!enabled || event.type !== 'keydown' || event.repeat ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const body = doc.body;
  if (!body || !(homeRefresh || body.classList.contains('WEB_PAGE_TYPE_WATCH') ||
                body.classList.contains('WEB_PAGE_TYPE_SHORTS'))) return false;
  function editing(target) {
    for (let node = target; node; node = node.parentElement) {
      const tag = (node.tagName || '').toUpperCase();
      const role = node.getAttribute?.('role');
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || node.isContentEditable ||
          ['textbox', 'searchbox', 'combobox', 'spinbutton'].includes(role)) return true;
    }
    return false;
  }
  return !editing(event.target) && !editing(doc.activeElement);
}

export function createRemoteHelp(doc) {
  const panel = doc.createElement('div');
  const help = doc.createElement('div');
  help.className = 'ytaf-setting-help'; help.style.display = 'none';
  help.textContent = 'GREEN or =: open settings. Wheel: scroll settings and option lists. Arrows: move. OK: open an option list or toggle a setting. Left/Right seeking can apply immediately or after a short pause; choose this under Playback. BACK: close settings. Number keys are customizable below Numeric playback shortcuts. Defaults: 0 captions, 1 slower, 3 faster. Assign Refresh Home recommendations to ask YouTube to refresh in place. The soft command does not require opening the sidebar. Older runtimes can use a sidebar round trip; failures report a reason instead of requesting a reload. Home refresh works only on Home, never during playback. Stop after this video holds autoplay paused until Continue playback is selected. Speed support depends on the TV and native runtime. The sleep timer pauses playback, not the TV. Fully close and reopen the app after changing Video quality.';
  const row = doc.createElement('div');
  const button = doc.createElement('div');
  button.id = '__remote_help'; button.tabIndex = 901;
  button.dataset.ytafControl = 'action'; button.className = 'ytaf-diagnostic-action';
  button.setAttribute('role', 'button'); button.setAttribute('aria-expanded', 'false');
  button.textContent = 'Show remote help';
  let opened = false;
  button.__ytafActivate = () => {
    opened = !opened;
    help.style.display = opened ? 'block' : 'none';
    button.textContent = opened ? 'Hide remote help' : 'Show remote help';
    button.setAttribute('aria-expanded', String(opened));
  };
  button.addEventListener('click', () => {
    if (Number(row.dataset.ytafIgnoreClickUntil || 0) > Date.now()) return;
    button.__ytafActivate();
  });
  panel.appendChild(help); row.appendChild(button); panel.appendChild(row);
  return panel;
}
