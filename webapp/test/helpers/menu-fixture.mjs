import fs from 'node:fs';
import vm from 'node:vm';
export function menuFixture({now = () => Date.now()} = {}) {
  let open = true;
  const nodes = new Map(), listeners = new Map();
  const doc = {
    activeElement: null,
    body: null,
    createElement() {
      const attributes = new Map();
      const node = { children: [], style: {}, dataset: {}, listeners: {}, textContent: '',
        classList: { add() {}, remove() {} },
        appendChild(child) { this.children.push(child); child.parentElement = this; child.parentNode = this; },
        removeChild(child) { this.children = this.children.filter(node => node !== child); child.parentElement = child.parentNode = null; },
        contains(child) { return this === child || this.children.some(node => node.contains(child)); },
        addEventListener(type, handler) { this.listeners[type] = handler; },
        setAttribute(key, value) { attributes.set(key, value); },
        getAttribute(key) { return attributes.get(key); },
        focus() { doc.activeElement = this; } };
      Object.defineProperty(node, 'id', {get() { return this._id; }, set(value) { this._id = value; nodes.set(value, this); }});
      return node;
    },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
    getElementById: id => nodes.get(id),
    querySelector: selector => selector === ':focus' ? doc.activeElement : nodes.get(selector.replace(/^#/, ''))
  };
  doc.body = doc.createElement('div');
  doc.body.classList.contains = name => name === 'WEB_PAGE_TYPE_WATCH';
  const context = vm.createContext({ document: doc, Date: {now},
    isContainerOpen: () => open, menuHasFocus: () => true, queueMenuItemScroll() {},
    getDirectionFromEvent: () => null, isGreenKey: () => false, getPlaybackRateShortcut: () => 0 });
  const choice = fs.readFileSync(new URL('../../src/choiceTools.js', import.meta.url), 'utf8');
  vm.runInContext(choice.replace("import './choiceTools.css';", '').replace('export const', 'const') + '\nglobalThis.choices=choiceTools;', context);
  const ui = fs.readFileSync(new URL('../../src/ui.js', import.meta.url), 'utf8');
  vm.runInContext('let closedActivationReleaseUntil=0,heldActivationControl=null;\n' + ui.slice(ui.indexOf('  const eventHandler = (evt) => {'), ui.indexOf('\n  // Red, Green, Yellow, Blue')), context);
  return { doc, nodes, choices: context.choices, setOpen: value => {open = value;},
    choose(id, value) { context.choices.select(id, value); },
    key(key, code) {
      for (const type of ['keydown', 'keypress', 'keyup']) {
        context.event = {type, key, keyCode: code, preventDefault() {this.prevented=true;}, stopPropagation() {}};
        vm.runInContext('eventHandler(event)', context);
      }
    },
    press(id) {
      doc.activeElement = nodes.get(id);
      const consumed = [];
      for (const type of ['keydown', 'keydown', 'keypress', 'keyup']) {
        context.event = {type, key: 'Enter', keyCode: 13, preventDefault() {this.prevented=true;}, stopPropagation() {}};
        vm.runInContext('eventHandler(event)', context);
        consumed.push(Boolean(context.event.prevented));
      }
      return consumed;
    },
    click(id) {
      const node = nodes.get(id), event = {preventDefault() {this.prevented=true;}, stopPropagation() {}};
      (node.listeners.click || node.parentElement.listeners.click)(event);
    }
  };
}
