import { markStartup, watchStartupScreen } from './startup-timing.mjs';
markStartup(window, 'script');
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
    console.info('[ytaf] Relaunch received');
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
    console.warn('[ytaf] Failed to start debug overlay');
  }
}

export async function startUserScript() {
  console.info('[ytaf] startUserScript begin');

  try {
    handleInitialLaunch();
  } catch (err) {
    console.warn('[ytaf] Failed to apply startup page');
  }

  try {
    userScriptStartUI();
    userScriptStartShortsBlockUI();
    userScriptStartSponsoredQrCodeUI();
    startDebugOverlay();
    markStartup(window, 'settings');
    console.info('[ytaf] UI started');
  } catch (err) {
    console.warn('[ytaf] Failed to start UI');
  }

  try {
    startConfiguredFeatures(document, configRead, {
      enableAdBlock: userScriptStartAdBlock,
      enableSponsorBlock: userScriptStartSponsorBlock,
      enableReturnYouTubeDislike: userScriptStartReturnYouTubeDislike
    }, key => console.warn('[ytaf] Feature initialization failed:',key));
    markStartup(window, 'hooks');
    watchStartupScreen(document, window);
    console.info('[ytaf] All hooks loaded successfully');
  } catch (err) {
    console.warn('[ytaf] Failed loading hooks');
  }
}

// Error messages/stacks and relaunch payloads can contain signed URLs or
// account data. Keep only a fixed error category, and bound repeated reports.
const errorNames = ['Error', 'TypeError', 'RangeError', 'ReferenceError',
  'SyntaxError', 'URIError', 'EvalError', 'AggregateError', 'DOMException'];
let errorWindowStarted = Date.now(), errorReports = 0;
function reportGlobalError(kind, error) {
  const now = Date.now();
  if (now - errorWindowStarted >= 60000 || now < errorWindowStarted) {
    errorWindowStarted = now; errorReports = 0;
  }
  if (errorReports >= 8) return;
  errorReports++;
  let name = 'Error';
  try {
    const candidate = error?.name;
    if (errorNames.includes(candidate)) name = candidate;
  } catch (_) {}
  console.error(`[ytaf] ${kind}: ${name}`);
}

// Global error handlers to catch unhandled errors
window.addEventListener('error', (event) => {
  reportGlobalError('Global error', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  reportGlobalError('Unhandled promise rejection', event.reason);
});

// Start the user script and catch any top-level errors
startUserScript().catch((err) => {
  console.error('[ytaf] startUserScript() failed');
});
