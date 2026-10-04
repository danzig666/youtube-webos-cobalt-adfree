import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSettingsSections,
  settingsSectionFor
} from '../src/settings-sections.mjs';
function element() {
  return {
    children: [],
    style: {},
    dataset: {},
    attrs: {},
    listeners: {},
    appendChild(node) {
      this.children.push(node);
      node.parentElement = this;
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    addEventListener(k, v) {
      this.listeners[k] = v;
    },
    focus() {},
    querySelector(selector) {
      return this.containsId === selector ? {} : null;
    }
  };
}
test('settings controls belong to the intended categories, including native-unavailable quality', () => {
  for (const [id, expected] of Object.entries({
    __video_capabilities: 'playback',
    __sleep_timer: 'playback',
    __stop_after_video: 'playback',
    __captionMode: 'captions',
    __dearrow_mode: 'captions',
    __numeric_shortcuts: 'remote',
    __shortcut_0: 'remote',
    __remote_help: 'remote',
    __sponsorblock: 'sponsorblock',
    __sponsorblock_sponsor: 'sponsorblock',
    __sponsorblock_channel_toggle: 'sponsorblock',
    __comments: 'general',
    __shorts: 'general'
  })) {
    const node = element();
    node.containsId = '#' + id;
    assert.equal(settingsSectionFor(node), expected, id);
  }
  const node = element();
  node.dataset.ytafSection = 'playback';
  assert.equal(settingsSectionFor(node), 'playback');
  node.dataset = {};
  node.className = 'ytaf-playback-diagnostics';
  assert.equal(settingsSectionFor(node), 'diagnostics');
});
test('category selection hides other panes without recreating settings, and ignores synthetic clicks', () => {
  const doc = { createElement: element },
    a = element(),
    b = element(),
    calls = [];
  a.containsId = '#__sleep_timer';
  b.containsId = '#__comments';
  const ui = createSettingsSections(doc, [a, b], (key) => calls.push(key));
  assert.equal(ui.current(), 'general');
  assert.equal(calls.length, 0);
  assert.equal(
    ui.content.children.filter((n) => n.style.display === 'block').length,
    1
  );
  ui.select('playback');
  assert.equal(ui.current(), 'playback');
  assert.equal(ui.content.children[1].children.at(-1), a);
  assert.equal(ui.currentButton().attrs['aria-pressed'], 'true');
  assert.equal(ui.content.children[0].style.display, 'none');
  ui.select('missing');
  assert.equal(ui.current(), 'playback');
  const general = ui.nav.children[0];
  general.dataset.ytafIgnoreClickUntil = Date.now() + 1000;
  general.children[0].listeners.click();
  assert.equal(ui.current(), 'playback');
  general.dataset.ytafIgnoreClickUntil = 0;
  general.children[0].listeners.click();
  assert.equal(ui.current(), 'general');
  assert.equal(ui.content.children[0].children.at(-1), b);
  assert.deepEqual(calls, ['playback', 'general']);
});

function navigationFixture() {
  const calls = [];
  const doc = {
    activeElement: null,
    createElement() {
      const node = element();
      node.focus = () => {
        if (doc.activeElement === node) return;
        doc.activeElement = node;
        node.listeners.focus?.();
      };
      return node;
    }
  };
  const ui = createSettingsSections(doc, [], key => {
    calls.push(key);
    // The owner's callback restores focus to the selected navigation item.
    // Its focus event must not select recursively or reset the pane twice.
    ui.currentButton().focus();
  });
  return {ui, doc, calls, buttons: ui.nav.children.map(row => row.children[0])};
}

test('moving remote focus between categories shows their options without OK', () => {
  const {ui, doc, calls, buttons} = navigationFixture();
  for (const button of buttons) {
    button.focus();
    const key = button.dataset.ytafSection;
    assert.equal(ui.current(), key);
    assert.equal(doc.activeElement, button);
    assert.equal(ui.currentButton(), button);
    assert.equal(button.attrs['aria-pressed'], 'true');
    assert.deepEqual(ui.content.children.filter(pane => pane.style.display === 'block').map(pane => pane.id),
      ['__settings_section_' + key]);
  }
  assert.deepEqual(calls, ['playback', 'captions', 'remote', 'sponsorblock', 'diagnostics']);
});

test('Magic Remote hover reveals categories using either mouseenter or legacy mouseover', () => {
  const {ui, doc, calls, buttons} = navigationFixture();
  buttons[1].listeners.mouseenter();
  assert.equal(ui.current(), 'playback');assert.equal(doc.activeElement, buttons[1]);
  buttons[2].listeners.mouseover();
  assert.equal(ui.current(), 'captions');assert.equal(doc.activeElement, buttons[2]);
  assert.deepEqual(calls, ['playback', 'captions']);
});

test('focus, repeated hover, OK and click on the current category do not reset its options', () => {
  const {ui, calls, buttons} = navigationFixture();
  const button = buttons[1];
  button.focus();
  ui.content.children[1].style.top = '-200px';
  for (let i = 0; i < 3; i++) {
    button.listeners.focus();
    button.listeners.mouseenter();
    button.listeners.mouseover();
    button.__ytafActivate();
    button.listeners.click();
    ui.select('playback');
  }
  assert.deepEqual(calls, ['playback']);
  assert.equal(ui.content.children[1].style.top, '-200px');
});
