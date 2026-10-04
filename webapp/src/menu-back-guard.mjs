export function createMenuBackGuard(isOpen, close, now = () => Date.now()) {
  let swallowed = null;
  let lastEventAt = 0;
  return event => {
    const code = event.keyCode || event.which || ({Escape:27,Backspace:8,BrowserBack:461,GoBack:461}[event.key]);
    if (![27,8,461].includes(code)) return false;
    const time = now();
    // Some remotes omit keyup. A new press after a quiet interval releases
    // that old gesture; repeated keydowns keep extending its ownership even
    // on older Cobalt builds that do not set KeyboardEvent.repeat.
    if (event.type === 'keydown' && swallowed !== null && !event.repeat &&
        (code !== swallowed || time - lastEventAt >= 500)) swallowed = null;
    if (!isOpen() && swallowed !== code) return false;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
    lastEventAt = time;
    if (event.type === 'keydown' && swallowed === null) { swallowed = code; close(); }
    if (event.type === 'keyup') swallowed = null;
    return true;
  };
}
