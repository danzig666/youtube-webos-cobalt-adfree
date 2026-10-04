const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
export function rememberPlaybackMetadata(win, response) {
  const details = response?.videoDetails || response?.playerResponse?.videoDetails;
  if (!videoIdPattern.test(details?.videoId)) return;
  const responseBody = response?.videoDetails ? response : response.playerResponse;
  const liveDetails = responseBody?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  const old = Array.isArray(win.__ytafPlaybackMetadata) ? win.__ytafPlaybackMetadata : [];
  const previous = old.find(item => item.id === details.videoId);
  // Player responses can arrive in pieces. Missing fields must not erase a
  // confirmed VOD/live classification and disable saving during playback.
  const live = details.isLiveContent === true || liveDetails?.isLiveNow === true ? true :
    details.isLiveContent === false ? false :
      typeof previous?.live === 'boolean' ? previous.live : null;
  // isLiveNow:false alone does not establish VOD: an ended broadcast can still
  // expose DVR playback. Only an explicit isLiveContent:false supplies that fact.
  const duration = ['string', 'number'].includes(typeof details.lengthSeconds)
    ? Number(details.lengthSeconds) : NaN;
  const entry = {id: details.videoId, live,
    duration: Number.isFinite(duration) && duration > 0 ? duration :
      Number.isFinite(previous?.duration) && previous.duration > 0 ? previous.duration : null};
  win.__ytafPlaybackMetadata = [entry, ...old.filter(item => item.id !== entry.id)].slice(0, 8);
}
export function playbackMetadata(win, id) {
  const cached = win.__ytafPlaybackMetadata?.find(item => item.id === id);
  if (cached) return cached;
  rememberPlaybackMetadata(win, win.ytInitialPlayerResponse);
  // Cached responses may arrive before navigation; match the exact current ID.
  return win.__ytafPlaybackMetadata?.find(item => item.id === id) || null;
}
