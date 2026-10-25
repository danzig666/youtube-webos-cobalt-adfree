import {rememberPlaybackMetadata} from './playback-metadata.mjs';
/* eslint no-redeclare: 0 */
/* global fetch:writable */
import { configRead } from './config';
import { rememberPlayerChannel } from './sponsorblock-channels.mjs';
import { applyAdResponseFilters } from './ad-response-filter.mjs';
import './adblock.css';

const AD_RENDERER_SELECTOR = [
  'ytlr-ad-slot-renderer',
  'ytd-ad-slot-renderer',
  '.ytlr-ad-slot-renderer',
  '.ytd-ad-slot-renderer',
  '[class*="ad-slot-renderer"]'
].join(',');
const AD_TILE_SELECTOR = [
  'ytlr-rich-item-renderer',
  'ytd-rich-item-renderer',
  'ytlr-grid-item-renderer',
  'ytlr-tile-renderer',
  '[role="listitem"]',
  '[role="gridcell"]'
].join(',');

let adSlotObserver = null;

function findAdTile(adRenderer) {
  // Cobalt exposes matches(), but not Element.closest().
  let semanticTile = adRenderer;
  while (semanticTile && !semanticTile.matches(AD_TILE_SELECTOR))
    semanticTile = semanticTile.parentElement;
  if (semanticTile) return semanticTile;

  /*
   * Older YouTube TV builds use obfuscated wrapper names. Find the direct
   * child of the nearest multi-item flex/grid container without relying on
   * those names.
   */
  let candidate = adRenderer;
  for (let depth = 0; depth < 8; depth += 1) {
    const parent = candidate.parentElement;
    if (!parent || parent === document.body) break;

    const display = window.getComputedStyle(parent).display;
    if (
      candidate !== adRenderer &&
      parent.children.length > 1 &&
      (display === 'flex' ||
        display === 'inline-flex' ||
        display === 'grid' ||
        display === 'inline-grid')
    ) {
      return candidate;
    }

    candidate = parent;
  }

  return adRenderer;
}

function hideAdRenderer(adRenderer) {
  if (!adRenderer || adRenderer.nodeType !== 1) return;
  findAdTile(adRenderer).classList.add('ytaf-hidden-ad-tile');
}

function processAddedNode(node) {
  if (!node || node.nodeType !== 1) return;

  if (node.matches(AD_RENDERER_SELECTOR)) {
    hideAdRenderer(node);
  }

  const children = node.querySelectorAll(AD_RENDERER_SELECTOR);
  for (let i = 0; i < children.length; i++) hideAdRenderer(children[i]);
}

function startAdSlotObserver() {
  if (adSlotObserver || !document.body) return;

  const renderers = document.querySelectorAll(AD_RENDERER_SELECTOR);
  for (let i = 0; i < renderers.length; i++) hideAdRenderer(renderers[i]);

  adSlotObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      for (let i = 0; i < mutation.addedNodes.length; i++)
        processAddedNode(mutation.addedNodes[i]);
    });
  });
  adSlotObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function stopAdSlotObserver() {
  if (adSlotObserver) {
    adSlotObserver.disconnect();
    adSlotObserver = null;
  }

  const tiles = document.querySelectorAll('.ytaf-hidden-ad-tile');
  for (let i = 0; i < tiles.length; i++)
    tiles[i].classList.remove('ytaf-hidden-ad-tile');
}

function syncAdblockStyles() {
  const enabled = Boolean(configRead('enableAdBlock'));
  document.documentElement.classList.toggle('ytaf-adblock-enabled', enabled);

  if (enabled) {
    startAdSlotObserver();
  } else {
    stopAdSlotObserver();
  }
}

export function userScriptStartAdBlock() {
  syncAdblockStyles();
}

document.addEventListener(
  'ytaf-config-changed',
  (event) => {
    if (event.detail && event.detail.key === 'enableAdBlock') {
      syncAdblockStyles();
    }
  },
  true
);

// Older runtimes may not execute the early preload. Keep a fallback without
// adding a second parser/filter pass when preload already owns responses.
if (!window.__ytafResponseFilterInstalled) {
  const origParse = JSON.parse;
  JSON.parse = function () {
    const value = origParse.apply(this, arguments);
    rememberPlayerChannel(window, value);
    rememberPlaybackMetadata(window, value);
    applyAdResponseFilters(value, configRead);
    return value;
  };
}
