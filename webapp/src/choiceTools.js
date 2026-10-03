import './choiceTools.css';

let choiceTabIndex = 100;
const choices = {};
let popup = null, held = null, released = null;
let releaseGuardUntil = 0;

function guardRelease() { releaseGuardUntil = Date.now() + 750; }

function consume(event) {
  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
}
function render(control) {
  const entry = choices[control.id];
  if (!entry) return;
  const selected = entry.options.find(option => option.value === entry.value);
  control.textContent = (selected ? selected.label : entry.value) + '  ▾';
  control.setAttribute('aria-label', `${entry.label}: ${selected ? selected.label : entry.value}`);
}
function setValue(name, value) {
  const entry = choices[name];
  if (!entry || !entry.options.some(option => option.value === value)) return false;
  entry.value = value; entry.revision++; render(entry.control); return true;
}
function select(name, value) {
  const entry = choices[name];
  if (!entry || !entry.options.some(option => option.value === value)) return false;
  const old = entry.value, revision = entry.revision;
  if (old !== value && entry.callback?.(value) === false) return false;
  // Callbacks (e.g. sleep timer) can update the displayed value themselves.
  if (entry.revision === revision) entry.value = value;
  render(entry.control);
  close(); return true;
}
function close(restoreFocus = true) {
  if (!popup) return;
  const old = popup; popup = null; held = null;
  old.root.parentNode?.removeChild(old.root);
  old.control.setAttribute('aria-expanded', 'false');
  if (restoreFocus) old.control.focus();
}
function focusOption() {
  if (!popup) return;
  const option = popup.nodes[popup.index];
  const rowHeight = option.offsetHeight || 50;
  const viewHeight = popup.viewport.clientHeight || 250;
  popup.offset = Math.max(0, Math.min(popup.offset, Math.max(0, (popup.content.scrollHeight || popup.nodes.length * rowHeight) - viewHeight)));
  const top = option.offsetTop ?? popup.index * rowHeight;
  if (top < popup.offset) popup.offset = top;
  if (top + rowHeight > popup.offset + viewHeight) popup.offset = top + rowHeight - viewHeight;
  option.focus(); popup.content.style.top = `${-popup.offset}px`;
  popup.viewport.scrollTop = 0;
}
function open(name, activationCode = null) {
  const entry = choices[name];
  if (!entry || !entry.options.length) return;
  if (popup?.name === name) return;
  close();
  const control = entry.control;
  const owner = document.querySelector('.ytaf-ui-container') || document.body;
  const root = document.createElement('div'); root.className = 'ytaf-choice-popup';
  const heading = document.createElement('div'); heading.className = 'ytaf-choice-heading';
  heading.textContent = entry.label; root.appendChild(heading);
  const hint = document.createElement('div'); hint.className = 'ytaf-choice-hint';
  hint.textContent = '↑ ↓ / wheel: options · OK: select · BACK: cancel'; root.appendChild(hint);
  const viewport = document.createElement('div'); viewport.className = 'ytaf-choice-viewport';
  const content = document.createElement('div'); content.className = 'ytaf-choice-options';
  content.id = name + '_options'; content.setAttribute('role', 'listbox');
  const nodes = [];
  const index = Math.max(0, entry.options.findIndex(option => option.value === entry.value));
  entry.options.forEach((option, i) => {
    const node = document.createElement('button'); node.type = 'button'; node.className = 'ytaf-choice-option';
    node.textContent = option.label; node.tabIndex = 0; node.setAttribute('role', 'option');
    node.setAttribute('aria-selected', String(option.value === entry.value));
    node.addEventListener('focus', () => { if (popup) popup.index = i; });
    node.addEventListener('pointermove', () => {if(popup?.name===name){popup.index=i;node.focus();}});
    function activate(event) {
      consume(event);
      if (event.button !== undefined && event.button !== 0) return;
      if (popup?.name === name) {
        // Cobalt can hit-test compatibility mouseup/click again after this
        // pointerup removes the list. Consume the remainder of that gesture
        // at document capture, before an underlying switch sees it.
        guardRelease(); select(name, option.value);
      }
    }
    node.addEventListener('pointerup', activate);
    node.addEventListener('mouseup', activate);
    node.addEventListener('click', activate);

    nodes.push(node); content.appendChild(node);
  });
  for (const type of ['pointerdown','pointerup','mousedown','mouseup','click'])
    root.addEventListener(type, consume);
  viewport.appendChild(content); root.appendChild(viewport); (document.body || owner).appendChild(root);
  // Keep the listbox inside the menu, including at 720p. It can scroll independently.
  const panel = owner.getBoundingClientRect?.() || {width: 900, height: 600, left: 0, top: 0};
  const anchor = control.parentElement.getBoundingClientRect?.() || {left: 220, top: 100, width: 500, bottom: 150};
  const width = Math.min(anchor.width, panel.width - 40);
  const height = Math.min(420, panel.height - 56);
  root.style.width = `${width}px`;
  root.style.left = `${panel.left + Math.max(20, Math.min(anchor.left - panel.left, panel.width - width - 20))}px`;
  root.style.top = `${panel.top + Math.max(20, Math.min(anchor.bottom - panel.top + 6, panel.height - height - 20))}px`;
  viewport.style.height = `${Math.max(100, Math.min(entry.options.length * 50, height - 90))}px`;
  popup = {name, root, viewport, content, nodes, index, offset: 0, control};
  held = activationCode;
  control.setAttribute('aria-expanded', 'true'); focusOption();
}
function handleWheel(event) {
  if (!popup || event.ctrlKey) return false;
  consume(event);
  const delta = Number(event.deltaY);
  if (Number.isFinite(delta) && delta) {
    const steps = Math.max(1, Math.min(8, Math.round(Math.abs(delta) / (event.deltaMode === 1 ? 1 : 50))));
    popup.index = Math.max(0, Math.min(popup.nodes.length - 1, popup.index + (delta > 0 ? steps : -steps)));
    focusOption();
  }
  return true;
}
function handleKey(event) {
  const code = event.keyCode || event.which || ({Enter:13,Space:32,' ':32,ArrowUp:38,ArrowDown:40,Escape:27,Backspace:8,BrowserBack:461}[event.key]);
  if (!popup) {
    if (released !== null && code === released) {
      consume(event); if (event.type === 'keyup') released = null; return true;
    }
    return false;
  }
  consume(event);
  if (event.type === 'keyup') {
    popup.control.parentElement.dataset.ytafIgnoreClickUntil = String(Date.now() + 1000);
    held = null; return true;
  }
  if (event.type !== 'keydown' || held === code) return true;
  held = code;
  if (code === 38 || code === 40) {
    popup.index = Math.max(0, Math.min(popup.nodes.length - 1, popup.index + (code === 40 ? 1 : -1)));
    focusOption();
  } else if (code === 13 || code === 32) {
    const {name, index} = popup;
    released = code; guardRelease(); select(name, choices[name].options[index].value);
  } else if ([27,461,8,404,172].includes(code)) {
    released = code; close();
  }
  return true;
}
function add(name, label, value, options, callback = null) {
  const wrapper = document.createElement('div'); wrapper.classList.add('choice-wrapper');
  const description = document.createElement('div'); description.classList.add('desc'); description.textContent = label;
  const control = document.createElement('div'); control.id = name; control.classList.add('choice-value');
  control.tabIndex = choiceTabIndex++; control.dataset.ytafControl = 'choice';
  control.setAttribute('role', 'combobox'); control.setAttribute('aria-haspopup', 'listbox');
  control.setAttribute('aria-expanded', 'false'); control.setAttribute('aria-controls', name + '_options');
  choices[name] = {value, options, callback, label, control, revision:0}; render(control);
  wrapper.appendChild(description); wrapper.appendChild(control);
  wrapper.addEventListener('click', event => {
    consume(event);
    if (Number(wrapper.dataset.ytafIgnoreClickUntil || 0) <= Date.now()) open(name);
  }, true);
  control.addEventListener('focus', () => wrapper.classList.add('ytaf-focused'));
  control.addEventListener('blur', () => wrapper.classList.remove('ytaf-focused'));
  return wrapper;
}
function guardPointer(event) {
  // A new pointerdown starts a deliberate gesture. A compatibility mousedown
  // after pointerup does not: do not let it reopen or toggle another control.
  if (event.type === 'pointerdown') releaseGuardUntil = 0;
  if (releaseGuardUntil > Date.now()) { consume(event); return; }
  if (popup && !popup.root.contains?.(event.target)) {
    guardRelease(); consume(event); close(false);
  }
}
for (const type of ['pointerdown','pointerup','mousedown','mouseup','click'])
  document.addEventListener(type, guardPointer, true);
export const choiceTools = {contains: node => Boolean(popup?.root.contains?.(node)), add, open, close, select, setValue, handleKey, handleWheel, isOpen: () => Boolean(popup)};
