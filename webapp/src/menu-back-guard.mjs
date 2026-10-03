export function createMenuBackGuard(isOpen, close) {
  let swallowed = null;
  return event => {
    const code = event.keyCode || event.which || ({Escape:27,Backspace:8,BrowserBack:461,GoBack:461}[event.key]);
    if (![27,8,461].includes(code)) return false;
    if (!isOpen() && swallowed !== code) return false;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
    if (event.type === 'keydown' && swallowed === null) { swallowed = code; close(); }
    if (event.type === 'keyup') swallowed = null;
    return true;
  };
}
