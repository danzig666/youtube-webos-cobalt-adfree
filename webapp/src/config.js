const CONFIG_KEY = 'ytaf-configuration-cobalt-adfree-v2';
const defaultConfig = {
  enableAdBlock: true,
  enableNumericShortcuts: true,
  sponsorBlockExcludedChannels: [],
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
  enableShorts: true
};

let localConfig = window.__ytafConfigState;

if (!localConfig || typeof localConfig !== 'object' || Array.isArray(localConfig)) {
  try {
    localConfig = JSON.parse(
      window.localStorage[CONFIG_KEY] || JSON.stringify(defaultConfig)
    );
    if (!localConfig || typeof localConfig !== 'object' || Array.isArray(localConfig)) {
      localConfig = { ...defaultConfig };
    }
  } catch (err) {
    console.warn('Config read failed:', err);
    localConfig = { ...defaultConfig };
  }

  window.__ytafConfigState = localConfig;
}

export function configRead(key) {
  if (localConfig[key] === undefined) {
    console.warn(
      'Populating key',
      key,
      'with default value',
      defaultConfig[key]
    );
    localConfig[key] = defaultConfig[key];
  }

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

export function configWrite(key, value) {
  console.info('Setting key', key, 'to', key === 'sponsorBlockExcludedChannels' ? '(channel preferences)' : value);
  localConfig[key] = value;
  window.__ytafConfigState = localConfig;
  try {
    window.localStorage[CONFIG_KEY] = JSON.stringify(localConfig);
    window.__ytafConfigPersisted = true;
  } catch (err) {
    window.__ytafConfigPersisted = false;
    // A full or unavailable store must not prevent the selected setting from
    // taking effect in the current session or notifying its live consumers.
    console.warn('Config persistence failed; keeping settings for this session:', err);
  }

  let applyResult = null;

  if (key === 'enableShorts') {
    if (typeof window.__ytafApplyShortsState === 'function') {
      try {
        applyResult = window.__ytafApplyShortsState();
      } catch (err) {
        console.error('[ytaf shorts] live apply threw', err);
      }
    }
  }

  dispatchConfigChanged(document, key, value);
  dispatchConfigChanged(window, key, value);

  return applyResult;
}
