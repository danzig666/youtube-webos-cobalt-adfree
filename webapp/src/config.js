const CONFIG_KEY = 'ytaf-configuration-cobalt-adfree-v2';
const defaultConfig = {
  enableAdBlock: true,
  rememberPlaybackPosition: true,
  playbackResumeMode: 'youtube',
  playbackPositions: [],
  channelSeekBehavior: 'immediate',
  highQualityAutoStartup: false,
  clockDisplay: 'off',
  hideEndScreens: false,
  enhanceThumbnails: false,
  hideGuestPrompts: false,
  hideYouTubeLogo: false,
  playbackSpeed: 'youtube',
  captionMode: 'youtube',
  captionLanguage: 'youtube',
  captionSize: 'youtube',
  dearrowMode: 'off',
  enableNumericShortcuts: true,
  numericShortcutActions: {},
  sponsorBlockExcludedChannels: [],
  sponsorBlockActions: {},
  startupPage: 'home',
  enableSponsoredQrCodeBlock: true,
  enableSponsorBlock: true,
  enableSponsorBlockSponsor: true,
  enableSponsorBlockIntro: true,
  enableSponsorBlockOutro: true,
  enableSponsorBlockInteraction: true,
  enableSponsorBlockSelfPromo: true,
  enableSponsorBlockMusicOfftopic: true,
  enableSponsorBlockPreview: false,
  enableSponsorBlockFiller: false,
  enableSponsorBlockHook: false,
  enableAutoLogin: true,
  enableReturnYouTubeDislike: true,
  enableShorts: true,
  pointerEdgeScroll: true,
  pointerDiagnosticsLog: true
};

function normalize(value) {
  const result = {};
  const valid = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  for (const key of Object.keys(defaultConfig)) {
    const candidate = valid[key], fallback = key === 'channelSeekBehavior' &&
      ['immediate', 'delayed', 'relaxed'].includes(valid.seekBehavior)
      ? valid.seekBehavior : defaultConfig[key];
    result[key] = candidate !== undefined && candidate !== null && typeof candidate === typeof fallback &&
      !(candidate && typeof candidate === 'object' && Array.isArray(candidate) !== Array.isArray(fallback))
      ? candidate : fallback;
  }
  return result;
}
function readSaved() {
  try {
    const native = window.h5vcc?.system?.getYtafUiPreferences?.();
    if (native) return JSON.parse(native);
  } catch (_) { /* recover through local storage or defaults */ }
  try { return JSON.parse(window.localStorage.getItem(CONFIG_KEY) || '{}'); }
  catch (_) { return {}; }
}
let localConfig = window.__ytafConfigState;
if (!localConfig || typeof localConfig !== 'object' || Array.isArray(localConfig)) {
  localConfig = normalize(readSaved());
  window.__ytafConfigState = localConfig;
}
export function configRead(key) {
  if (localConfig[key] === undefined) localConfig[key] = defaultConfig[key];
  return localConfig[key];
}

export function configPersistenceStatus() {
  return window.__ytafConfigPersisted;
}

function dispatchConfigChanged(target, key, value) {
  try {
    target.dispatchEvent(
      new CustomEvent('ytaf-config-changed', {
        detail: { key, value, persisted: configPersistenceStatus() }
      })
    );
  } catch (err) {
    const event = document.createEvent('Event');
    event.initEvent('ytaf-config-changed', true, true);
    event.detail = { key, value, persisted: configPersistenceStatus() };
    target.dispatchEvent(event);
  }
}

// The native store rejects files over 64 KiB, which would make every later
// save fail. Keep headroom, measured in UTF-8 bytes (channel names may be CJK).
const preferenceByteLimit = 60000;
export function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}
// Drop the oldest TV fallback positions first, then shorten saved channel
// names to their IDs. Settings themselves always fit.
export function fitPreferences(config, limit = preferenceByteLimit) {
  let serialized = JSON.stringify(config);
  if (utf8Length(serialized) <= limit) return serialized;
  if (Array.isArray(config.playbackPositions)) {
    const positions = config.playbackPositions.slice().sort((a, b) => (b?.updated || 0) - (a?.updated || 0));
    while (positions.length && utf8Length(serialized) > limit) {
      positions.pop();
      config.playbackPositions = positions.slice();
      serialized = JSON.stringify(config);
    }
  }
  const channels = config.sponsorBlockExcludedChannels;
  if (Array.isArray(channels) && utf8Length(serialized) > limit) {
    config.sponsorBlockExcludedChannels = channels.map(entry => entry && typeof entry === 'object' ? {...entry, name: entry.id} : entry);
    serialized = JSON.stringify(config);
  }
  return serialized;
}

function persistConfiguration() {
  const fitted = normalize(localConfig);
  const serialized = fitPreferences(fitted);
  localConfig.playbackPositions = fitted.playbackPositions;
  localConfig.sponsorBlockExcludedChannels = fitted.sponsorBlockExcludedChannels;
  let saved = false;
  const api = window.h5vcc?.system;
  if (api?.setYtafUiPreferences && api?.getYtafUiPreferences) {
    try { saved = api.setYtafUiPreferences(serialized) && api.getYtafUiPreferences() === serialized; }
    catch (_) { saved = false; }
  } else {
    try {
      window.localStorage.setItem(CONFIG_KEY, serialized);
      saved = window.localStorage.getItem(CONFIG_KEY) === serialized;
    } catch (_) { saved = false; }
  }
  // Mirror successful native saves for older builds without treating a failed
  // native write as durable. Only app preferences enter this store.
  if (saved && api?.setYtafUiPreferences) {
    try { window.localStorage.setItem(CONFIG_KEY, serialized); } catch (_) {}
  }
  return Boolean(saved);

}

export function persistPlaybackPositions(positions) {
  localConfig.playbackPositions = positions;
  window.__ytafConfigState = localConfig;
  return persistConfiguration();
}

export function configWrite(key, value) {
  console.info('[ytaf] Setting changed:', Object.prototype.hasOwnProperty.call(defaultConfig, key) ? key : 'unknown');
  localConfig[key] = value;
  window.__ytafConfigState = localConfig;
  window.__ytafConfigPersisted = persistConfiguration();

  let applyResult = null;

  if (key === 'enableShorts') {
    if (typeof window.__ytafApplyShortsState === 'function') {
      try {
        applyResult = window.__ytafApplyShortsState();
      } catch (err) {
        console.error('[ytaf shorts] live apply failed');
      }
    }
  }

  dispatchConfigChanged(document, key, value);
  dispatchConfigChanged(window, key, value);

  return applyResult;
}
