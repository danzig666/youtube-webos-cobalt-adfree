import { wheelScrollDelta } from './wheel-scroll.mjs';
import { getCurrentVideoId } from './sponsorblock-channels.mjs';
import { createCommentsClient } from './comments-client.mjs';
// Scroll through a tall comment before advancing focus to the next item.
export function readingScrollStep(offset, height, top, bottom, direction) {
  const step = Math.max(40, height * 0.65);
  if (direction > 0 && bottom > offset + height + 1)
    return Math.min(offset + step, bottom - height);
  if (direction < 0 && top < offset - 1) return Math.max(top, offset - step);
  return null;
}
export function createCommentsPanel(
  doc,
  win,
  hooks = {},
  client = createCommentsClient(win)
) {
  if (win.__ytafComments) return win.__ytafComments;
  let panel = null,
    buttons = [],
    focus = 0,
    held = null,
    ignoreClickUntil = 0,
    releaseKey = null,
    releaseUntil = 0;
  let videoId = null,
    generation = 0,
    poll = null,
    busy = false,
    status = '',
    sort = 'top',
    view = 'list',
    offset = 0,
    viewport = null,
    content = null,
    parentPosition = null,
    heldAt = 0;
  let comments = [],
    next = null,
    count = '',
    selected = null,
    replies = [],
    replyNext = null;
  const usedTokens = new Set(),
    replyTokens = new Set();
  let retry = null;
  const api = { isOpen: () => Boolean(panel), open, close, handleKey };
  win.__ytafComments = api;
  function currentId() {
    return getCurrentVideoId(win, doc, false);
  }
  function cancel() {
    generation++;
    client.cancel();
    busy = false;
    retry = null;
  }
  function stillCurrent() {
    if (!panel) return false;
    if (videoId === null || currentId() === videoId) return true;
    cancel();
    videoId = null;
    comments = [];
    replies = [];
    selected = null;
    next = replyNext = null;
    view = 'list';
    offset = 0;
    status = 'Video changed. Choose Load current video.';
    render();
    return false;
  }
  function watchVideo() {
    if (!panel) return;
    stillCurrent();
    poll = win.setTimeout(watchVideo, 1000);
  }
  function open(remote = false) {
    if (panel) return;
    panel = doc.createElement('div');
    panel.className = 'ytaf-comments-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Comments');
    held = remote ? 13 : null;
    ignoreClickUntil = remote ? Date.now() + 1000 : 0;
    hooks.beforeOpen?.();
    win.__ytafSponsorPrompt?.dismiss();
    (doc.body || doc.documentElement).appendChild(panel);
    reset();
    watchVideo();
  }
  function close(returnToMenu = false) {
    if (!panel) return;
    cancel();
    if (poll !== null) win.clearTimeout(poll);
    poll = null;
    const closing = panel;
    panel = null;
    viewport = content = parentPosition = null;
    offset = 0;
    buttons = [];
    closing.parentNode?.removeChild(closing);
    videoId = null;
    next = replyNext = null;
    count = status = '';
    comments = [];
    replies = [];
    selected = null;
    usedTokens.clear();
    replyTokens.clear();
    if (held !== null) {
      releaseKey = held;
      releaseUntil = Date.now() + 1500;
    }
    held = null;
    if (returnToMenu) hooks.returnToMenu?.();
    else hooks.afterClose?.();
  }
  function reset() {
    cancel();
    videoId = currentId();
    comments = [];
    replies = [];
    next = replyNext = null;
    selected = null;
    usedTokens.clear();
    replyTokens.clear();
    view = 'list';
    offset = 0;
    parentPosition = null;
    count = '';
    focus = 0;
    if (!videoId) {
      status = 'Play a video before opening comments.';
      render();
      return;
    }
    request(null, false, true);
  }
  async function request(token, forReplies, initial = false) {
    if (busy || !stillCurrent() || !videoId) return;
    const limit = forReplies ? 100 : 200;
    if ((forReplies ? replies : comments).length >= limit) {
      status = 'Display limit reached. Reopen comments to start again.';
      render();
      return;
    }
    const tokens = forReplies ? replyTokens : usedTokens;
    if (tokens.size >= 20) {
      status = 'Page limit reached. Reopen comments to start again.';
      if (forReplies) replyNext = null;
      else next = null;
      render();
      return;
    }
    if (token && tokens.has(token)) {
      status = 'YouTube repeated this page. No further page was loaded.';
      if (forReplies) replyNext = null;
      else next = null;
      render();
      return;
    }
    const ticket = generation;
    busy = true;
    status = 'Loading comments…';
    retry = null;
    render();
    try {
      const result = await client.load(videoId, sort, token);
      if (ticket !== generation || !stillCurrent()) return;
      busy = false;
      if (token) tokens.add(token);
      const target = forReplies ? replies : comments,
        seen = new Set(target.map((item) => item.id));
      const previousLength = target.length;
      const weight = (item) =>
        item.text.length +
        item.replies.reduce((sum, reply) => sum + reply.text.length, 0);
      let stored =
          comments.reduce((sum, item) => sum + weight(item), 0) +
          replies.reduce((sum, item) => sum + weight(item), 0),
        limited = false;
      for (const item of result.comments) {
        if (!seen.has(item.id) && target.length < limit) {
          if (stored + weight(item) > 500000) {
            limited = true;
            break;
          }
          stored += weight(item);
          target.push(item);
          seen.add(item.id);
        }
      }
      if (forReplies)
        replyNext = target.length < limit && !limited ? result.next : null;
      else {
        next = target.length < limit && !limited ? result.next : null;
        count = result.count || count;
      }
      status =
        result.message ||
        (target.length
          ? ''
          : 'No comments returned. They may be disabled or unavailable for this video.');
      if (target.length >= limit || limited) status = 'Display limit reached.';
      const firstAdded = target[previousLength];
      if (initial) offset = 0;
      render(
        firstAdded ? 'comment:' + firstAdded.id : null,
        Boolean(firstAdded)
      );
    } catch (error) {
      if (ticket !== generation || !panel) return;
      busy = false;
      if (!stillCurrent()) return;
      status =
        error.message === 'cancelled' ? 'Loading cancelled.' : error.message;
      retry = () => request(token, forReplies, initial);
      render();
    }
  }
  function back() {
    if (view !== 'replies') {
      close(true);
      return;
    }
    cancel();
    view = 'list';
    status = '';
    offset = parentPosition?.offset || 0;
    render(parentPosition?.key);
  }
  function openReplies(item) {
    if (busy) return;
    parentPosition = { offset, key: buttons[focus]?.key };
    selected = item;
    replyTokens.clear();
    view = 'replies';
    offset = 0;
    replies = selected.replies.slice(0, 100);
    replyNext = selected.replyToken;
    status = '';
    focus = 0;
    render(replies.length ? 'comment:' + replies[0].id : null, true);
    if (!replies.length && replyNext) request(replyNext, true);
  }
  function register(node, key, action = null, readable = false) {
    const index = buttons.length;
    buttons.push({ node, key, action, readable });
    node.tabIndex = 0;
    node.addEventListener('focus', () => {
      focus = index;
    });
    node.addEventListener('click', () => {
      if (Date.now() < ignoreClickUntil) return;
      focus = index;
      node.focus();
      action?.();
    });
    return node;
  }
  function button(label, key, action, parent) {
    const node = register(doc.createElement('button'), key, action);
    node.textContent = label;
    parent.appendChild(node);
    return node;
  }
  function height() {
    return (
      viewport?.clientHeight ||
      viewport?.getBoundingClientRect?.().height ||
      300
    );
  }
  function bounds(node) {
    const box = node.getBoundingClientRect?.(),
      origin = content?.getBoundingClientRect?.();
    if (!box || !origin) return { top: 0, bottom: 0 };
    return { top: box.top - origin.top, bottom: box.bottom - origin.top };
  }
  function applyOffset() {
    if (!viewport || !content) return;
    const total =
      content.scrollHeight ||
      content.offsetHeight ||
      content.getBoundingClientRect?.().height ||
      0;
    offset = Math.max(0, Math.min(offset, Math.max(0, total - height())));
    // Cobalt can reset scrollTop on focus. Position the content explicitly,
    // as the existing GREEN menu does, and keep the native scroller at zero.
    content.style.top = `${-offset}px`;
    viewport.scrollTop = 0;
  }
  function focusSelected(align = false, direction = 1) {
    focus = Math.max(0, Math.min(focus, buttons.length - 1));
    const entry = buttons[focus];
    if (!entry) return;
    if (align && content?.contains(entry.node)) {
      const box = bounds(entry.node),
        size = height();
      if (entry.readable && box.bottom - box.top > size) {
        offset = direction < 0 ? box.bottom - size : box.top;
      } else if (box.top < offset) offset = box.top;
      else if (box.bottom > offset + size) offset = box.bottom - size;
    }
    entry.node.focus();
    applyOffset();
  }
  function move(direction, skipText = false) {
    const entry = buttons[focus];
    if (entry?.readable && !skipText) {
      const box = bounds(entry.node);
      const target = readingScrollStep(
        offset,
        height(),
        box.top,
        box.bottom,
        direction
      );
      if (target !== null) {
        offset = target;
        applyOffset();
        return;
      }
    }
    const nextFocus = Math.max(
      0,
      Math.min(buttons.length - 1, focus + direction)
    );
    if (nextFocus === focus) return;
    focus = nextFocus;
    focusSelected(true, direction);
  }
  function render(preferredKey = null, align = false) {
    if (!panel) return;
    const oldFocus = focus,
      key = preferredKey || buttons[focus]?.key;
    buttons = [];
    viewport = content = null;
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    const heading = doc.createElement('div');
    heading.className = 'ytaf-comments-heading';
    heading.textContent = view === 'replies' ? 'Replies' : 'Comments';
    panel.appendChild(heading);
    const help = doc.createElement('div');
    help.className = 'ytaf-comments-help';
    help.textContent =
      'Wheel / ↑ / ↓: scroll · ← / →: controls/comments · OK: replies/actions · BACK: return · GREEN: settings';
    panel.appendChild(help);
    const toolbar = doc.createElement('div');
    toolbar.className = 'ytaf-comments-toolbar';
    panel.appendChild(toolbar);
    button(
      view === 'list' ? 'Back to settings' : 'Back to comments',
      'back',
      back,
      toolbar
    );
    if (!videoId) button('Load current video', 'reload', reset, toolbar);
    if (view === 'list' && videoId)
      button(
        sort === 'top' ? 'Sort: Top comments' : 'Sort: Newest first',
        'sort',
        () => {
          if (!busy) {
            sort = sort === 'top' ? 'newest' : 'top';
            reset();
          }
        },
        toolbar
      );
    if (retry) button('Retry', 'retry', () => retry?.(), toolbar);
    const list = view === 'replies' ? replies : comments;
    const state = doc.createElement('div');
    state.className = 'ytaf-comments-status';
    state.setAttribute('aria-live', 'polite');
    state.textContent =
      status ||
      `${view === 'list' && count ? count + ' · ' : ''}${list.length} loaded`;
    panel.appendChild(state);
    viewport = doc.createElement('div');
    viewport.className = 'ytaf-comments-viewport';
    content = doc.createElement('div');
    content.className = 'ytaf-comments-content';
    viewport.appendChild(content);
    panel.appendChild(viewport);
    // Derive the reading area from the real header, including wrapped status text.
    const stateBox = state.getBoundingClientRect?.(),
      panelBox = panel.getBoundingClientRect?.();
    viewport.style.top = `${stateBox && panelBox ? stateBox.bottom - panelBox.top + 10 : 180}px`;
    for (const item of list) {
      const wrapper = doc.createElement('div');
      wrapper.className = 'ytaf-comment-entry';
      const card = register(
        doc.createElement('div'),
        'comment:' + item.id,
        null,
        true
      );
      card.className = 'ytaf-comment-card';
      const meta = doc.createElement('div');
      meta.className = 'ytaf-comment-meta';
      meta.textContent = `${item.pinned ? '[Pinned] ' : ''}${item.author} · ${item.published}${item.likes ? ' · ♥ ' + item.likes : ''}`;
      const body = doc.createElement('div');
      body.className = 'ytaf-comment-body';
      body.textContent = item.text;
      card.appendChild(meta);
      card.appendChild(body);
      wrapper.appendChild(card);
      if (view === 'list' && (item.replyToken || item.replies.length))
        button(
          'Read replies',
          'replies:' + item.id,
          () => openReplies(item),
          wrapper
        );
      content.appendChild(wrapper);
    }
    if (view === 'replies' ? replyNext : next)
      button(
        busy ? 'Loading…' : 'Load more',
        'more',
        () => {
          request(view === 'replies' ? replyNext : next, view === 'replies');
        },
        content
      );
    const found = buttons.findIndex((entry) => entry.key === key);
    focus = found >= 0 ? found : Math.min(oldFocus, buttons.length - 1);
    focusSelected(align);
  }
  function handleKey(event) {
    const code =
      event.keyCode ||
      event.which ||
      {
        Enter: 13,
        Escape: 27,
        ArrowUp: 38,
        ArrowDown: 40,
        ArrowLeft: 37,
        ArrowRight: 39
      }[event.key];
    if (!panel) {
      if (
        releaseKey !== null &&
        code === releaseKey &&
        Date.now() < releaseUntil
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.type === 'keyup') releaseKey = null;
        return true;
      }
      releaseKey = null;
      return false;
    }
    // The standard media keys remain available while reading.
    if ([19, 179, 415, 413].includes(code) || /^Media/.test(event.key || ''))
      return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'keyup') {
      held = null;
      ignoreClickUntil = Date.now() + 800;
      return true;
    }
    if (event.type !== 'keydown') return true;
    const arrow = [37, 38, 39, 40].includes(code);
    if (held !== null && (!arrow || held !== code || Date.now() - heldAt < 140))
      return true;
    if (event.repeat && !arrow) return true;
    heldAt = Date.now();
    held = code || event.key;
    ignoreClickUntil = Date.now() + 800;
    if (!stillCurrent()) return true;
    if ([404, 172].includes(code) || event.key === '=') {
      close(true);
      return true;
    }
    if ([27, 461, 8].includes(code)) {
      back();
      return true;
    }
    if (code === 38 || code === 40) move(code === 38 ? -1 : 1);
    else if (code === 37 || code === 39) move(code === 37 ? -1 : 1, true);
    else if (code === 13) buttons[focus]?.action?.();
    return true;
  }
  doc.addEventListener(
    'wheel',
    (event) => {
      if (!panel || event.ctrlKey) return;
      const delta = wheelScrollDelta(event, height());
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      if (!stillCurrent()) return;
      offset += delta;
      applyOffset();
      // Keep keyboard focus on the visible content when switching from the wheel.
      const index = buttons.findIndex(
        (entry) =>
          content?.contains(entry.node) &&
          bounds(entry.node).bottom > offset + 10 &&
          bounds(entry.node).top < offset + height()
      );
      if (index >= 0) {
        focus = index;
        focusSelected();
      }
    },
    { capture: true, passive: false }
  );
  doc.addEventListener(
    'focus',
    (event) => {
      if (panel && !panel.contains(event.target)) focusSelected();
    },
    true
  );
  win.addEventListener('hashchange', () => {
    if (panel) stillCurrent();
  });
  doc.addEventListener('yt-navigate-finish', () => {
    if (panel) stillCurrent();
  });
  return api;
}
export function createCommentsSetting(doc, win, hooks) {
  const api = createCommentsPanel(doc, win, hooks),
    row = doc.createElement('div'),
    button = doc.createElement('div');
  button.id = '__comments';
  button.tabIndex = 904;
  button.dataset.ytafControl = 'action';
  button.className = 'ytaf-diagnostic-action';
  button.setAttribute('role', 'button');
  button.textContent = 'Comments for this video';
  button.__ytafActivate = () => api.open(true);
  button.addEventListener('click', () => {
    if (Number(row.dataset.ytafIgnoreClickUntil || 0) <= Date.now())
      api.open(false);
  });
  row.appendChild(button);
  return row;
}
