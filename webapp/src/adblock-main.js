console.info('[ytaf] adblock-main.js LOADING');

import './text-data-guard';
import 'whatwg-fetch';
import './domrect-polyfill';
import './json-stringify-hook';
import './ui.js';

import { handleInitialLaunch, handleRelaunch } from './utils';
import { configRead } from './config.js';
import { userScriptStartUI } from './ui.js';
import { userScriptStartSponsoredQrCodeUI } from './sponsored-qr-code-ui.js';
import { userScriptStartAdBlock } from './adblock.js';
import { userScriptStartShortsBlockUI } from './shorts-block.js';
import { userScriptStartSponsorBlock } from './sponsorblock.js';
import { userScriptStartReturnYouTubeDislike } from './returnyoutubedislike.js';
import { resetAutoLogin } from './auto-login.js';
import { startConfiguredFeatures } from './feature-bootstrap.mjs';

console.info('[ytaf] adblock-main.js LOADED, all imports successful');

console.info('[ytaf] adblock-main.js LOADED, imports ready');

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    console.info('RELAUNCH:', evt, window.launchParams);
    resetAutoLogin();
    handleRelaunch(evt.detail);
  },
  true
);

// SDL/Starfish now inhibit the screen saver natively. Preserve YouTube's
// video geometry, including offscreen/hidden states during navigation and EOS.

function startDebugOverlay() {
  if (typeof __YTAF_DEBUG__ === 'undefined' || !__YTAF_DEBUG__) {
    return;
  }

  try {
    require('./debug-overlay.js').userScriptStartDebugOverlay();
    console.info('[ytaf] Debug overlay started');
  } catch (err) {
    console.warn('[ytaf] Failed to start debug overlay:', err);
  }
}

export async function startUserScript() {
  console.info('[ytaf] startUserScript begin');

  try {
    handleInitialLaunch();
  } catch (err) {
    console.warn('[ytaf] Failed to apply startup page:', err);
  }

  try {
    userScriptStartUI();
    userScriptStartShortsBlockUI();
    userScriptStartSponsoredQrCodeUI();
    startDebugOverlay();
    console.info('[ytaf] UI started');
  } catch (err) {
    console.warn('[ytaf] Failed to start UI:', err);
  }

  try {
    startConfiguredFeatures(document, configRead, {
      enableAdBlock: userScriptStartAdBlock,
      enableSponsorBlock: userScriptStartSponsorBlock,
      enableReturnYouTubeDislike: userScriptStartReturnYouTubeDislike
    }, key => console.warn('[ytaf] Feature initialization failed:',key));
    console.info('[ytaf] All hooks loaded successfully');
  } catch (err) {
    console.warn('[ytaf] Failed loading hooks:', err);
  }
}

// Global error handlers to catch unhandled errors
window.addEventListener('error', (event) => {
  console.error('[ytaf] Global error:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[ytaf] Unhandled promise rejection:', event.reason);
});

// Start the user script and catch any top-level errors
startUserScript().catch((err) => {
  console.error('[ytaf] startUserScript() error:', err);
});
