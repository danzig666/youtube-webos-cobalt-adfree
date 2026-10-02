import { getCurrentVideoId } from './sponsorblock-channels.mjs';
// Session-only: never changes the account's autoplay preference.
export function createEndStop(doc, win, notify) {
  let state = 'idle',
    target = null,
    videoId = null;
  const api = {
    render() {},
    state: () => state,
    activate() {
      if (state === 'armed') {
        state = 'idle';
        target = null;
        notify('Stop after video cancelled.', 2500, 'green');
      } else if (state === 'stopped') {
        state = 'idle';
        target = null;
        try {
          const result = doc.querySelector('video')?.play();
          result?.catch(() =>
            notify('Use Play on your remote to continue.', 3500, 'green')
          );
        } catch (_) {
          notify('Use Play on your remote to continue.', 3500, 'green');
        }
      } else {
        const video = doc.querySelector('video'),
          id = getCurrentVideoId(win, doc, false);
        if (
          !video ||
          video.ended ||
          !id ||
          !Number.isFinite(video.duration) ||
          video.duration <= 0
        ) {
          notify('Play a video with a known ending first.', 3500, 'green');
          return;
        }
        pauseFailureReported = false;
        state = 'armed';
        target = video;
        videoId = id;
        notify('Will pause autoplay after this video ends.', 3500, 'green');
      }
      api.render();
    }
  };
  let pauseFailureReported = false;
  function pause(video) {
    try {
      video.pause();
      if (video.paused) return true;
    } catch (_) {}
    if (!pauseFailureReported) {
      pauseFailureReported = true;
      notify('Could not pause playback. Use Pause on your remote.', 5000, 'yellow');
    }
    return false;
  }
  doc.addEventListener(
    'ended',
    (event) => {
      if (
        state !== 'armed' ||
        event.target !== target ||
        !target.ended ||
        getCurrentVideoId(win, doc, false) !== videoId
      )
        return;
      state = 'stopped';
      const paused = pause(target);
      api.render();
      if (paused) notify(
        'Video finished. GREEN → Continue playback to resume.',
        6000,
        'green'
      );
    },
    true
  );
  doc.addEventListener(
    'play',
    (event) => {
      if (state === 'stopped' && event.target === doc.querySelector('video'))
        pause(event.target);
      else checkNavigation();
    },
    true
  );
  function checkNavigation() {
    if (state !== 'armed') return;
    const id = getCurrentVideoId(win, doc, false);
    if (id && id !== videoId) {
      state = 'idle';
      target = null;
      api.render();
      notify('Video changed. Stop after video cancelled.', 3000, 'green');
    }
  }
  win.addEventListener('hashchange', checkNavigation);
  doc.addEventListener('yt-navigate-finish', checkNavigation);
  return api;
}
export function createEndStopPanel(doc, win, notify) {
  const api =
    win.__ytafEndStop || (win.__ytafEndStop = createEndStop(doc, win, notify));
  const row = doc.createElement('div'),
    button = doc.createElement('div');
  button.id = '__stop_after_video';
  button.tabIndex = 902;
  button.dataset.ytafControl = 'action';
  button.className = 'ytaf-diagnostic-action';
  button.setAttribute('role', 'button');
  button.__ytafActivate = () => api.activate();
  button.addEventListener('click', () => {
    if (Number(row.dataset.ytafIgnoreClickUntil || 0) <= Date.now())
      api.activate();
  });
  row.appendChild(button);
  api.render = () => {
    button.textContent = {
      idle: 'Stop after this video',
      armed: 'Cancel stop after this video',
      stopped: 'Continue playback'
    }[api.state()];
  };
  api.render();
  return row;
}
