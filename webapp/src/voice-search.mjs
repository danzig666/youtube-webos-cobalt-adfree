// Microphone capture is supplied by Starboard. Recognition remains with
// YouTube/Google; never collect, log or persist audio or recognized text here.
const parseVoiceJson = JSON.parse;
const stringifyVoiceJson = JSON.stringify;
export const voiceLanguages = [
  { value: 'youtube', label: 'YouTube default' },
  { value: 'hu-HU', label: 'Hungarian / Magyar' },
  { value: 'en-US', label: 'English' }
];
export function voiceLanguage(value) {
  return value === 'hu-HU' || value === 'en-US' ? value : null;
}
function voiceUrl(value) {
  if (typeof value !== 'string') return false;
  const match = /^(?:(https?):\/\/([^/?#]+))?([^?#]*)/i.exec(value);
  if (!match || value.slice(0, 2) === '//') return false;
  const host = (match[2] || '').toLowerCase();
  const path = match[3] || '';
  const youtube =
    !host ||
    /^(www\.|m\.)?youtube\.com$/.test(host) ||
    host === 'youtubei.googleapis.com';
  return (
    (youtube && /\/(?:voice|voice_search|voicesearch)(?:\/|$)/i.test(path)) ||
    (/^(www\.)?google\.com$/.test(host) && /^\/speech-api\//.test(path))
  );
}
export function voiceRequestUrl(url, language) {
  if (!voiceLanguage(language) || !voiceUrl(url)) return url;
  // Preserve every unrelated parameter, including service authentication.
  // Only replace language fields already present in the service's request.
  return url.replace(
    /([?&])(hl|lang|language|languageCode|locale)=([^&#]*)/g,
    (_, separator, key) =>
      separator +
      key +
      '=' +
      encodeURIComponent(key === 'hl' ? language.split('-')[0] : language)
  );
}
export function voiceRequestBody(body, language) {
  if (
    !voiceLanguage(language) ||
    typeof body !== 'string' ||
    body.length > 2 * 1024 * 1024
  )
    return body;
  let value;
  try {
    value = parseVoiceJson.call(JSON, body);
  } catch (_) {
    return body;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return body;
  let changed = false;
  const setExisting = (object) => {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return;
    for (const key of ['languageCode', 'language', 'lang', 'locale']) {
      if (typeof object[key] === 'string' && object[key] !== language) {
        object[key] = language;
        changed = true;
      }
    }
  };
  const client = value.context?.client;
  if (client && typeof client === 'object' && !Array.isArray(client)) {
    if (client.hl !== language.split('-')[0]) {
      client.hl = language.split('-')[0];
      changed = true;
    }
  }
  setExisting(value);
  setExisting(value.config);
  setExisting(value.speechRecognitionConfig);
  setExisting(value.voiceSearchConfig);
  return changed ? stringifyVoiceJson.call(JSON, value) : body;
}
export function installVoiceSearch(win, read) {
  const state =
    win.__ytafVoiceSearch ||
    (win.__ytafVoiceSearch = {
      speechPrototypes: [],
      xhrPrototypes: [],
      fetchHook: null,
      requests: 0,
      starts: 0,
      lastLanguage: '',
      lastRoute: ''
    });
  state.read = read;
  const language = () => voiceLanguage(state.read('voiceSearchLanguage'));
  const mark = (selected, route) => {
    const changed =
      state.lastLanguage !== selected || state.lastRoute !== route;
    state.lastLanguage = selected;
    state.lastRoute = route;
    if (route === 'SpeechRecognition')
      state.starts = Math.min(9999, state.starts + 1);
    else state.requests = Math.min(9999, state.requests + 1);
    if (changed) {
      try {
        win.document?.dispatchEvent(new win.Event('ytaf-voice-search-status'));
      } catch (_) {}
    }
  };
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    const prototype = win[name]?.prototype;
    if (
      !prototype ||
      state.speechPrototypes.includes(prototype) ||
      typeof prototype.start !== 'function'
    )
      continue;
    const original = prototype.start;
    try {
      prototype.start = function () {
        const selected = language();
        if (selected) {
          try {
            this.lang = selected;
            if (this.lang === selected) mark(selected, 'SpeechRecognition');
          } catch (_) {}
        }
        return original.apply(this, arguments);
      };
      if (prototype.start !== original) state.speechPrototypes.push(prototype);
    } catch (_) {
      /* A locked platform API retains its normal behavior. */
    }
  }
  const prototype = win.XMLHttpRequest?.prototype;
  if (
    prototype &&
    !state.xhrPrototypes.includes(prototype) &&
    typeof prototype.open === 'function' &&
    typeof prototype.send === 'function'
  ) {
    const open = prototype.open,
      send = prototype.send,
      setHeader = prototype.setRequestHeader;
    const key = '__ytafVoiceRequest';
    const openHook = function (method, url) {
      const args = Array.prototype.slice.call(arguments);
      this[key] = { voice: voiceUrl(url), language: language(), header: false };
      if (this[key].voice) args[1] = voiceRequestUrl(url, this[key].language);
      return open.apply(this, args);
    };
    const headerHook = function (name, value) {
      const request = this[key];
      if (
        request?.voice &&
        request.language &&
        String(name).toLowerCase() === 'accept-language'
      ) {
        value =
          request.language + ',' + request.language.split('-')[0] + ';q=0.9';
        request.header = true;
      }
      return setHeader.call(this, name, value);
    };
    const sendHook = function (body) {
      const request = this[key];
      const selected = request?.voice && request.language;
      if (selected) {
        body = voiceRequestBody(body, selected);
        try {
          if (!request.header)
            this.setRequestHeader(
              'Accept-Language',
              selected + ',' + selected.split('-')[0] + ';q=0.9'
            );
        } catch (_) {}
        mark(selected, 'YouTube voice request');
      }
      return send.call(this, body);
    };
    try {
      prototype.open = openHook;
      prototype.send = sendHook;
      if (typeof setHeader === 'function')
        prototype.setRequestHeader = headerHook;
      if (prototype.open === openHook && prototype.send === sendHook)
        state.xhrPrototypes.push(prototype);
    } catch (_) {
      try {
        if (prototype.open === openHook) prototype.open = open;
        if (prototype.send === sendHook) prototype.send = send;
        if (prototype.setRequestHeader === headerHook)
          prototype.setRequestHeader = setHeader;
      } catch (_) {}
    }
  }
  if (typeof win.fetch === 'function' && win.fetch !== state.fetchHook) {
    const original = win.fetch;
    const hook = function (input, init) {
      const url = typeof input === 'string' ? input : input?.url;
      const selected = language();
      if (!selected || !voiceUrl(url)) return original.apply(this, arguments);
      const changedUrl = voiceRequestUrl(url, selected);
      let options = Object.assign({}, init);
      if (typeof options.body === 'string')
        options.body = voiceRequestBody(options.body, selected);
      try {
        if (win.Headers) {
          options.headers = new win.Headers(init?.headers || input?.headers);
          options.headers.set(
            'Accept-Language',
            selected + ',' + selected.split('-')[0] + ';q=0.9'
          );
        }
      } catch (_) {
        /* Preserve the original headers if this API is unavailable. */
      }
      mark(selected, 'YouTube voice request');
      if (typeof input === 'string')
        return original.call(this, changedUrl, options);
      // Preserve Request credentials, abort signal, method and binary audio.
      // Buffer only a non-streaming Cobalt Request when a language query must
      // change or JSON metadata requires a language override.
      if (win.Request && typeof input.clone === 'function') {
        try {
          const request = new win.Request(input, options);
          const json = /\bapplication\/json\b/i.test(
            request.headers.get('Content-Type') || ''
          );
          if (changedUrl === url && !json) return original.call(this, request);
          const parameters = {
            method: request.method,
            headers: request.headers,
            credentials: request.credentials,
            mode: request.mode,
            cache: request.cache,
            redirect: request.redirect,
            referrer: request.referrer,
            referrerPolicy: request.referrerPolicy,
            integrity: request.integrity,
            keepalive: request.keepalive,
            signal: request.signal
          };
          if (/^(GET|HEAD)$/i.test(request.method))
            return original.call(this, changedUrl, parameters);
          if (
            !json &&
            request.body &&
            typeof request.body.getReader === 'function'
          ) {
            parameters.body = request.body;
            if (request.duplex) parameters.duplex = request.duplex;
            return original.call(this, changedUrl, parameters);
          }
          const payload = json ? request.text() : request.arrayBuffer();
          return payload.then((body) => {
            parameters.body = json ? voiceRequestBody(body, selected) : body;
            return original.call(this, changedUrl, parameters);
          });
        } catch (_) {
          /* Preserve a platform Request if reconstruction is unsupported. */
        }
      }
      return original.call(this, input, options);
    };
    try {
      win.fetch = hook;
      if (win.fetch === hook) state.fetchHook = hook;
    } catch (_) {}
  }
  return state;
}
export function voiceSearchReport(win) {
  const state = win.__ytafVoiceSearch;
  if (!state) return 'Voice search: language hooks unavailable';
  const selected = voiceLanguage(state.read('voiceSearchLanguage'));
  return (
    'Voice search: ' +
    (selected || 'YouTube default') +
    '; recognition attempts ' +
    state.starts +
    '; voice requests ' +
    state.requests +
    (state.lastRoute
      ? '; last request ' + state.lastLanguage + ' via ' + state.lastRoute
      : '; waiting for a voice search')
  );
}
export function createVoiceSettings(doc, win, choices, read, write) {
  win.__ytafDisposeVoiceSettings?.();
  const panel = doc.createElement('div');
  panel.dataset.ytafSection = 'general';
  panel.appendChild(
    choices.add(
      '__voice_language',
      'Voice search language',
      read('voiceSearchLanguage'),
      voiceLanguages,
      (value) => write('voiceSearchLanguage', value)
    )
  );
  const help = doc.createElement('div');
  help.className = 'ytaf-setting-help';
  help.textContent =
    'Use the microphone in YouTube Search. Hungarian requests recognition in Magyar while the TV can stay in English. Wake the Magic Remote first. The TV language is unchanged; this does not translate the settings menu. Voice audio goes to YouTube/Google for recognition when you start a search.';
  panel.appendChild(help);
  const status = doc.createElement('div');
  status.className = 'ytaf-setting-help';
  panel.appendChild(status);
  let nativeStatus = '';
  const refresh = (readNative = false) => {
    if (readNative) {
      try {
        const report = win.h5vcc?.system?.getYtafMediaReport?.() || '';
        const match =
          /^Magic Remote microphone: (Not started|Opening|Recording|Unavailable|Stopped)$/m.exec(
            report
          );
        nativeStatus = match
          ? 'Microphone: ' + match[1]
          : 'Microphone status requires the updated native runtime.';
      } catch (_) {
        nativeStatus = 'Microphone status unavailable.';
      }
    }
    const selected = read('voiceSearchLanguage');
    const label =
      voiceLanguages.find((option) => option.value === selected)?.label ||
      'YouTube default';
    const attempted =
      win.__ytafVoiceSearch?.lastLanguage === voiceLanguage(selected);
    status.textContent =
      (attempted ? 'Last search requested: ' : 'Next voice search: ') +
      label +
      (nativeStatus ? '\n' + nativeStatus : '');
  };
  // No native report collection while constructing hidden settings at startup.
  refresh();
  panel.addEventListener('focus', () => refresh(true), true);
  const voiceChanged = () => refresh(true);
  const configChanged = (event) => {
    if (event.detail?.key === 'voiceSearchLanguage') refresh(true);
  };
  doc.addEventListener('ytaf-voice-search-status', voiceChanged);
  doc.addEventListener('ytaf-config-changed', configChanged);
  win.__ytafDisposeVoiceSettings = () => {
    doc.removeEventListener('ytaf-voice-search-status', voiceChanged);
    doc.removeEventListener('ytaf-config-changed', configChanged);
  };
  return panel;
}
