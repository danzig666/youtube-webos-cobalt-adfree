// Native CSS values and simple block layout keep this usable on Cobalt 23.
export const settingsSections = [
  ['general', 'General', 'Your everyday preferences'],
  ['playback', 'Playback', 'Picture quality and playback controls'],
  ['captions', 'Captions & titles', 'Choose how words appear on screen'],
  ['remote', 'Remote', 'Make the remote work your way'],
  ['sponsorblock', 'SponsorBlock', 'Choose what to skip and what to keep'],
  ['diagnostics', 'Diagnostics', 'Playback information and troubleshooting']
];
export function settingsSectionFor(node) {
  if (settingsSections.some(([key]) => key === node.dataset?.ytafSection))
    return node.dataset.ytafSection;
  if (node.className === 'ytaf-playback-diagnostics') return 'diagnostics';
  for (const [section, ids] of [
    [
      'playback',
      ['__video_capabilities', '__sleep_timer', '__stop_after_video']
    ],
    ['captions', ['__captionMode', '__dearrow_mode']],
    ['remote', ['__numeric_shortcuts', '__shortcut_0', '__remote_help']],
    [
      'sponsorblock',
      [
        '__sponsorblock',
        '__sponsorblock_sponsor',
        '__sponsorblock_channel_toggle'
      ]
    ]
  ]) {
    if (ids.some((id) => node.querySelector('#' + id))) return section;
  }
  return 'general';
}
export function createSettingsSections(doc, nodes, onSelect) {
  const nav = doc.createElement('div'),
    content = doc.createElement('div');
  nav.className = 'ytaf-settings-nav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Settings categories');
  content.className = 'ytaf-ui-content';
  const panes = {},
    buttons = {};
  let current = 'general';
  function select(key) {
    if (!panes[key]) return;
    current = key;
    for (const [id] of settingsSections) {
      panes[id].style.display = id === key ? 'block' : 'none';
      buttons[id].setAttribute('aria-pressed', String(id === key));
      buttons[id].className =
        'ytaf-settings-tab' + (id === key ? ' ytaf-selected' : '');
    }
    onSelect?.(key);
  }
  for (const [key, label, description] of settingsSections) {
    const row = doc.createElement('div'),
      button = doc.createElement('div');
    button.id = '__settings_' + key;
    button.tabIndex = 2000 + Object.keys(buttons).length;
    button.className = 'ytaf-settings-tab';
    button.textContent = label;
    button.dataset.ytafControl = 'action';
    button.dataset.ytafSection = key;
    button.setAttribute('role', 'button');
    button.__ytafActivate = () => select(key);
    button.addEventListener('click', () => {
      if (Number(row.dataset.ytafIgnoreClickUntil || 0) > Date.now()) return;
      select(key);
      button.focus();
    });
    row.appendChild(button);
    nav.appendChild(row);
    buttons[key] = button;
    const pane = doc.createElement('div');
    pane.className = 'ytaf-settings-section'; pane.id = '__settings_section_' + key;
    const heading = doc.createElement('h2');
    heading.textContent = label;
    const hint = doc.createElement('div');
    hint.className = 'ytaf-section-description';
    hint.textContent = description;
    pane.appendChild(heading);
    pane.appendChild(hint);
    panes[key] = pane;
    content.appendChild(pane);
  }
  for (const node of nodes) panes[settingsSectionFor(node)].appendChild(node);
  // Initialization must not call back before the owner's viewport exists.
  for (const [key] of settingsSections) {
    panes[key].style.display = key === current ? 'block' : 'none';
    buttons[key].setAttribute('aria-pressed', String(key === current));
    if (key === current) buttons[key].className += ' ytaf-selected';
  }
  return {
    nav,
    content,
    select,
    current: () => current,
    currentButton: () => buttons[current]
  };
}
