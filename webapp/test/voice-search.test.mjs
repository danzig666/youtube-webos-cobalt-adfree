import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installVoiceSearch,
  voiceSearchReport,
  voiceRequestBody,
  voiceRequestUrl,
  voiceLanguage
} from '../src/voice-search.mjs';

test('voice metadata conversion does not enter later response-parser hooks or reserialize an unchanged request', () => {
  const original = JSON.parse;
  try {
    JSON.parse = () => {
      throw Error('response parser must not run');
    };
    assert.equal(
      voiceRequestBody('{"context":{"client":{"hl":"en"}}}', 'hu-HU'),
      '{"context":{"client":{"hl":"hu"}}}'
    );
    const same = '{ "context": { "client": { "hl": "hu" } } }';
    assert.equal(voiceRequestBody(same, 'hu-HU'), same);
  } finally {
    JSON.parse = original;
  }
});

function fixture(initial = 'hu-HU') {
  let selected = initial;
  const sent = [];
  class XHR {
    open(...args) {
      this.opened = args;
      this.headers = {};
    }
    setRequestHeader(name, value) {
      this.headers[name] = value;
    }
    send(body) {
      this.body = body;
      sent.push(this);
      return 17;
    }
  }
  class Recognition {
    constructor() {
      this.lang = 'fr-FR';
      this.calls = 0;
    }
    start(...args) {
      this.calls++;
      this.args = args;
      return 23;
    }
  }
  const fetchCalls = [];
  const win = {
    XMLHttpRequest: XHR,
    SpeechRecognition: Recognition,
    webkitSpeechRecognition: Recognition,
    Headers,
    Request,
    fetch(...args) {
      fetchCalls.push(args);
      return Promise.resolve('response');
    }
  };
  const read = () => selected;
  installVoiceSearch(win, read);
  return {
    win,
    read,
    set(value) {
      selected = value;
    },
    sent,
    fetchCalls
  };
}

test('metadata language covers a full 30-second PCM/base64 recording and bounds oversized JSON', () => {
  const audio = 'A'.repeat((16000 * 2 * 30 * 4) / 3);
  const body = JSON.stringify({ context: { client: { hl: 'en' } }, audio });
  const converted = JSON.parse(voiceRequestBody(body, 'hu-HU'));
  assert.equal(converted.context.client.hl, 'hu');
  assert.equal(converted.audio, audio);
  const oversized = JSON.stringify({
    context: { client: { hl: 'en' } },
    audio: 'A'.repeat(2 * 1024 * 1024)
  });
  assert.equal(voiceRequestBody(oversized, 'hu-HU'), oversized);
});
test('Hungarian recognition overrides the recognizer language at each start without changing TV locale', () => {
  const f = fixture();
  f.win.navigator = { language: 'en-US' };
  const recognition = new f.win.SpeechRecognition();
  assert.equal(recognition.start('argument'), 23);
  assert.equal(recognition.lang, 'hu-HU');
  assert.deepEqual(recognition.args, ['argument']);
  assert.equal(f.win.navigator.language, 'en-US');
  installVoiceSearch(f.win, f.read);
  recognition.start();
  assert.equal(recognition.calls, 2);
  assert.equal(f.win.__ytafVoiceSearch.starts, 2);
  f.set('en-US');
  recognition.start();
  assert.equal(recognition.lang, 'en-US');
});
test('YouTube default and invalid values preserve original speech and network behavior', async () => {
  for (const value of ['youtube', 'invalid', null, 'hu-HU&key=changed']) {
    const f = fixture(value);
    const recognition = new f.win.SpeechRecognition();
    recognition.start();
    assert.equal(recognition.lang, 'fr-FR');
    const init = { method: 'POST', body: '{"context":{"client":{"hl":"en"}}}' };
    await f.win.fetch('/youtubei/v1/voice/search?hl=en', init);
    assert.equal(f.fetchCalls[0][1], init);
    assert.equal(f.win.__ytafVoiceSearch.requests, 0);
  }
  assert.equal(voiceLanguage('hu-HU'), 'hu-HU');
});
test('XHR voice requests receive Hungarian metadata and preserve unrelated request data', () => {
  const f = fixture();
  const xhr = new f.win.XMLHttpRequest();
  const body = {
    context: {
      client: { hl: 'en', clientName: 'TVHTML5' },
      user: { id: 'private' }
    },
    audio: 'unchanged-audio',
    token: 'private'
  };
  xhr.open(
    'POST',
    'https://www.youtube.com/youtubei/v1/voice/search?hl=en&key=keep',
    true,
    'user',
    'password'
  );
  assert.equal(xhr.send(JSON.stringify(body)), 17);
  assert.deepEqual(xhr.opened, [
    'POST',
    'https://www.youtube.com/youtubei/v1/voice/search?hl=hu&key=keep',
    true,
    'user',
    'password'
  ]);
  assert.deepEqual(JSON.parse(xhr.body), {
    ...body,
    context: { ...body.context, client: { ...body.context.client, hl: 'hu' } }
  });
  assert.equal(xhr.headers['Accept-Language'], 'hu-HU,hu;q=0.9');
  xhr.open('POST', '/youtubei/v1/player');
  xhr.send(JSON.stringify(body));
  assert.equal(xhr.body, JSON.stringify(body));
  assert.deepEqual(xhr.headers, {});
});
test('language URL changes are restricted to recognition services and preserve credentials and fragments', () => {
  const url =
    'https://www.google.com/speech-api/v2/recognize?key=keep&lang=en-US#keep';
  assert.equal(
    voiceRequestUrl(url, 'hu-HU'),
    url.replace('lang=en-US', 'lang=hu-HU')
  );
  for (const url of [
    'https://example.com/voice/search?lang=en',
    'https://youtube.com.example.com/voice/search?lang=en',
    '//example.com/voice?lang=en',
    'https://www.youtube.com/youtubei/v1/search?lang=en',
    '/browse?next=/voice/search&lang=en'
  ])
    assert.equal(voiceRequestUrl(url, 'hu-HU'), url);
});
test('XHR replaces an existing English header and freezes the language for an in-flight request', () => {
  const f = fixture(),
    xhr = new f.win.XMLHttpRequest();
  xhr.open('POST', '/api/tv/voice?lang=en');
  xhr.setRequestHeader('Accept-Language', 'en-US');
  f.set('en-US');
  xhr.send('audio');
  assert.equal(xhr.headers['Accept-Language'], 'hu-HU,hu;q=0.9');
  assert.equal(xhr.opened[1], '/api/tv/voice?lang=hu-HU');
});
test('only voice recognition metadata is changed; malformed and binary bodies pass through', () => {
  const body = {
    config: { languageCode: 'en-US', sampleRate: 16000 },
    audio: { content: 'exact' },
    transcript: 'keep',
    authorization: 'keep'
  };
  assert.deepEqual(
    JSON.parse(voiceRequestBody(JSON.stringify(body), 'hu-HU')),
    { ...body, config: { ...body.config, languageCode: 'hu-HU' } }
  );
  const bytes = new Uint8Array([0, 255, 1, 128]);
  for (const value of [
    bytes,
    'not JSON',
    '[]',
    'null',
    '{"other":"unchanged"}',
    ' '.repeat(1024 * 1024 + 1)
  ])
    assert.equal(voiceRequestBody(value, 'hu-HU'), value);
});
test('fetch preserves caller headers, abort signals, credentials and binary audio', async () => {
  const f = fixture(),
    headers = new Headers({ 'X-Test': 'keep' }),
    signal = new AbortController().signal;
  const bytes = new Uint8Array([0, 255, 128, 1]);
  const init = {
    method: 'POST',
    headers,
    body: bytes,
    signal,
    credentials: 'include'
  };
  assert.equal(await f.win.fetch('/api/tv/voice?lang=en', init), 'response');
  const [url, options] = f.fetchCalls[0];
  assert.equal(url, '/api/tv/voice?lang=hu-HU');
  assert.equal(options.body, bytes);
  assert.equal(options.signal, signal);
  assert.equal(options.credentials, 'include');
  assert.equal(options.headers.get('X-Test'), 'keep');
  assert.equal(headers.has('Accept-Language'), false);
  assert.equal(init.headers, headers);
  assert.equal(init.body, bytes);
});
test('Request-form JSON metadata is rewritten while preserving method, credentials, signal and body fields', async () => {
  const f = fixture();
  const controller = new AbortController();
  const request = new Request(
    'https://www.youtube.com/youtubei/v1/voice/search?hl=en',
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        context: { client: { hl: 'en' } },
        audio: 'bytes',
        key: 'private'
      })
    }
  );
  await f.win.fetch(request);
  const [url, options] = f.fetchCalls[0];
  assert.equal(url, 'https://www.youtube.com/youtubei/v1/voice/search?hl=hu');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'include');
  assert.deepEqual(JSON.parse(options.body), {
    context: { client: { hl: 'hu' } },
    audio: 'bytes',
    key: 'private'
  });
  controller.abort();
  assert.equal(options.signal.aborted, true);
});
test('binary Request streaming is forwarded without buffering or re-encoding audio', async () => {
  const f = fixture(),
    bytes = new Uint8Array([0, 255, 128, 1]);
  const request = new Request('https://www.youtube.com/api/tv/voice?lang=en', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes
  });
  await f.win.fetch(request);
  const [url, options] = f.fetchCalls[0];
  assert.equal(url, 'https://www.youtube.com/api/tv/voice?lang=hu-HU');
  assert.ok(options.body instanceof ReadableStream);
  assert.deepEqual(
    new Uint8Array(await new Response(options.body).arrayBuffer()),
    bytes
  );
});
test('locked host APIs do not prevent startup or change their original behavior', () => {
  const f = fixture();
  const frozen = {};
  Object.defineProperty(frozen, 'fetch', { value: () => 23, writable: false });
  class XHR {}
  Object.defineProperty(XHR.prototype, 'open', {
    value: () => 17,
    writable: false
  });
  XHR.prototype.send = () => 19;
  frozen.XMLHttpRequest = XHR;
  assert.doesNotThrow(() => installVoiceSearch(frozen, f.read));
  assert.equal(frozen.fetch(), 23);
  assert.equal(new XHR().open(), 17);
  assert.equal(new XHR().send(), 19);
});
test('diagnostics retain only fixed route/language counters, never audio, transcripts, keys or URLs', async () => {
  const f = fixture();
  await f.win.fetch('/api/tv/voice?key=secret-key', {
    method: 'POST',
    body: JSON.stringify({
      language: 'en',
      audio: 'secret-audio',
      transcript: 'secret-text'
    })
  });
  assert.match(voiceSearchReport(f.win), /hu-HU.*voice requests 1/);
  assert.doesNotMatch(voiceSearchReport(f.win), /secret|\/api|https/);
});
