import { canUseNumericShortcuts } from './remote-help.mjs';
export const shortcutOptions = [
  ['none', 'No action'],
  ['captions', 'Toggle captions'],
  ['slower', 'Slower playback'],
  ['faster', 'Faster playback'],
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
export function createShortcutHandler(doc, read, perform) {
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
    if (!allowNew || !canUseNumericShortcuts(event, doc, read('enableNumericShortcuts')))
      return false;
    const action = shortcutAction(key, read('numericShortcutActions'));
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
  let selected = '0';
  panel.appendChild(
    choices.add(
      '__shortcut_key',
      'Remote number key',
      selected,
      Array.from({ length: 10 }, (_, i) => ({
        value: String(i),
        label: String(i)
      })),
      (value) => {
        selected = value;
        choices.setValue(
          '__shortcut_action',
          shortcutAction(selected, read('numericShortcutActions'))
        );
      }
    )
  );
  panel.appendChild(
    choices.add(
      '__shortcut_action',
      'Action for selected key',
      shortcutAction(selected, read('numericShortcutActions')),
      shortcutOptions,
      (value) => {
        const old = read('numericShortcutActions');
        write('numericShortcutActions', {
          ...(old && typeof old === 'object' && !Array.isArray(old) ? old : {}),
          [selected]: value
        });
      }
    )
  );
  return panel;
}
