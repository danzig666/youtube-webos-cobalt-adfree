import { getCurrentVideoId } from './sponsorblock-channels.mjs';
import { createCommentsClient } from './comments-client.mjs';
const pageSize = 3;
export function commentTextPages(text) {
  const pages = [];
  let part = '',
    count = 0,
    lines = 0;
  for (const char of Array.from(text)) {
    part += char;
    count++;
    if (char === '\n') lines++;
    if (count >= 300 || lines >= 4) {
      const space = part.lastIndexOf(' ');
      const split = lines < 4 && space > 0 && part.length - space < 40 ? space + 1 : part.length;
      pages.push(part.slice(0, split));
      part = part.slice(split);
      count = Array.from(part).length;
      lines = (part.match(/\n/g) || []).length;
    }
  }
  if (part || !pages.length) pages.push(part);
  return pages;
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
    page = 0,
    replyPage = 0,
    textPage = 0;
  let comments = [],
    next = null,
    count = '',
    selected = null,
    replySelected = null,
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
    selected = replySelected = null;
    next = replyNext = null;
    view = 'list';
    page = 0;
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
    buttons = [];
    closing.parentNode?.removeChild(closing);
    videoId = null;
    next = replyNext = null;
    count = status = '';
    comments = [];
    replies = [];
    selected = replySelected = null;
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
    selected = replySelected = null;
    usedTokens.clear();
    replyTokens.clear();
    view = 'list';
    page = replyPage = textPage = 0;
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
      if (initial) focus = 0;
      render();
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
    if (view === 'replyDetail') {
      view = 'replies';
      textPage = 0;
    } else if (view === 'replies') {
      cancel();
      view = 'detail';
      textPage = 0;
    } else if (view === 'detail') {
      view = 'list';
      textPage = 0;
    } else {
      close(true);
      return;
    }
    focus = 0;
    status = '';
    render();
  }
  function openReplies() {
    if (!selected || busy) return;
    replyTokens.clear();
    view = 'replies';
    replyPage = 0;
    replies = selected.replies.slice(0, 100);
    replyNext = selected.replyToken;
    status = '';
    focus = 0;
    render();
    if (!replies.length && replyNext) request(replyNext, true);
  }
  function button(label, action, parent = panel) {
    const node = doc.createElement('button');
    node.textContent = label;
    node.tabIndex = 0;
    const index = buttons.length;
    buttons.push({ node, action });
    node.addEventListener('click', () => {
      if (Date.now() < ignoreClickUntil) return;
      focus = index;
      action();
    });
    node.addEventListener('focus', () => {
      focus = index;
    });
    parent.appendChild(node);
    return node;
  }
  function focusSelected() {
    focus = Math.max(0, Math.min(focus, buttons.length - 1));
    buttons[focus]?.node.focus();
  }
  function render() {
    if (!panel) return;
    buttons = [];
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    const heading = doc.createElement('div');
    heading.className = 'ytaf-comments-heading';
    heading.textContent =
      view === 'replies' || view === 'replyDetail' ? 'Replies' : 'Comments';
    panel.appendChild(heading);
    const help = doc.createElement('div');
    help.className = 'ytaf-comments-help';
    help.textContent =
      '↑ / ↓: choose · OK: open · ← / →: page · BACK: return · GREEN: settings';
    panel.appendChild(help);
    const toolbar = doc.createElement('div');
    toolbar.className = 'ytaf-comments-toolbar';
    panel.appendChild(toolbar);
    button(view === 'list' ? 'Back to settings' : 'Back', back, toolbar);
    if (!videoId) button('Load current video', reset, toolbar);
    if (view === 'list' && videoId)
      button(
        sort === 'top' ? 'Sort: Top comments' : 'Sort: Newest first',
        () => {
          if (!busy) {
            sort = sort === 'top' ? 'newest' : 'top';
            reset();
          }
        },
        toolbar
      );
    if (retry) button('Retry', () => retry?.(), toolbar);
    const state = doc.createElement('div');
    state.className = 'ytaf-comments-status';
    state.setAttribute('aria-live', 'polite');
    state.textContent = status || count;
    panel.appendChild(state);
    if (view === 'detail' || view === 'replyDetail') {
      const item = view === 'detail' ? selected : replySelected;
      if (item) {
        const textPages = commentTextPages(item.text),
          total = textPages.length;
        textPage = Math.min(textPage, total - 1);
        const body = doc.createElement('div');
        body.className = 'ytaf-comment-detail';
        body.textContent = `${item.author.slice(0, 80)} · ${item.published.slice(0, 60)}${item.likes ? ' · ♥ ' + item.likes : ''}\n\n${textPages[textPage]}`;
        panel.appendChild(body);
        const nav = doc.createElement('div');
        nav.className = 'ytaf-comments-toolbar';
        panel.appendChild(nav);
        if (textPage > 0) button('Previous text', () => changePage(-1), nav);
        if (textPage + 1 < total) button('More text', () => changePage(1), nav);
        if (view === 'detail' && (item.replyToken || item.replies.length))
          button('Read replies', openReplies, nav);
        state.textContent = status || `Text ${textPage + 1} / ${total}`;
      }
    } else {
      const list = view === 'replies' ? replies : comments,
        index = view === 'replies' ? replyPage : page;
      for (const item of list.slice(index * pageSize, (index + 1) * pageSize)) {
        const row = button(
          `${item.pinned ? '[Pinned] ' : ''}${item.author.slice(0, 80)} · ${item.published.slice(0, 60)}${item.likes ? ' · ♥ ' + item.likes : ''}\n${item.text.replace(/\s+/g, ' ').slice(0, 150)}${item.text.length > 150 ? '…' : ''}`,
          () => {
            if (busy) return;
            if (view === 'replies') {
              replySelected = item;
              view = 'replyDetail';
            } else {
              selected = item;
              view = 'detail';
            }
            textPage = 0;
            focus = 0;
            render();
          }
        );
        row.className = 'ytaf-comment-row';
      }
      const nav = doc.createElement('div');
      nav.className = 'ytaf-comments-toolbar';
      panel.appendChild(nav);
      if (index > 0) button('Previous page', () => changePage(-1), nav);
      if ((index + 1) * pageSize < list.length)
        button('Next page', () => changePage(1), nav);
      else if ((view === 'replies' ? replyNext : next) && !busy)
        button(
          'Load more',
          () =>
            request(view === 'replies' ? replyNext : next, view === 'replies'),
          nav
        );
      if (list.length)
        state.textContent =
          status ||
          `${count ? count + ' · ' : ''}Page ${index + 1} / ${Math.ceil(list.length / pageSize)} · ${list.length} loaded`;
    }
    focusSelected();
  }
  function changePage(direction) {
    if (busy) return;
    if (view === 'detail' || view === 'replyDetail') {
      const item = view === 'detail' ? selected : replySelected;
      textPage = Math.max(
        0,
        Math.min(commentTextPages(item.text).length - 1, textPage + direction)
      );
    } else {
      const list = view === 'replies' ? replies : comments,
        max = Math.max(0, Math.ceil(list.length / pageSize) - 1);
      if (view === 'replies')
        replyPage = Math.max(0, Math.min(max, replyPage + direction));
      else page = Math.max(0, Math.min(max, page + direction));
    }
    focus = 0;
    render();
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
    if (event.type !== 'keydown' || held !== null || event.repeat) return true;
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
    if (code === 38 || code === 40) {
      focus =
        (focus + (code === 38 ? -1 : 1) + buttons.length) % buttons.length;
      focusSelected();
    } else if (code === 37 || code === 39) changePage(code === 37 ? -1 : 1);
    else if (code === 13) buttons[focus]?.action();
    return true;
  }
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
