// A small modal decision, handled by the existing single remote-key interceptor.
export function showSegmentPrompt(doc, win, label, confirm, decline) {
  win.__ytafSponsorPrompt?.close();
  const previousFocus = doc.activeElement;
  const panel = doc.createElement('div');
  panel.className = 'ytaf-segment-prompt';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'SponsorBlock segment');
  const title = doc.createElement('div');
  title.textContent = `Skip ${label}?`;
  const help = doc.createElement('div');
  help.textContent = 'Left / Right: choose · OK: confirm · BACK: keep watching';
  panel.appendChild(title);
  panel.appendChild(help);
  let selected = 0,
    held = false,
    closed = false,
    ignoreClickUntil = 0;
  const buttons = ['Keep watching', 'Skip segment'].map((text, index) => {
    const button = doc.createElement('button');
    button.textContent = text;
    button.addEventListener('click', () => {
      if (Date.now() < ignoreClickUntil) return;
      finish(index === 1);
    });
    panel.appendChild(button);
    return button;
  });
  function focus() {
    buttons[selected].focus();
  }
  function close() {
    if (closed) return;
    const hadFocus = panel.contains?.(doc.activeElement);
    closed = true;
    panel.parentNode?.removeChild(panel);
    if (win.__ytafSponsorPrompt === api) delete win.__ytafSponsorPrompt;
    if (hadFocus && previousFocus?.isConnected) previousFocus.focus();
  }
  function finish(skip) {
    if (closed) return;
    close();
    (skip ? confirm : decline)();
  }
  const api = {
    close,
    dismiss: () => finish(false),
    handleKey(event) {
      const code = event.keyCode || event.which;
      if (code === 404 || code === 172 || event.key === '=') {
        finish(false);
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.type === 'keyup') {
        held = false;
        ignoreClickUntil = Date.now() + 1000;
        return true;
      }
      if (event.type !== 'keydown' || event.repeat || held) return true;
      const key = event.keyCode || event.which || event.key;
      const until = Date.now() + 1500;
      win.__ytafPromptRelease = (next) => {
        if (
          Date.now() > until ||
          (next.keyCode || next.which || next.key) !== key
        ) {
          delete win.__ytafPromptRelease;
          return false;
        }
        if (!closed) return false;
        next.preventDefault();
        next.stopPropagation();
        if (next.type === 'keyup') delete win.__ytafPromptRelease;
        return true;
      };
      held = true;
      ignoreClickUntil = Date.now() + 1000;
      if (
        event.key === 'ArrowLeft' ||
        code === 37 ||
        event.key === 'ArrowRight' ||
        code === 39
      ) {
        selected = 1 - selected;
        focus();
      } else if (event.key === 'Enter' || code === 13) finish(selected === 1);
      else if (event.key === 'Escape' || [27, 461, 8].includes(code))
        finish(false);
      return true;
    }
  };
  win.__ytafSponsorPrompt = api;
  (doc.body || doc.documentElement).appendChild(panel);
  focus();
  return close;
}
