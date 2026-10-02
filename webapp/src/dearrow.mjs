import {
  createBrandingClient,
  validVideoId,
  thumbnailUrl
} from './dearrow-client.mjs';
const cardSelector =
  'ytlr-tile-renderer, ytlr-grid-video-renderer, ytd-rich-grid-media, ytd-video-renderer';
const titleSelector =
  '[id="video-title"], .ytlr-tile-renderer__title, .tile-title, h3';
export function videoIdFromUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(
    /(?:[?&]v=|\/(?:vi|vi_webp|shorts)\/)([A-Za-z0-9_-]{11})(?=[?&#/]|$)/
  );
  return match ? match[1] : null;
}
export function cardVideoId(card) {
  const explicit = card.getAttribute('data-video-id');
  if (validVideoId(explicit)) return explicit;
  const link = card.querySelector('a[href]'),
    href = link?.getAttribute('href');
  if (href) {
    const id = videoIdFromUrl(href);
    if (id) return id;
  }
  for (const image of card.querySelectorAll('img')) {
    const src = image.getAttribute('src') || '';
    if (/^https:\/\/(?:i|i\d)\.ytimg\.com\//.test(src)) {
      const id = videoIdFromUrl(src);
      if (id) return id;
    }
    const branded = src.match(
      /^https:\/\/dearrow-thumb\.ajay\.app\/api\/v1\/getThumbnail\?videoID=([A-Za-z0-9_-]{11})&/
    );
    if (branded) return branded[1];
  }
  return null;
}
export function startDeArrow(doc, win, read) {
  if (win.__ytafDeArrow) return win.__ytafDeArrow;
  const client = createBrandingClient(win),
    records = new Map();
  const connected = (card) => Boolean(doc.documentElement?.contains(card));
  let generation = 0,
    timer = null,
    paused = false,
    currentMode = 'off';
  const api = {
    render() {},
    status: 'DeArrow is off.',
    paused: () => paused,
    toggleOriginals() {
      paused = !paused;
      configure();
    },
    scan
  };
  win.__ytafDeArrow = api;
  function restore(card, record) {
    record.cancelImage?.();
    record.removeImageHandler?.();
    if (record.title && record.title.textContent === record.changedTitle)
      record.title.textContent = record.originalTitle;
    if (record.image && record.image.getAttribute('src') === record.changedSrc)
      record.image.setAttribute('src', record.originalSrc);
    records.delete(card);
  }
  function configure() {
    generation++;
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    client.clear();
    for (const [card, record] of records) restore(card, record);
    currentMode = ['titles', 'both'].includes(read('dearrowMode'))
      ? read('dearrowMode')
      : 'off';
    api.status =
      currentMode === 'off'
        ? 'DeArrow is off.'
        : paused
          ? 'Showing original titles and thumbnails.'
          : 'DeArrow enabled. Original content stays when no replacement is available.';
    api.render();
    if (currentMode !== 'off' && !paused) scan();
  }
  function apply(card, id, result, ticket, expectedTitle, expectedImage) {
    if (
      !result ||
      ticket !== generation ||
      !connected(card) ||
      cardVideoId(card) !== id
    )
      return;
    let record = records.get(card);
    if (record?.id !== id) {
      if (record) restore(card, record);
      record = null;
    }
    if (!record) {
      record = { id };
      records.set(card, record);
    }
    const title = card.querySelector(titleSelector);
    if (
      result.title &&
      title &&
      title.children.length === 0 &&
      title.textContent === expectedTitle &&
      !record.title
    ) {
      record.title = title;
      record.originalTitle = title.textContent;
      record.changedTitle = result.title;
      title.textContent = result.title; // Remote text is never interpreted as markup.
    }
    const image = card.querySelector('img');
    if (
      currentMode !== 'both' ||
      result.timestamp === null ||
      !image ||
      record.image ||
      record.thumbnailFailed ||
      record.cancelImage ||
      image.getAttribute('srcset') ||
      image.getAttribute('src') !== expectedImage ||
      videoIdFromUrl(expectedImage) !== id
    )
      return;
    const url = thumbnailUrl(id, result.timestamp);
    if (!url) return;
    const probe = new win.Image();
    let timeout = null;
    function clear() {
      probe.onload = probe.onerror = null;
      if (timeout !== null) win.clearTimeout(timeout);
      record.cancelImage = null;
    }
    record.cancelImage = () => {
      clear();
      probe.src = '';
    };
    probe.crossOrigin = 'anonymous';
    probe.referrerPolicy = 'no-referrer';
    probe.onload = () => {
      clear();
      if (
        ticket !== generation ||
        !connected(card) ||
        cardVideoId(card) !== id ||
        image.getAttribute('src') !== expectedImage
      )
        return;
      record.image = image;
      record.originalSrc = expectedImage;
      record.changedSrc = url;
      const failed = () => {
        if (image.getAttribute('src') === url && cardVideoId(card) === id) {
          image.setAttribute('src', expectedImage);
          record.image = null;
          record.thumbnailFailed = true;
        }
        image.removeEventListener('error', failed);
      };
      image.addEventListener('error', failed);
      record.removeImageHandler = () => image.removeEventListener('error', failed);
      image.setAttribute('src', url);
    };
    probe.onerror = () => {
      clear();
      record.thumbnailFailed = true;
    };
    timeout = win.setTimeout(() => {
      record.cancelImage?.();
      record.thumbnailFailed = true;
    }, 8000);
    probe.src = url;
  }
  function scan() {
    if (currentMode === 'off' || paused) return;
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    for (const [card, record] of records) {
      if (
        !connected(card) ||
        cardVideoId(card) !== record.id ||
        (record.title && record.title.textContent !== record.changedTitle) ||
        (record.image && record.image.getAttribute('src') !== record.changedSrc)
      )
        restore(card, record);
    }
    if (!doc.hidden) {
      const cards = Array.from(doc.querySelectorAll(cardSelector)).slice(
        0,
        100
      );
      let count = 0;
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.bottom <= 0 ||
          rect.top >= win.innerHeight ||
          rect.right <= 0 ||
          rect.left >= win.innerWidth
        )
          continue;
        const id = cardVideoId(card);
        if (!id) continue;
        if (++count > 30) break;
        const record = records.get(card);
        if (
          record?.title &&
          (currentMode === 'titles' ||
            record.image ||
            record.thumbnailFailed ||
            record.cancelImage)
        )
          continue;
        const title = card.querySelector(titleSelector)?.textContent,
          image = card.querySelector('img')?.getAttribute('src');
        const ticket = generation;
        client
          .get(id)
          .then((result) => apply(card, id, result, ticket, title, image));
      }
    }
    while (records.size > 100) {
      const [card, record] = records.entries().next().value;
      restore(card, record);
    }
    timer = win.setTimeout(scan, 2000);
  }
  doc.addEventListener('ytaf-config-changed', (event) => {
    if (event.detail?.key === 'dearrowMode') {
      paused = false;
      configure();
    }
  });
  doc.addEventListener('visibilitychange', () => {
    if (!doc.hidden) scan();
  });
  configure();
  return api;
}
export function createDeArrowSettings(doc, win, choices, read, write) {
  const api = startDeArrow(doc, win, read),
    panel = doc.createElement('div');
  panel.appendChild(
    choices.add(
      '__dearrow_mode',
      'DeArrow (community titles / thumbnails)',
      read('dearrowMode'),
      [
        { value: 'off', label: 'Off' },
        { value: 'titles', label: 'Titles only' },
        { value: 'both', label: 'Titles and thumbnails' }
      ],
      (value) => write('dearrowMode', value)
    )
  );
  const help = doc.createElement('div');
  help.className = 'ytaf-setting-help';
  help.textContent =
    'Optional: sends visible video IDs to sponsor.ajay.app; thumbnails also use dearrow-thumb.ajay.app. No account credentials are sent. Only supported video cards change. Missing data keeps originals.';
  const status = doc.createElement('div');
  status.className = 'ytaf-setting-help';
  const row = doc.createElement('div'),
    button = doc.createElement('div');
  button.id = '__dearrow_originals';
  button.tabIndex = 903;
  button.dataset.ytafControl = 'action';
  button.className = 'ytaf-diagnostic-action';
  button.setAttribute('role', 'button');
  button.__ytafActivate = () => api.toggleOriginals();
  button.addEventListener('click', () => {
    if (Number(row.dataset.ytafIgnoreClickUntil || 0) <= Date.now())
      api.toggleOriginals();
  });
  api.render = () => {
    status.textContent = api.status;
    button.textContent = api.paused()
      ? 'Resume DeArrow'
      : 'Show original titles and thumbnails';
  };
  api.render();
  row.appendChild(button);
  panel.appendChild(help);
  panel.appendChild(status);
  panel.appendChild(row);
  return panel;
}
