export function canUseNumericShortcuts(event, doc, enabled) {
  if (!enabled || event.type !== 'keydown' || event.repeat ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const body = doc.body;
  if (!body || !(body.classList.contains('WEB_PAGE_TYPE_WATCH') ||
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
  help.textContent = 'GREEN or =: open settings. Arrows: move. OK: change a setting. BACK: close settings. During a video, 0 toggles captions and 1 / 3 request slower / faster playback when numeric shortcuts are enabled. Speed support depends on the TV and native runtime. The sleep timer pauses playback, not the TV. Fully close and reopen the app after changing Video quality.';
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
