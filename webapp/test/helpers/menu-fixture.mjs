import fs from 'node:fs';
import vm from 'node:vm';
export function menuFixture() {
  const nodes = new Map(), listeners = new Map();
  const doc = {
    activeElement: null,
    body: { classList: { contains: name => name === 'WEB_PAGE_TYPE_WATCH' } },
    createElement() {
      const attributes = new Map();
      const node = { children: [], style: {}, dataset: {}, listeners: {}, textContent: '',
        classList: { add() {}, remove() {} },
        appendChild(child) { this.children.push(child); child.parentElement = this; },
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
  const context = vm.createContext({ document: doc, Date,
    isContainerOpen: () => true, menuHasFocus: () => true, queueMenuItemScroll() {},
    getDirectionFromEvent: () => null, isGreenKey: () => false, getPlaybackRateShortcut: () => 0 });
  const choice = fs.readFileSync(new URL('../../src/choiceTools.js', import.meta.url), 'utf8');
  vm.runInContext(choice.replace("import './choiceTools.css';", '').replace('export const', 'const') + '\nglobalThis.choices=choiceTools;', context);
  const ui = fs.readFileSync(new URL('../../src/ui.js', import.meta.url), 'utf8');
  vm.runInContext('let heldActivationControl=null;\n' + ui.slice(ui.indexOf('  const eventHandler = (evt) => {'), ui.indexOf('\n  // Red, Green, Yellow, Blue')), context);
  return { doc, nodes, choices: context.choices,
    press(id) {
      doc.activeElement = nodes.get(id);
      for (const type of ['keydown', 'keydown', 'keypress', 'keyup']) {
        context.event = {type, key: 'Enter', keyCode: 13, preventDefault() {}, stopPropagation() {}};
        vm.runInContext('eventHandler(event)', context);
      }
    },
    click(id) {
      const node = nodes.get(id), event = {preventDefault() {}, stopPropagation() {}};
      (node.listeners.click || node.parentElement.listeners.click)(event);
    }
  };
}
