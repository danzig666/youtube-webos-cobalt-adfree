import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBranding,
  thumbnailUrl,
  createBrandingClient
} from '../src/dearrow-client.mjs';
import {
  startDeArrow,
  videoIdFromUrl,
  createDeArrowSettings
} from '../src/dearrow.mjs';
import { menuFixture } from './helpers/menu-fixture.mjs';
const a = 'aaaaaaaaaaa',
  b = 'bbbbbbbbbbb',
  c = 'ccccccccccc';
const branding = {
  titles: [{ title: 'Clear title', original: false, votes: 2 }],
  thumbnails: [{ timestamp: 12, original: false, votes: 1 }]
};
function transport() {
  const requests = [];
  class XHR {
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    send() {
      requests.push(this);
    }
    abort() {
      this.onabort?.();
    }
    respond(data = branding, status = 200) {
      this.status = status;
      this.responseText = JSON.stringify(data);
      this.onload();
    }
  }
  return { win: { XMLHttpRequest: XHR }, requests };
}
test('DeArrow validates results, respects top original votes, and never interprets markup', () => {
  assert.deepEqual(parseBranding(branding), {
    title: 'Clear title',
    timestamp: 12
  });
  assert.deepEqual(
    parseBranding({
      titles: [{ original: true, votes: 3 }, ...branding.titles],
      thumbnails: [{ original: true, votes: 3 }, ...branding.thumbnails]
    }),
    { title: null, timestamp: null }
  );
  assert.equal(
    parseBranding({
      titles: [{ title: '<b>title</b>\u202e', original: false, votes: 1 }]
    }).title,
    '<b>title</b>'
  );
  assert.equal(thumbnailUrl('bad', 12), null);
  assert.equal(thumbnailUrl(a, Infinity), null);
  assert.equal(
    videoIdFromUrl('https://i.ytimg.com/vi/' + a + '/hqdefault.jpg'),
    a
  );
  assert.equal(videoIdFromUrl('/watch?v=aaaaaaaaaaaa'), null);
});
test('client coalesces requests, limits concurrency, omits credentials, caches errors and rejects stale responses', async () => {
  const t = transport(),
    client = createBrandingClient(t.win);
  const p = client.get(a),
    same = client.get(a),
    second = client.get(b);
  assert.equal(p, same);
  assert.equal(await client.get(c), null);
  assert.equal(t.requests.length, 2);
  assert.equal(t.requests[0].withCredentials, false);
  assert.equal(t.requests[0].timeout, 8000);
  t.requests[0].respond();
  assert.deepEqual(await p, parseBranding(branding));
  await client.get(a);
  assert.equal(t.requests.length, 2);
  t.requests[1].respond({}, 500);
  assert.equal(await second, null);
  await client.get(b);
  assert.equal(t.requests.length, 2);
  const pending = client.get(c);
  client.clear();
  t.requests[2].respond();
  assert.equal(await pending, null);
});
function domFixture(mode = 'titles') {
  const t = transport(),
    events = {},
    timers = new Map(),
    images = [];
  let next = 0;
  const title = { textContent: 'Original title', children: [] },
    attrs = { src: `https://i.ytimg.com/vi/${a}/hqdefault.jpg` };
  const imageEvents = {};
  const image = {
    addEventListener: (name, fn) => {imageEvents[name]=fn;},
    removeEventListener: name => {delete imageEvents[name];},
    fail: () => imageEvents.error?.(),
    getAttribute: (key) => attrs[key] || null,
    setAttribute: (key, value) => (attrs[key] = value)
  };
  let id = a,
    connected = true;
  const card = {
    getAttribute: (key) => (key === 'data-video-id' ? id : null),
    querySelector: (s) =>
      s === 'img' ? image : s === 'a[href]' ? null : title,
    querySelectorAll: () => [image],
    getBoundingClientRect: () => ({
      width: 200,
      height: 100,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100
    })
  };
  const doc = {
    hidden: false,
    documentElement: { contains: () => connected },
    querySelectorAll: () => [card],
    addEventListener: (name, fn) => (events[name] = fn)
  };
  Object.assign(t.win, {
    innerHeight: 1080,
    innerWidth: 1920,
    Image: class {
      constructor() {
        images.push(this);
      }
    },
    setTimeout: (fn) => {
      timers.set(++next, fn);
      return next;
    },
    clearTimeout: (id) => timers.delete(id)
  });
  const api = startDeArrow(doc, t.win, () => mode);
  return {
    ...t,
    api,
    doc,
    card,
    title,
    image,
    images,
    timers,
    mode(value) {
      mode = value;
      events['ytaf-config-changed']({ detail: { key: 'dearrowMode' } });
    },
    recycle() {
      id = b;
      title.textContent = 'New video';
      attrs.src = `https://i.ytimg.com/vi/${b}/hqdefault.jpg`;
    },
    disconnect() {
      connected = false;
    }
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
test('off causes no network or polling; title mode restores originals immediately', async () => {
  const f = domFixture('off');
  assert.equal(f.requests.length, 0);
  assert.equal(f.timers.size, 0);
  f.mode('titles');
  f.requests[0].respond();
  await flush();
  assert.equal(f.title.textContent, 'Clear title');
  assert.equal(f.images.length, 0);
  f.api.toggleOriginals();
  assert.equal(f.title.textContent, 'Original title');
  assert.equal(f.timers.size, 0);
});
test('late data never changes a recycled card or a disabled integration', async () => {
  const f = domFixture();
  f.recycle();
  f.requests[0].respond();
  await flush();
  assert.equal(f.title.textContent, 'New video');
  const g = domFixture();
  g.mode('off');
  g.requests[0].respond();
  await flush();
  assert.equal(g.title.textContent, 'Original title');
});
test('thumbnail loads before replacing and restores; failures retain original without retry storms', async () => {
  const f = domFixture('both');
  f.requests[0].respond();
  await flush();
  assert.equal(f.images.length, 1);
  assert.match(f.image.getAttribute('src'), /ytimg/);
  f.images[0].onload();
  assert.match(f.image.getAttribute('src'), /dearrow-thumb/);
  f.mode('off');
  assert.match(f.image.getAttribute('src'), /ytimg/);
  assert.equal(f.title.textContent, 'Original title');
  const g = domFixture('both');
  g.requests[0].respond();
  await flush();
  g.images[0].onerror();
  g.api.scan();
  await flush();
  assert.equal(g.images.length, 1);
  const h = domFixture('both');
  h.requests[0].respond();
  await flush();
  h.recycle();
  h.images[0].onload();
  assert.match(h.image.getAttribute('src'), new RegExp(b));
});
test('DeArrow never overwrites newer YouTube text when restoring and ignores detached cards', async () => {
  const f = domFixture();
  f.requests[0].respond();
  await flush();
  f.title.textContent = 'YouTube updated';
  f.mode('off');
  assert.equal(f.title.textContent, 'YouTube updated');
  const g = domFixture();
  g.disconnect();
  g.requests[0].respond();
  await flush();
  assert.equal(g.title.textContent, 'Original title');
});
test('Show originals action handles held OK without double toggling', () => {
  const f = menuFixture();
  let paused = false,
    calls = 0;
  const win = {
    __ytafDeArrow: {
      status: 'Ready',
      paused: () => paused,
      toggleOriginals() {
        calls++;
        paused = !paused;
        this.render();
      },
      render() {}
    }
  };
  createDeArrowSettings(
    f.doc,
    win,
    f.choices,
    () => 'titles',
    () => {}
  );
  f.press('__dearrow_originals');
  f.click('__dearrow_originals');
  assert.equal(calls, 1);
  assert.equal(
    f.nodes.get('__dearrow_originals').textContent,
    'Resume DeArrow'
  );
});

test('a displayed thumbnail failure restores the original and does not retry',async()=>{
  const f=domFixture('both');f.requests[0].respond();await flush();f.images[0].onload();
  f.image.fail();assert.match(f.image.getAttribute('src'),/ytimg/);
  f.api.scan();await flush();assert.equal(f.images.length,1);
});

test('DeArrow session cache evicts after 100 entries and caches a network timeout',async()=>{
  const t=transport(),client=createBrandingClient(t.win);
  for(let i=0;i<101;i++){
    const pending=client.get(String(i).padStart(11,'0'));t.requests.at(-1).respond();await pending;
  }
  const first=client.get('00000000000');assert.equal(t.requests.length,102);t.requests.at(-1).ontimeout();assert.equal(await first,null);
  await client.get('00000000000');assert.equal(t.requests.length,102);
});
