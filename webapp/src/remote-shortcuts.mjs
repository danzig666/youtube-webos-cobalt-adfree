import { isHomeScreen } from './home-refresh.mjs';
import { canUseNumericShortcuts } from './remote-help.mjs';
export const shortcutOptions = [
  ['none', 'No action'],
  ['refresh_home', 'Refresh Home — no automatic reload'],
  ['reload_home', 'Reload YouTube Home — shows startup logo'],
  ['captions', 'Toggle captions'],
  ['slower', 'Slower playback'],
  ['faster', 'Faster playback'],
  ['reset_speed', 'Reset playback speed to 1×'],
  ['end_stop', 'Stop after video / Continue'],
  ['cancel_timer', 'Cancel sleep timer'],
  ['skip', 'Skip current SponsorBlock segment']
].map(([value, label]) => ({ value, label }));
export function shortcutAction(key, mapping) {
  const value =
    mapping && typeof mapping === 'object' && !Array.isArray(mapping)
      ? mapping[key]
      : null;
  return shortcutOptions.some((option) => option.value === value)
    ? value
    : { 0: 'captions', 1: 'slower', 3: 'faster' }[key] || 'none';
}
export function createShortcutHandler(doc, read, perform, win = doc.defaultView) {
  const held = new Set();
  const handler = (event, allowNew = true) => {
    const code = event.keyCode || event.which;
    const key = /^\d$/.test(event.key || '')
      ? event.key
      : /^(Digit|Numpad)\d$/.test(event.code || '')
        ? event.code.slice(-1)
        : code >= 48 && code <= 57
          ? String(code - 48)
          : code >= 96 && code <= 105
            ? String(code - 96)
            : null;
    if (key === null) return false;
    if (held.has(key)) {
      if (event.type === 'keyup') held.delete(key);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    const action = shortcutAction(key, read('numericShortcutActions'));
    const homeAction = action === 'refresh_home' || action === 'reload_home';
    const homeRefresh = homeAction && isHomeScreen(doc, win);
    if (homeAction && !homeRefresh) return false;
    if (!allowNew || !canUseNumericShortcuts(event, doc, read('enableNumericShortcuts'), homeRefresh))
      return false;
    if (action === 'none') return false;
    held.add(key);
    event.preventDefault();
    event.stopPropagation();
    perform(action);
    return true;
  };
  handler.reset = () => held.clear();
  return handler;
}
export function createShortcutSettings(doc, choices, read, write) {
  const panel = doc.createElement('div');
  for (let key = 0; key <= 9; key++) {
    const number = String(key);
    panel.appendChild(choices.add('__shortcut_' + number, 'Key ' + number,
      shortcutAction(number, read('numericShortcutActions')), shortcutOptions, value => {
        const old = read('numericShortcutActions');
        write('numericShortcutActions', {
          ...(old && typeof old === 'object' && !Array.isArray(old) ? old : {}),
          [number]: value
        });
      }));
  }
  return panel;
}
