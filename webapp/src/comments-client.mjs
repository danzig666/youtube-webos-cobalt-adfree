import {
  initialCommentsToken,
  parseCommentsPage,
  validCommentToken,
  validCommentVideoId
} from './comments-data.mjs';
// WEB identity from YouTube.js Constants at bad89d2657e88f907011655f199fba9fb615c339.
const fallbackVersion = '2.20260623.01.00';
export function commentsContext(win) {
  let config = {};
  try {
    config = win.ytcfg?.get?.('INNERTUBE_CONTEXT')?.client || {};
  } catch (_) {}
  return {
    client: {
      clientName: 'WEB',
      clientVersion:
        config.clientName === 'WEB' &&
        /^2\.\d{8}\.\d{2}\.\d{2}$/.test(config.clientVersion)
          ? config.clientVersion
          : fallbackVersion,
      hl: /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(config.hl) ? config.hl : 'en',
      gl: /^[A-Z]{2}$/.test(config.gl) ? config.gl : 'US'
    }
  };
}
export function createCommentsClient(win) {
  let cancelPending = null;
  return {
    cancel() {
      cancelPending?.();
    },
    load(id, sort = 'top', continuation = null) {
      cancelPending?.();
      if (!validCommentVideoId(id))
        return Promise.reject(
          new Error('Play a video before opening comments.')
        );
      if (continuation !== null && !validCommentToken(continuation))
        return Promise.reject(
          new Error('Invalid comment page. Reopen comments.')
        );
      const context = commentsContext(win),
        token =
          continuation ||
          initialCommentsToken(id, sort, (value) => win.btoa(value));
      return new Promise((resolve, reject) => {
        const xhr = new win.XMLHttpRequest();
        let complete = false;
        function finish(error, value) {
          if (complete) return;
          complete = true;
          cancelPending = null;
          error ? reject(error) : resolve(value);
        }
        cancelPending = () => {
          finish(new Error('cancelled'));
          try {
            xhr.abort();
          } catch (_) {}
        };
        try {
          // Same-origin read request only. Never replay arbitrary server commands or URLs.
          xhr.open('POST', '/youtubei/v1/next?prettyPrint=false', true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.setRequestHeader('X-YouTube-Client-Name', '1');
          xhr.setRequestHeader(
            'X-YouTube-Client-Version',
            context.client.clientVersion
          );
          xhr.timeout = 12000;
          xhr.onload = () => {
            if (xhr.status !== 200) {
              finish(
                new Error(
                  'YouTube comments could not be loaded. Try again later.'
                )
              );
              return;
            }
            if (xhr.responseText.length > 2097152) {
              finish(new Error('Comment response is too large.'));
              return;
            }
            try {
              finish(null, parseCommentsPage(JSON.parse(xhr.responseText)));
            } catch (_) {
              finish(
                new Error(
                  'This YouTube comment format is unavailable. Try again later.'
                )
              );
            }
          };
          xhr.onerror = xhr.ontimeout = () =>
            finish(
              new Error('Comments connection failed or timed out. Try again.')
            );
          xhr.onabort = () => finish(new Error('cancelled'));
          xhr.send(JSON.stringify({ context, continuation: token }));
        } catch (_) {
          finish(new Error('Comments are unavailable in this client.'));
        }
      });
    }
  };
}
