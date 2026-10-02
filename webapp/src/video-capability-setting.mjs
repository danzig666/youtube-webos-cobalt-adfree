const options = [
  { value: 0, label: 'Safe · 1080p SDR (default)' },
  { value: 1, label: '4K · SDR' },
  { value: 2, label: '4K · HDR' }
];
export function readVideoCapabilitySetting(win) {
  try {
    const api = win.h5vcc?.system;
    if (typeof api?.setYtafVideoCapabilitySetting !== 'function') return null;
    const state = JSON.parse(api.getYtafVideoCapabilitySetting());
    if (![state.saved, state.active].every(value => Number.isInteger(value) && value >= 0 && value <= 2) ||
        typeof state.overridden !== 'boolean') return null;
    return state;
  } catch (_) { return null; }
}
export function createVideoCapabilitySetting(doc, win, choices) {
  const panel = doc.createElement('div');
  const status = doc.createElement('div');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'font-size:18px;margin:8px 0;';
  let state = readVideoCapabilitySetting(win);
  if (!state) {
    status.textContent = 'Video quality settings require the updated native app.';
    panel.appendChild(status);
    return panel;
  }
  function describe() {
    const active = options[state.active].label;
    status.textContent = state.overridden
      ? `Active: ${active}. A developer override controls this launch; your selection is saved for launches without that override.`
      : state.saved !== state.active
        ? `Saved. Restart required. Active now: ${active}. Fully close and reopen the app; going to Home may keep it running.`
        : `Active: ${active}.`;
  }
  const control = choices.add('__video_capabilities', 'Video quality', state.saved, options, value => {
    try {
      if (!win.h5vcc.system.setYtafVideoCapabilitySetting(value)) throw Error('save failed');
      state = { ...state, saved: value };
      describe();
      return true;
    } catch (_) {
      status.textContent = 'Could not save video quality. Your previous selection is unchanged. Try again.';
      return false;
    }
  });
  panel.appendChild(control);
  const help = doc.createElement('div');
  help.style.cssText = 'font-size:18px;margin:8px 0;';
  help.textContent = 'Choose 4K or HDR only if your TV supports it. Changes take effect after restarting the app.';
  panel.appendChild(help); panel.appendChild(status);
  describe();
  return panel;
}
