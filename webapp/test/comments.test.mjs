import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialCommentsToken,
  parseCommentsPage,
  commentText
} from '../src/comments-data.mjs';
import {
  createCommentsClient,
  commentsContext
} from '../src/comments-client.mjs';
import {
  createCommentsPanel,
  commentTextPages
} from '../src/comments-panel.mjs';
const id = 'aaaaaaaaaaa';
const continuation = (token) => ({
  continuationItemRenderer: {
    continuationEndpoint: { continuationCommand: { token } }
  }
});
const legacy = (commentId, text = 'Comment') => ({
  commentRenderer: {
    commentId,
    contentText: { runs: [{ text }] },
    authorText: { simpleText: 'Author' },
    publishedTimeText: { simpleText: '1 day ago' },
    voteCount: { simpleText: '12' }
  }
});
const page = (items, mutations = []) => ({
  onResponseReceivedEndpoints: [
    { reloadContinuationItemsCommand: { continuationItems: items } }
  ],
  frameworkUpdates: { entityBatchUpdate: { mutations } }
});
const item = (name = 'one') => ({
  id: name,
  text: 'Body',
  author: 'Author',
  published: 'Today',
  likes: '2',
  replies: [],
  replyToken: null
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
// Independent small protobuf decoder checks tags/structure, not just a copied token.
function fields(bytes) {
  const result = {};
  let i = 0;
  function int() {
    let value = 0,
      shift = 0,
      byte;
    do {
      byte = bytes[i++];
      value |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
    return value;
  }
  while (i < bytes.length) {
    const tag = int(),
      field = tag >> 3;
    if ((tag & 7) === 2) {
      const len = int();
      result[field] = bytes.slice(i, i + len);
      i += len;
    } else result[field] = int();
  }
  return result;
}
test('initial comment token encodes the verified video, sorting, section and read type', () => {
  for (const sort of ['top', 'newest']) {
    const root = fields(
      Buffer.from(
        decodeURIComponent(initialCommentsToken(id, sort, btoa)),
        'base64'
      )
    );
    assert.equal(fields(root[2])[2].toString(), id);
    assert.equal(root[3], 6);
    const params = fields(root[6]),
      options = fields(params[4]);
    assert.equal(params[8].toString(), 'comments-section');
    assert.equal(options[4].toString(), id);
    assert.equal(options[6] || 0, sort === 'newest' ? 1 : 0);
    assert.equal(options[15], 2);
    assert.equal(options[16].length, 0);
  }
  assert.throws(() => initialCommentsToken('bad', 'top', btoa));
});
test('legacy comments keep reply continuations separate from main pagination', () => {
  const data = page([
    { commentsHeaderRenderer: { countText: { simpleText: '12 comments' } } },
    {
      commentThreadRenderer: {
        comment: legacy('parent', '<script>text</script>'),
        replies: {
          commentRepliesRenderer: {
            contents: [legacy('child'), continuation('replies-token')]
          }
        }
      }
    },
    continuation('next-token')
  ]);
  const result = parseCommentsPage(data);
  assert.equal(result.comments.length, 1);
  assert.equal(result.next, 'next-token');
  assert.equal(result.comments[0].replyToken, 'replies-token');
  assert.equal(result.comments[0].replies[0].id, 'child');
  assert.equal(result.comments[0].text, '<script>text</script>');
  assert.equal(result.count, '12 comments');
});
test('modern comment view models join the correct entity and reply subthreads', () => {
  const data = page(
    [
      {
        commentThreadRenderer: {
          commentViewModel: {
            commentViewModel: {
              commentId: 'new',
              commentKey: 'entity-key',
              pinnedText: 'Pinned'
            }
          },
          replies: {
            commentRepliesRenderer: { subThreads: [continuation('reply')] }
          }
        }
      }
    ],
    [
      {
        payload: {
          commentEntityPayload: {
            key: 'wrong',
            properties: { content: { content: 'Wrong' } }
          }
        }
      },
      {
        payload: {
          commentEntityPayload: {
            key: 'entity-key',
            properties: {
              content: { content: 'Modern text' },
              publishedTime: 'Today'
            },
            author: { displayName: 'Creator' },
            toolbar: { likeCountNotliked: '42' }
          }
        }
      }
    ]
  );
  const result = parseCommentsPage(data);
  assert.equal(result.comments[0].text, 'Modern text');
  assert.equal(result.comments[0].author, 'Creator');
  assert.equal(result.comments[0].replyToken, 'reply');
  assert.equal(result.comments[0].pinned, true);
  assert.equal(result.next, null);
});
test('parser distinguishes empty/disabled responses from unknown formats and bounds remote text', () => {
  assert.match(
    parseCommentsPage(
      page([
        { messageRenderer: { text: { simpleText: 'Comments are turned off' } } }
      ])
    ).message,
    /turned off/
  );
  assert.deepEqual(parseCommentsPage(page([])).comments, []);
  assert.throws(() => parseCommentsPage({ unrelated: {} }));
  assert.equal(
    parseCommentsPage(page([legacy('same'), legacy('same')])).comments.length,
    1
  );
  assert.equal(commentText('a'.repeat(20000)).length, 12000);
  assert.equal(commentText('hello\u202eevil'), 'helloevil');
});
function transport() {
  const requests = [];
  class XHR {
    constructor() {
      this.headers = {};
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(k, v) {
      this.headers[k] = v;
    }
    send(body) {
      this.body = JSON.parse(body);
      requests.push(this);
    }
    abort() {
      this.onabort?.();
    }
    respond(data = page([legacy('one')]), status = 200) {
      this.status = status;
      this.responseText = JSON.stringify(data);
      this.onload();
    }
  }
  return { requests, win: { XMLHttpRequest: XHR, btoa } };
}
test('client only uses same-origin read endpoint and an allowlisted WEB context', async () => {
  const f = transport();
  f.win.ytcfg = {
    get: () => ({
      client: {
        clientName: 'TVHTML5',
        clientVersion: '7.1',
        hl: 'hu',
        gl: 'HU',
        visitorData: 'private'
      }
    })
  };
  const client = createCommentsClient(f.win),
    promise = client.load(id);
  const request = f.requests[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.url, '/youtubei/v1/next?prettyPrint=false');
  assert.equal(request.body.context.client.clientName, 'WEB');
  assert.equal(request.body.context.client.hl, 'hu');
  assert.equal(request.body.context.client.visitorData, undefined);
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(request.timeout, 12000);
  request.respond();
  assert.equal((await promise).comments.length, 1);
  assert.equal(
    commentsContext({
      ytcfg: {
        get: () => ({
          client: { clientName: 'WEB', clientVersion: '2.20261001.00.00' }
        })
      }
    }).client.clientVersion,
    '2.20261001.00.00'
  );
});
test('client cancellation, timeouts and oversized responses fail without retries', async () => {
  const f = transport(),
    client = createCommentsClient(f.win);
  const cancelled = client.load(id);
  const rejected = assert.rejects(cancelled, /cancelled/);
  client.cancel();
  await rejected;
  const timeout = client.load(id);
  f.requests[1].ontimeout();
  await assert.rejects(timeout, /timed out/);
  const large = client.load(id);
  const xhr = f.requests[2];
  xhr.status = 200;
  xhr.responseText = 'a'.repeat(2097153);
  xhr.onload();
  await assert.rejects(large, /too large/);
  assert.equal(f.requests.length, 3);
  await assert.rejects(client.load('bad'));
});
function panelFixture() {
  const events = {},
    windowEvents = {},
    timers = new Map(),
    pending = [],
    requests = [];
  let num = 0,
    back = 0,
    cancels = 0;
  const doc = {
    activeElement: null,
    addEventListener: (key, fn) => {
      events[key] = fn;
    },
    getElementById: () => null,
    querySelector: () => null
  };
  doc.createElement = () => {
    const node = {
      children: [],
      style: {},
      listeners: {},
      dataset: {},
      textContent: '',
      setAttribute() {},
      appendChild(child) {
        node.children.push(child);
        child.parentNode = node;
      },
      removeChild(child) {
        node.children = node.children.filter((n) => n !== child);
        child.parentNode = null;
      },
      addEventListener: (key, fn) => {
        node.listeners[key] = fn;
      },
      contains: (target) =>
        node === target || node.children.some((n) => n.contains(target)),
      focus() {
        doc.activeElement = node;
        node.listeners.focus?.();
      }
    };
    Object.defineProperty(node, 'firstChild', { get: () => node.children[0] });
    return node;
  };
  doc.body = doc.createElement();
  doc.documentElement = doc.body;
  const win = {
    location: { href: '?v=' + id },
    setTimeout: (fn) => {
      timers.set(++num, fn);
      return num;
    },
    clearTimeout: (n) => timers.delete(n),
    addEventListener: (key, fn) => {
      windowEvents[key] = fn;
    }
  };
  const client = {
    cancel() {
      cancels++;
    },
    load(...args) {
      requests.push(args);
      return new Promise((resolve, reject) =>
        pending.push({ resolve, reject })
      );
    }
  };
  const api = createCommentsPanel(
    doc,
    win,
    { returnToMenu: () => back++ },
    client
  );
  function all(node = doc.body) {
    return [node, ...node.children.flatMap((child) => all(child))];
  }
  function key(code, type = 'keydown') {
    const event = {
      keyCode: code,
      type,
      preventDefault() {
        this.prevented = true;
      },
      stopPropagation() {}
    };
    api.handleKey(event);
    return event;
  }
  function press(code) {
    key(code);
    key(code, 'keypress');
    key(code, 'keyup');
  }
  function choose(prefix) {
    const target = all().find(
      (node) => node.textContent.startsWith(prefix) && node.listeners.click
    );
    assert.ok(target, 'button ' + prefix);
    target.focus();
    press(13);
  }
  return {
    doc,
    win,
    api,
    pending,
    requests,
    timers,
    all,
    key,
    press,
    choose,
    get back() {
      return back;
    },
    get cancels() {
      return cancels;
    },
    navigate() {
      win.location.href = '?v=bbbbbbbbbbb';
      windowEvents.hashchange();
    }
  };
}
test('panel makes no background request; held opening OK cannot activate a second action', async () => {
  const f = panelFixture();
  assert.equal(f.requests.length, 0);
  f.api.open(true);
  assert.equal(f.requests.length, 1);
  f.key(13);
  f.key(13, 'keypress');
  f.key(13, 'keyup');
  assert.equal(f.api.isOpen(), true);
  f.pending[0].resolve({
    comments: [item()],
    next: null,
    message: '',
    count: '1 comment'
  });
  await flush();
  f.choose('Author');
  assert.ok(f.all().some((n) => n.textContent.includes('Body')));
  f.press(461);
  assert.equal(f.api.isOpen(), true);
  f.press(461);
  assert.equal(f.api.isOpen(), false);
  assert.equal(f.back, 1);
  assert.equal(f.timers.size, 0);
});
test('video navigation cancels old results and allows explicit loading of the new video', async () => {
  const f = panelFixture();
  f.api.open();
  f.navigate();
  f.pending[0].resolve({
    comments: [item('old')],
    next: null,
    message: '',
    count: ''
  });
  await flush();
  assert.ok(f.all().some((n) => n.textContent.includes('Video changed')));
  assert.ok(!f.all().some((n) => n.textContent.includes('Author')));
  f.choose('Load current video');
  assert.equal(f.requests[1][0], 'bbbbbbbbbbb');
  f.api.close();
  f.pending[1].resolve({
    comments: [item()],
    next: null,
    message: '',
    count: ''
  });
  await flush();
  assert.equal(f.doc.body.children.length, 0);
});
test('sorting resets pagination, replies return to their parent, repeated tokens cannot loop', async () => {
  const f = panelFixture();
  f.api.open();
  f.pending[0].resolve({
    comments: [{ ...item(), replyToken: 'reply' }],
    next: 'next',
    message: '',
    count: ''
  });
  await flush();
  f.choose('Author');
  f.choose('Read replies');
  assert.equal(f.requests[1][2], 'reply');
  f.pending[1].resolve({
    comments: [item('child')],
    next: 'reply',
    message: '',
    count: ''
  });
  await flush();
  f.choose('Load more');
  assert.equal(f.requests.length, 2);
  assert.ok(f.all().some((n) => n.textContent.includes('repeated')));
  f.press(461);
  f.press(461);
  f.choose('Sort:');
  assert.equal(f.requests[2][1], 'newest');
  assert.equal(f.requests[2][2], null);
});
test('network failure offers explicit Retry and does not discard playback or auto-retry', async () => {
  const f = panelFixture();
  f.api.open();
  f.pending[0].reject(new Error('Connection failed'));
  await flush();
  assert.equal(f.requests.length, 1);
  f.choose('Retry');
  assert.equal(f.requests.length, 2);
  f.api.close();
});
test('text pages bound hard newlines and preserve Unicode without losing characters', () => {
  const text = '😀 test\n'.repeat(100);
  const pages = commentTextPages(text);
  assert.equal(pages.join(''), text);
  for (const part of pages) {
    assert.ok(Array.from(part).length <= 300);
    assert.ok((part.match(/\n/g) || []).length <= 4);
  }
});

test('panel pagination retains loaded comments and held keys do not send duplicate requests', async () => {
  const f = panelFixture();
  f.api.open();
  f.pending[0].resolve({
    comments: [item('1'), item('2'), item('3')],
    next: 'next',
    message: '',
    count: ''
  });
  await flush();
  const load = f.all().find((n) => n.textContent === 'Load more');
  load.focus();
  f.key(13);
  f.key(13);
  f.key(13, 'keypress');
  f.key(13, 'keyup');
  assert.equal(f.requests.length, 2);
  f.pending[1].resolve({
    comments: [item('3'), { ...item('4'), author: 'Fourth' }],
    next: null,
    message: '',
    count: ''
  });
  await flush();
  f.press(39);
  assert.ok(f.all().some((n) => n.textContent.startsWith('Fourth')));
  f.press(37);
  assert.ok(f.all().some((n) => n.textContent.includes('4 loaded')));
});
test('GREEN closes comments and swallows the rest of that press before returning to settings', () => {
  const f = panelFixture();
  f.api.open();
  f.key(404);
  assert.equal(f.back, 1);
  assert.equal(f.api.isOpen(), false);
  assert.equal(f.key(404, 'keypress').prevented, true);
  assert.equal(f.key(404, 'keyup').prevented, true);
});
test('comment display bounds total retained text', async () => {
  const f = panelFixture();
  f.api.open();
  f.pending[0].resolve({
    comments: Array.from({ length: 50 }, (_, i) => ({
      ...item(String(i)),
      text: 'x'.repeat(12000)
    })),
    next: 'next',
    message: '',
    count: ''
  });
  await flush();
  assert.ok(f.all().some((n) => n.textContent === 'Display limit reached.'));
  assert.ok(!f.all().some((n) => n.textContent === 'Load more'));
});
