const channelPattern = /^UC[A-Za-z0-9_-]{22}$/;
const videoPattern = /^[A-Za-z0-9_-]{11}$/;
export const channelExclusionsKey = 'sponsorBlockExcludedChannels';
export const maximumChannelExclusions = 200;

export function normalizeChannelExclusions(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const entry of value) {
    if (!entry || !channelPattern.test(entry.id) || result.some(item => item.id === entry.id)) continue;
    result.push({ id: entry.id, name: typeof entry.name === 'string' ? entry.name.slice(0, 100) : entry.id });
    if (result.length === maximumChannelExclusions) break;
  }
  return result;
}

function channelDetails(details) {
  if (!details || !videoPattern.test(details.videoId) || !channelPattern.test(details.channelId)) return null;
  return { videoId: details.videoId, id: details.channelId,
    name: typeof details.author === 'string' ? details.author.slice(0, 100) : details.channelId };
}

// Keep only public channel metadata for a bounded number of player responses.
// Never persist video IDs, URLs, complete responses or account information.
export function rememberPlayerChannel(win, response) {
  const channel = channelDetails(response?.videoDetails || response?.playerResponse?.videoDetails);
  if (!channel) return;
  const cache = Array.isArray(win.__ytafPlayerChannels) ? win.__ytafPlayerChannels : [];
  win.__ytafPlayerChannels = [channel, ...cache.filter(item => item.videoId !== channel.videoId)].slice(0, 8);
}

export function getCurrentVideoId(win, doc, allowResponseFallback = true) {
  for (const candidate of [win.location?.hash, win.location?.href, win.location?.search]) {
    const pathMatch = String(candidate || '').match(/\/shorts\/([A-Za-z0-9_-]{11})(?:[?&#/]|$)/);
    if (pathMatch) return pathMatch[1];
    const match = String(candidate || '').match(/[?&#]v=([^&#]+)/);
    if (match) {
      try {
        const id = decodeURIComponent(match[1]).replace(/^v=/, '');
        return videoPattern.test(id) ? id : null;
      } catch (_) { return null; }
    }
  }
  try {
    const player = doc?.getElementById?.('ytlr-player__player-container-player') ||
      doc?.querySelector?.('.html5-video-player');
    const liveId = player?.getVideoData?.()?.video_id;
    if (videoPattern.test(liveId)) return liveId;
  } catch (_) { /* A temporarily unavailable player does not confirm an ID. */ }
  if (!allowResponseFallback) return null;
  const id = win.ytInitialPlayerResponse?.videoDetails?.videoId;
  if (videoPattern.test(id)) return id;
  try {
    const raw = win.ytplayer?.config?.args?.player_response;
    const fallback = (typeof raw === 'string' ? JSON.parse(raw) : raw)?.videoDetails?.videoId;
    return videoPattern.test(fallback) ? fallback : null;
  } catch (_) { return null; }
}

export function readVideoChannel(win, doc, videoId) {
  if (!videoPattern.test(videoId)) return null;
  const initial = channelDetails(win.ytInitialPlayerResponse?.videoDetails);
  if (initial?.videoId === videoId) return initial;
  const cached = win.__ytafPlayerChannels?.find(item => item.videoId === videoId);
  if (cached && channelPattern.test(cached.id)) return cached;
  try {
    const raw = win.ytplayer?.config?.args?.player_response;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const channel = channelDetails(parsed?.videoDetails);
    if (channel?.videoId === videoId) { rememberPlayerChannel(win, parsed); return channel; }
    const player = doc.getElementById?.('ytlr-player__player-container-player') ||
      doc.querySelector?.('.html5-video-player');
    const data = player?.getVideoData?.();
    const live = channelDetails({ videoId: data?.video_id, channelId: data?.channel_id, author: data?.author });
    if (live?.videoId === videoId) return live;
  } catch (_) { /* Missing or changing player metadata must not identify the wrong channel. */ }
  return null;
}

export function channelSkipPolicy(win, doc, videoId, exclusions) {
  const saved = normalizeChannelExclusions(exclusions);
  if (!saved.length) return 'enabled';
  // Initial responses may outlive navigation. With exclusions, require a URL
  // or current-player identity rather than treating an old response as current.
  if (getCurrentVideoId(win, doc, false) !== videoId) return 'waiting-for-channel';
  const channel = readVideoChannel(win, doc, videoId);
  // With exceptions configured, wait for matching metadata before any seek.
  if (!channel) return 'waiting-for-channel';
  return saved.some(item => item.id === channel.id) ? 'channel-excluded' : 'enabled';
}

export function createChannelExclusionsPanel(doc, win, read, write, persisted) {
  const panel = doc.createElement('div');
  const title = doc.createElement('h2'); title.textContent = 'SponsorBlock channel exceptions';
  title.style.cssText = 'font-size:24px;margin:12px 0 8px;'; panel.appendChild(title);
  const status = doc.createElement('div'); status.className = 'ytaf-setting-help';
  status.setAttribute('aria-live', 'polite');
  const savedStatus = doc.createElement('div'); savedStatus.className = 'ytaf-setting-help';
  panel.appendChild(status); panel.appendChild(savedStatus);
  let selectedId = null, displayedChannelId = null;
  const saved = () => normalizeChannelExclusions(read(channelExclusionsKey));
  function current() {
    if (!doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH') &&
        !doc.body?.classList.contains('WEB_PAGE_TYPE_SHORTS')) return null;
    return readVideoChannel(win, doc, getCurrentVideoId(win, doc, false));
  }
  function action(id, label, tab, handler) {
    const row = doc.createElement('div'), button = doc.createElement('div');
    button.id = id; button.tabIndex = tab; button.dataset.ytafControl = 'action';
    button.className = 'ytaf-diagnostic-action'; button.textContent = label;
    button.setAttribute('role', 'button'); button.__ytafActivate = handler;
    button.addEventListener('click', () => {
      if (Number(row.dataset.ytafIgnoreClickUntil || 0) <= Date.now()) handler();
    });
    row.appendChild(button); panel.appendChild(row); return button;
  }
  function render(message) {
    const channel = current(), list = saved();
    displayedChannelId = channel?.id || null;
    if (!list.some(item => item.id === selectedId)) selectedId = list[0]?.id || null;
    const selected = list.find(item => item.id === selectedId);
    const excluded = channel && list.some(item => item.id === channel.id);
    toggle.textContent = excluded ? 'Enable SponsorBlock on this channel' : 'Never skip SponsorBlock on this channel';
    toggle.setAttribute('aria-disabled', String(!channel));
    status.textContent = message || (channel
      ? `${channel.name}: ${excluded ? 'excluded from all SponsorBlock skipping' : 'uses your SponsorBlock settings'}.`
      : 'Channel unavailable. Play a video and reopen settings when its channel information has loaded.');
    savedStatus.textContent = selected
      ? `Saved exception ${list.indexOf(selected) + 1} of ${list.length}: ${selected.name} (${selected.id})`
      : 'No saved channel exceptions.';
  }
  function save(list, message) {
    write(channelExclusionsKey, list);
    render(persisted() === false ? `${message} Could not save; this applies only for this session.` : `${message} Saved.`);
  }
  const toggle = action('__sponsorblock_channel_toggle', 'Never skip SponsorBlock on this channel', 910, () => {
    const channel = current();
    if (!channel) { render(); return; }
    if (channel.id !== displayedChannelId) {
      render(`Now watching ${channel.name}. Press OK again to change this channel's setting.`);
      return;
    }
    const list = saved(), excluded = list.some(item => item.id === channel.id);
    if (!excluded && list.length >= maximumChannelExclusions) {
      render('The exception list is full. Remove a saved exception first.'); return;
    }
    selectedId = channel.id;
    save(excluded ? list.filter(item => item.id !== channel.id) : [...list, { id: channel.id, name: channel.name }],
      excluded ? 'SponsorBlock enabled for this channel.' : 'This channel will not be skipped by SponsorBlock.');
  });
  action('__sponsorblock_channel_next', 'Next saved channel exception', 911, () => {
    const list = saved(), index = list.findIndex(item => item.id === selectedId);
    selectedId = list.length ? list[(index + 1) % list.length].id : null; render();
  });
  action('__sponsorblock_channel_remove', 'Remove selected channel exception', 912, () => {
    const list = saved();
    if (!list.some(item => item.id === selectedId)) { render(); return; }
    save(list.filter(item => item.id !== selectedId), 'Channel exception removed.');
  });
  doc.addEventListener('ytaf-menu-opened', () => render());
  render(); return panel;
}
