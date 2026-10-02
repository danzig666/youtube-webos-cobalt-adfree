export const validVideoId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
export function parseBranding(data) {
  if (!data || typeof data !== 'object') return null;
  function best(list) {
    return Array.isArray(list)
      ? list.find(
          (item) =>
            item &&
            (item.locked === true ||
              (typeof item.votes === 'number' && item.votes >= 0))
        )
      : null;
  }
  const title = best(data.titles),
    thumb = best(data.thumbnails);
  const clean =
    title?.original === false && typeof title.title === 'string'
      ? title.title
          .replace(
            /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
            ''
          )
          .trim()
          .slice(0, 300)
      : null;
  const timestamp =
    thumb?.original === false &&
    typeof thumb.timestamp === 'number' &&
    Number.isFinite(thumb.timestamp) &&
    thumb.timestamp >= 0 &&
    thumb.timestamp <= 86400
      ? thumb.timestamp
      : null;
  return { title: clean || null, timestamp };
}
export function thumbnailUrl(id, time) {
  return validVideoId(id) && Number.isFinite(time) && time >= 0 && time <= 86400
    ? `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${id}&time=${time}`
    : null;
}
// Two requests at a time; bounded session-only cache, including misses/failures.
export function createBrandingClient(win) {
  const cache = new Map(),
    active = new Map();
  let generation = 0;
  return {
    clear() {
      generation++;
      for (const entry of active.values()) entry.cancel();
      active.clear();
      cache.clear();
    },
    get(id) {
      if (!validVideoId(id)) return Promise.resolve(null);
      const now = Date.now(),
        cached = cache.get(id);
      if (cached && cached.until > now) {
        cache.delete(id);
        cache.set(id, cached);
        return Promise.resolve(cached.value);
      }
      if (active.has(id)) return active.get(id).promise;
      if (active.size >= 2) return Promise.resolve(null);
      const ticket = generation,
        xhr = new win.XMLHttpRequest();
      let resolve,
        finished = false;
      const promise = new Promise((done) => {
        resolve = done;
      });
      function finish(value) {
        if (finished) return;
        finished = true;
        if (ticket === generation) {
          active.delete(id);
          cache.set(id, {
            value,
            until: Date.now() + (value ? 600000 : 60000)
          });
          while (cache.size > 100) cache.delete(cache.keys().next().value);
        }
        resolve(ticket === generation ? value : null);
      }
      active.set(id, {
        promise,
        cancel() {
          try {
            xhr.abort();
          } catch (_) {}
          finish(null);
        }
      });
      try {
        xhr.open(
          'GET',
          `https://sponsor.ajay.app/api/branding?videoID=${id}`,
          true
        );
        xhr.withCredentials = false;
        xhr.timeout = 8000;
        xhr.onload = () => {
          let value = null;
          try {
            if (xhr.status === 200 && xhr.responseText.length <= 65536)
              value = parseBranding(JSON.parse(xhr.responseText));
          } catch (_) {}
          finish(value);
        };
        xhr.onerror = xhr.ontimeout = xhr.onabort = () => finish(null);
        xhr.send();
      } catch (_) {
        finish(null);
      }
      return promise;
    }
  };
}
