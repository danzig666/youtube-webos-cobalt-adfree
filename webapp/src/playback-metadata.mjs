const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
export function rememberPlaybackMetadata(win, response) {
  const details = response?.videoDetails || response?.playerResponse?.videoDetails;
  if (!videoIdPattern.test(details?.videoId)) return;
  const responseBody = response?.videoDetails ? response : response.playerResponse;
  const liveDetails = responseBody?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  const live = details.isLiveContent === true || liveDetails?.isLiveNow === true;
  const known = live || details.isLiveContent === false;
  const duration = Number(details.lengthSeconds);
  const entry = {id: details.videoId, live: known ? live : null,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null};
  const old = Array.isArray(win.__ytafPlaybackMetadata) ? win.__ytafPlaybackMetadata : [];
  win.__ytafPlaybackMetadata = [entry, ...old.filter(item => item.id !== entry.id)].slice(0, 8);
}
export function playbackMetadata(win, id) {
  const cached = win.__ytafPlaybackMetadata?.find(item => item.id === id);
  if (cached) return cached;
  rememberPlaybackMetadata(win, win.ytInitialPlayerResponse);
  // Cached responses may arrive before navigation; match the exact current ID.
  return win.__ytafPlaybackMetadata?.find(item => item.id === id) || null;
}
