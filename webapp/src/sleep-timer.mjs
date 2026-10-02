export const sleepTimerMinutes = [0, 15, 30, 60, 90];

// A session-only deadline, not a countdown based on how often callbacks run.
// This also expires correctly when a suspended app resumes after the deadline.
export function createSleepTimer({ now, schedule, cancel, onChange, onExpire }) {
  let deadline = 0, minutes = 0, pending = null, generation = 0;
  function state() {
    return { minutes, remainingMs: deadline ? Math.max(0, deadline - now()) : 0 };
  }
  function clearPending() {
    if (pending !== null) cancel(pending);
    pending = null;
  }
  function tick() {
    clearPending();
    if (!deadline) return;
    if (now() >= deadline) {
      deadline = 0; minutes = 0; generation += 1;
      onChange(state());
      onExpire();
      return;
    }
    onChange(state());
    const ticket = generation;
    pending = schedule(() => {
      if (ticket === generation) tick();
    }, Math.min(1000, deadline - now()));
  }
  return {
    state,
    check: tick,
    setMinutes(value) {
      if (!sleepTimerMinutes.includes(value)) return false;
      clearPending(); generation += 1;
      minutes = value; deadline = value ? now() + value * 60000 : 0;
      if (deadline) tick(); else onChange(state());
      return true;
    }
  };
}

export function createSleepTimerPanel(doc, win, choices, notify) {
  // Rebuilding the settings DOM must not create another timer or lose a deadline.
  if (!win.__ytafSleepTimer) {
    const session = { render: () => {}, result: '', notify };
    session.timer = createSleepTimer({
      now: () => (win.Date || Date).now(),
      schedule: (callback, delay) => win.setTimeout(callback, delay),
      cancel: handle => win.clearTimeout(handle),
      onChange: () => session.render(),
      onExpire: () => {
        const video = doc.querySelector('video');
        session.result = 'Timer finished. No video is playing.';
        if (video && !video.ended) {
          try {
            video.pause();
            session.result = video.paused
              ? 'Timer finished. Playback paused.'
              : 'Timer finished, but playback could not be paused. Use Pause on your remote.';
          } catch (_) {
            session.result = 'Timer finished, but playback could not be paused. Use Pause on your remote.';
          }
        }
        session.render(); session.notify(session.result, 5000, 'green');
      }
    });
    doc.addEventListener('visibilitychange', () => session.timer.check());
    win.addEventListener('pageshow', () => session.timer.check());
    win.__ytafSleepTimer = session;
  }
  const session = win.__ytafSleepTimer;
  session.notify = notify;
  const panel = doc.createElement('div');
  const status = doc.createElement('div');
  status.className = 'ytaf-setting-help';
  // Do not announce a changing countdown every second to assistive technology.
  const control = choices.add('__sleep_timer', 'Sleep timer', session.timer.state().minutes,
    sleepTimerMinutes.map(value => ({ value, label: value ? `${value} minutes` : 'Off' })),
    value => { session.result = ''; return session.timer.setMinutes(value); });
  panel.appendChild(control); panel.appendChild(status);
  const row = doc.createElement('div');
  const cancel = doc.createElement('div');
  cancel.id = '__sleep_timer_cancel'; cancel.tabIndex = 900;
  cancel.dataset.ytafControl = 'action'; cancel.className = 'ytaf-diagnostic-action';
  cancel.setAttribute('role', 'button'); cancel.textContent = 'Cancel sleep timer';
  cancel.__ytafActivate = () => { session.result = ''; session.timer.setMinutes(0); };
  cancel.addEventListener('click', () => {
    if (Number(row.dataset.ytafIgnoreClickUntil || 0) > Date.now()) return;
    cancel.__ytafActivate();
  });
  row.appendChild(cancel); panel.appendChild(row);
  session.render = () => {
    const { minutes, remainingMs } = session.timer.state();
    choices.setValue('__sleep_timer', minutes);
    const seconds = Math.ceil(remainingMs / 1000);
    status.textContent = minutes
      ? `Pauses playback in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}. It does not turn off the TV.`
      : session.result || 'Off. Choose a duration with OK. This timer lasts only for this app session and pauses playback; it does not turn off the TV.';
  };
  session.timer.check(); session.render();
  return panel;
}
