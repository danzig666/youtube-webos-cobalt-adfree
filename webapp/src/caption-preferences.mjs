import { getCurrentVideoId } from './sponsorblock-channels.mjs';
export const captionLanguages = [
  ['youtube', 'YouTube choice'],
  ['en', 'English'],
  ['hu', 'Hungarian'],
  ['de', 'German'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['pl', 'Polish'],
  ['nl', 'Dutch'],
  ['ro', 'Romanian'],
  ['cs', 'Czech'],
  ['uk', 'Ukrainian'],
  ['ru', 'Russian'],
  ['tr', 'Turkish'],
  ['ar', 'Arabic'],
  ['hi', 'Hindi'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh', 'Chinese']
].map(([value, label]) => ({ value, label }));
export function selectCaptionTrack(tracks, language) {
  if (!Array.isArray(tracks)) return null;
  const list = tracks.filter(
    (track) => track && typeof track.languageCode === 'string'
  );
  // Prefer exact language, then a regional variant; human captions before ASR.
  return (
    list
      .filter(
        (track) =>
          track.languageCode.toLowerCase() === language ||
          track.languageCode.toLowerCase().split('-')[0] === language
      )
      .sort(
        (a, b) =>
          Number(b.languageCode.toLowerCase() === language) -
            Number(a.languageCode.toLowerCase() === language) ||
          Number(a.kind === 'asr') - Number(b.kind === 'asr')
      )[0] || null
  );
}
export function startCaptionPreferences(doc, win, read) {
  if (win.__ytafCaptions) return win.__ytafCaptions;
  let key = null,
    element = null,
    timer = null,
    attempts = 0,
    done = false,
    generation = 0,
    loadedModule = false;
  const api = {
    status: 'Uses YouTube caption settings.',
    render() {},
    check,
    manual() {
      key = getCurrentVideoId(win, doc, false);
      element = doc.querySelector('video');
      done = true;
      cancel();
      status('Manual caption choice retained for this video.');
    }
  };
  win.__ytafCaptions = api;
  function status(value) {
    api.status = value;
    api.render();
  }
  function cancel() {
    generation++;
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
  }
  function check(reset = false) {
    const id = getCurrentVideoId(win, doc, false),
      video = doc.querySelector('video');
    if (reset || id !== key || video !== element) {
      cancel();
      key = id;
      element = video;
      attempts = 0;
      done = false;
      loadedModule = false;
    }
    if (done || timer !== null || !id || !video) return;
    const mode = ['youtube', 'on', 'off'].includes(read('captionMode'))
      ? read('captionMode')
      : 'youtube';
    const language = captionLanguages.some(
      (o) => o.value === read('captionLanguage')
    )
      ? read('captionLanguage')
      : 'youtube';
    const size = { large: 1, extra: 2 }[read('captionSize')];
    if (mode === 'youtube' && language === 'youtube' && size === undefined) {
      done = true;
      status('Uses YouTube caption settings.');
      return;
    }
    const player =
      doc.getElementById('ytlr-player__player-container-player') ||
      doc.querySelector('.html5-video-player');
    attempts++;
    function wait(message) {
      status(message);
      if (attempts >= 20) {
        done = true;
        return;
      }
      const ticket = generation;
      timer = win.setTimeout(() => {
        if (ticket === generation) {
          timer = null;
          check();
        }
      }, 250);
    }
    if (
      typeof player?.getOption !== 'function' ||
      typeof player?.setOption !== 'function'
    ) {
      wait('Caption controls unavailable here. Use YouTube’s caption menu.');
      return;
    }
    try {
      if (typeof player.getVideoData === 'function') {
        const data = player.getVideoData();
        if ((data?.video_id || data?.videoId) !== id) {
          wait('Waiting for the current video’s caption controls.');
          return;
        }
      }
      if (video.readyState === 0) {
        wait('Waiting for video metadata.');
        return;
      }
      const tracks = player.getOption('captions', 'tracklist');
      const current = player.getOption('captions', 'track');
      const enabled = Boolean(current?.languageCode || current?.vssId);
      let selected = null;
      if (
        mode === 'on' ||
        (mode === 'youtube' && enabled && language !== 'youtube')
      ) {
        if (!Array.isArray(tracks) || !tracks.length) {
          if (
            mode === 'on' &&
            !loadedModule &&
            typeof player.loadModule === 'function'
          ) {
            loadedModule = true;
            player.loadModule('captions');
          }
          wait(
            'Waiting for available caption tracks. Use YouTube’s caption menu if none appear.'
          );
          return;
        }
        selected =
          language === 'youtube'
            ? enabled
              ? current
              : tracks.find((t) => t?.languageCode)
            : selectCaptionTrack(tracks, language);
        if (!selected) {
          done = true;
          status(
            'Preferred caption language is unavailable; YouTube choice retained.'
          );
          return;
        }
      }
      // Set at most once per video/configuration. Never retry writes or police later choices.
      done = true;
      if (size !== undefined) player.setOption('captions', 'fontSize', size);
      if (mode === 'off') player.setOption('captions', 'track', {});
      else if (selected) player.setOption('captions', 'track', selected);
      status(
        'Caption preference requested for this video. Manual changes remain available.'
      );
    } catch (_) {
      done = true;
      status(
        'Caption preference could not be applied. Use YouTube’s caption menu.'
      );
    }
  }
  doc.addEventListener('loadedmetadata', () => check(), true);
  doc.addEventListener('canplay', () => check(), true);
  doc.addEventListener('yt-navigate-finish', () => check());
  win.addEventListener('hashchange', () => check());
  doc.addEventListener('ytaf-config-changed', (event) => {
    if (
      ['captionMode', 'captionLanguage', 'captionSize'].includes(
        event.detail?.key
      )
    )
      check(true);
  });
  doc.addEventListener('ytaf-caption-manual', () => api.manual());
  function manualEvent(event) {
    if (
      event.type === 'keydown' &&
      event.key !== 'Enter' &&
      event.keyCode !== 13
    )
      return;
    for (let node = event.target; node; node = node.parentElement) {
      if (
        node.matches?.(
          'ytlr-captions-button, [idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_CAPTIONS"]'
        )
      ) {
        api.manual();
        return;
      }
    }
  }
  doc.addEventListener('click', manualEvent, true);
  doc.addEventListener('keydown', manualEvent, true);
  check();
  return api;
}
export function createCaptionSettings(doc, win, choices, read, write) {
  const api = startCaptionPreferences(doc, win, read),
    panel = doc.createElement('div');
  for (const [key, label, options] of [
    [
      'captionMode',
      'Captions on each video',
      [
        { value: 'youtube', label: 'YouTube choice' },
        { value: 'on', label: 'Prefer on' },
        { value: 'off', label: 'Prefer off' }
      ]
    ],
    ['captionLanguage', 'Preferred caption language', captionLanguages],
    [
      'captionSize',
      'Caption text size',
      [
        { value: 'youtube', label: 'YouTube choice' },
        { value: 'large', label: 'Large' },
        { value: 'extra', label: 'Extra large' }
      ]
    ]
  ])
    panel.appendChild(
      choices.add('__' + key, label, read(key), options, (value) =>
        write(key, value)
      )
    );
  const help = doc.createElement('div');
  help.className = 'ytaf-setting-help';
  help.textContent =
    'Applied once per video when supported. No automatic translation. Missing languages keep YouTube’s choice. Manual changes take priority. YouTube choice stops future overrides; use its caption menu to reset the current video.';
  const state = doc.createElement('div');
  state.className = 'ytaf-setting-help';
  api.render = () => {
    state.textContent = api.status;
  };
  api.render();
  panel.appendChild(help);
  panel.appendChild(state);
  return panel;
}
