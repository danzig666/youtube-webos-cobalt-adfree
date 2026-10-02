export const validCommentVideoId = (id) =>
  typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
export function commentText(value, limit = 12000) {
  const text =
    typeof value === 'string'
      ? value
      : typeof value?.simpleText === 'string'
        ? value.simpleText
        : typeof value?.content === 'string'
          ? value.content
          : Array.isArray(value?.runs)
            ? value.runs
                .slice(0, 500)
                .map((run) => (typeof run.text === 'string' ? run.text : ''))
                .join('')
            : '';
  return text
    .replace(
      /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
      ''
    )
    .slice(0, limit);
}
export function validCommentToken(token) {
  return (
    typeof token === 'string' &&
    token.length > 0 &&
    token.length <= 16384 &&
    !/[\u0000-\u0020]/.test(token)
  );
}
// Minimal encoding of the public reverse-engineered GetCommentsSectionParams
// schema. All strings here are fixed ASCII or a validated YouTube video ID.
export function initialCommentsToken(id, sort, btoaFunction) {
  if (!validCommentVideoId(id)) throw new Error('Invalid video');
  const str = (value) => Array.from(value, (c) => c.charCodeAt(0));
  const field = (tag, bytes) => [tag, bytes.length, ...bytes];
  const options = [
    ...field(34, str(id)),
    ...(sort === 'newest' ? [48, 1] : []),
    120,
    2,
    130,
    1,
    0
  ];
  const params = [...field(34, options), ...field(66, str('comments-section'))];
  const bytes = [...field(18, field(18, str(id))), 24, 6, ...field(50, params)];
  return encodeURIComponent(btoaFunction(String.fromCharCode(...bytes)));
}
function tokenFrom(item) {
  const renderer = item?.continuationItemRenderer;
  const endpoint =
    renderer?.continuationEndpoint ||
    renderer?.button?.buttonRenderer?.command ||
    renderer?.button?.buttonRenderer?.navigationEndpoint;
  const token = endpoint?.continuationCommand?.token;
  return validCommentToken(token) ? token : null;
}
export function parseCommentsPage(data) {
  const entities = new Map();
  for (const mutation of (
    data?.frameworkUpdates?.entityBatchUpdate?.mutations || []
  ).slice(0, 1000)) {
    const entity = mutation?.payload?.commentEntityPayload;
    if (entity && typeof entity.key === 'string')
      entities.set(entity.key, entity);
  }
  function comment(raw, replies) {
    const legacy = raw?.commentRenderer;
    const modern =
      raw?.commentViewModel?.commentViewModel || raw?.commentViewModel;
    const entity = modern && entities.get(modern.commentKey);
    const id = commentText(legacy?.commentId || modern?.commentId, 256);
    const body = commentText(
      legacy?.contentText || entity?.properties?.content
    );
    if (!id || !body) return null;
    const result = {
      id,
      text: body,
      author:
        commentText(
          legacy?.authorText || entity?.author?.displayName,
          160
        ).replace(/\s+/g, ' ') || 'YouTube user',
      published: commentText(
        legacy?.publishedTimeText || entity?.properties?.publishedTime,
        120
      ).replace(/\s+/g, ' '),
      likes: commentText(
        legacy?.voteCount || entity?.toolbar?.likeCountNotliked,
        30
      ).replace(/\s+/g, ' '),
      pinned: Boolean(legacy?.pinnedCommentBadge || modern?.pinnedText),
      replyToken: null,
      replies: []
    };
    const replyData = replies?.commentRepliesRenderer;
    if (replyData) {
      for (const entry of [
        ...(replyData.contents || []),
        ...(replyData.subThreads || [])
      ].slice(0, 50)) {
        result.replyToken = result.replyToken || tokenFrom(entry);
        const thread = entry.commentThreadRenderer;
        const parsed = comment(
          thread?.comment ||
            (thread?.commentViewModel
              ? { commentViewModel: thread.commentViewModel }
              : entry)
        );
        if (parsed) result.replies.push(parsed);
      }
    }
    return result;
  }
  const items = [];
  let recognized = false;
  for (const command of [
    ...(data?.onResponseReceivedEndpoints || []),
    ...(data?.onResponseReceivedActions || [])
  ].slice(0, 30)) {
    const action =
      command.reloadContinuationItemsCommand ||
      command.appendContinuationItemsAction;
    if (Array.isArray(action?.continuationItems)) {
      recognized = true;
      items.push(...action.continuationItems.slice(0, 200));
    }
  }
  const legacy =
    data?.continuationContents?.itemSectionContinuation ||
    data?.continuationContents?.commentRepliesContinuation;
  if (Array.isArray(legacy?.contents)) {
    recognized = true;
    items.push(...legacy.contents.slice(0, 200));
  }
  if (!recognized) throw new Error('Unsupported comments response');
  const comments = [],
    seen = new Set();
  let next = null,
    message = '',
    count = '';
  for (const item of items) {
    const header = item.commentsHeaderRenderer;
    if (header)
      count = commentText(
        header.countText || header.commentsCount,
        100
      ).replace(/\s+/g, ' ');
    if (item.messageRenderer)
      message = commentText(item.messageRenderer.text, 240).replace(
        /\s+/g,
        ' '
      );
    next = tokenFrom(item) || next;
    const thread = item.commentThreadRenderer;
    const parsed = comment(
      thread?.comment ||
        (thread?.commentViewModel
          ? { commentViewModel: thread.commentViewModel }
          : item),
      thread?.replies
    );
    if (parsed && !seen.has(parsed.id) && comments.length < 50) {
      seen.add(parsed.id);
      comments.push(parsed);
    }
  }
  const legacyToken =
    legacy?.continuations?.[0]?.nextContinuationData?.continuation;
  if (!next && validCommentToken(legacyToken)) next = legacyToken;
  return { comments, next, message, count };
}
