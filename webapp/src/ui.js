import {installDisplayPreferences,createDisplaySettings} from './display-filters.mjs';
/*global navigate*/

// import './spatial-navigation-polyfill.js';
import './navigation-checkbox.js';

import './ui.css';
import './corner-clock.css';
import { installCornerClock, clockDisplayMode } from './corner-clock.mjs';
import { startPlaybackResume } from './playback-resume.mjs';
import { createPlaybackSeek } from './playback-seek.mjs';
import { startAutoQuality } from './auto-quality.mjs';
import { startPlaybackHealth } from './playback-health.mjs';
import { createPlaybackControlsReveal } from './playback-controls-visibility.mjs';
import { createSeekPreview } from './seek-preview.mjs';
import { startPlaybackSpeed, playbackRates } from './playback-speed.mjs';
import { ensureSettingsMounted } from './settings-mount.mjs';
import { createSettingsSections } from './settings-sections.mjs';
import { wheelScrollDelta } from './wheel-scroll.mjs';
import { createMenuBackGuard } from './menu-back-guard.mjs';
import { createCaptionSettings } from './caption-preferences.mjs';
import { createDeArrowSettings } from './dearrow.mjs';
import { createShortcutHandler, createShortcutSettings } from './remote-shortcuts.mjs';
import { createHomeRefresh, createHomeRefreshButton } from './home-refresh.mjs';
import { startThumbnailProgress } from './thumbnail-progress.mjs';
import { createEndStopPanel } from './stop-after-video.mjs';
import { createVideoCapabilitySetting } from './video-capability-setting.mjs';
import { createPlaybackDiagnostics } from './playback-diagnostics.mjs';
import { createSleepTimerPanel } from './sleep-timer.mjs';
import { createRemoteHelp } from './remote-help.mjs';
import { createChannelExclusionsPanel } from './sponsorblock-channels.mjs';

import { configRead, configWrite, configPersistenceStatus, persistPlaybackPositions } from './config.js';
import { checkboxTools } from './checkboxTools.js';
import { choiceTools } from './choiceTools.js';
import { text as languageText } from './languages/index.js';
import { sponsorBlockCategories, sponsorBlockCategoryConfig, sponsorBlockCategoryColors } from './sponsorblock-categories.js';
import { sponsorBlockAction, sponsorBlockActionOptions } from './sponsorblock-actions.mjs';
import { toggleSubtitles } from './subtitle-shortcut.js';

// The control to restore on reopen. Tracked by element: tab indexes are not unique.
let lastFocusedItem = null;

function text(key) {
  return languageText('ui', key);
}

export function userScriptStartUI() {
  if (window.__ytafUiInitialized && window.__ytafAttachSettings) {
    window.__ytafAttachSettings();
    return;
  }
  if (window.__ytafUiInitialized && document.querySelector('.ytaf-ui-container')) {
    return;
  }
  console.info('[ytaf] userScriptStartUI() called');
  startPlaybackHealth(document, window);
  if (['always','browsing'].includes(configRead('clockDisplay')))
    configWrite('clockDisplay', clockDisplayMode(configRead('clockDisplay')));
  installCornerClock(document, window, configRead);
  if (!window.__ytafThumbnailProgress)
    window.__ytafThumbnailProgress = startThumbnailProgress(document, window);

  const ARROW_KEY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  let lastGreenKeyAt = 0;
  let currentFocusIndex = -1;
  let menuScrollFrame = null;
  let menuOffset = 0;
  let wheelFocusing = false;
  let menuContent = null;
  let menuViewport = null;
  let heldDirection = null;
  let heldDirectionAt = 0;
  let directionMoveFrame = null;
  let heldActivationControl = null;
  let closedActivationReleaseUntil = 0;


  function getDirectionFromEvent(evt) {
    const key = (evt.key || '').toLowerCase();
    const code = (evt.code || '').toLowerCase();
    const keyCode = evt.keyCode ?? evt.which ?? evt.charCode;

    if (code === 'arrowup' || key === 'arrowup' || key === 'up' || keyCode === 38) {
      return 'up';
    }
    if (code === 'arrowdown' || key === 'arrowdown' || key === 'down' || keyCode === 40) {
      return 'down';
    }
    if (code === 'arrowleft' || key === 'arrowleft' || key === 'left' || keyCode === 37) {
      return 'left';
    }
    if (code === 'arrowright' || key === 'arrowright' || key === 'right' || keyCode === 39) {
      return 'right';
    }

    return null;
  }

  function getRemoteKeyCode(evt) {
    return evt.keyCode || evt.which || evt.charCode || 0;
  }

  function isGreenKey(evt) {
    const keyCode = getRemoteKeyCode(evt);
    return keyCode === 404 || keyCode === 172;
  }

  function adjustPlaybackRate(direction) {
    return playbackSpeed.adjust(direction);
  }

  function scrollMenuItemIntoView(item) {
    if (!item || !menuContent || !menuViewport || !uiContainer.contains(item)) return;
    if (menuContent.contains && !menuContent.contains(item)) return;

    // Cobalt resets an overflow container's scrollTop after programmatic focus.
    // Keep the viewport fixed and move its inner panel instead.
    uiContainer.scrollTop = 0;
    menuViewport.scrollTop = 0;

    const visibleMargin = 8;
    const row = item.dataset?.ytafControl === 'reader' ? item : item.parentElement && uiContainer.contains(item.parentElement)
      ? item.parentElement
      : item;
    const viewportRect = menuViewport.getBoundingClientRect();
    const itemRect = row.getBoundingClientRect();
    const visibleTop = viewportRect.top + visibleMargin;
    const visibleBottom = viewportRect.bottom - visibleMargin;
    const viewportHeight = Math.max(0, visibleBottom - visibleTop);
    // Include the help text directly below a row, so moving down never leaves
    // its explanation cut off at the bottom edge.
    let revealBottom = itemRect.bottom;
    for (let help = row.nextElementSibling; help && help.classList?.contains('ytaf-setting-help');
      help = help.nextElementSibling) {
      const helpRect = help.getBoundingClientRect?.();
      if (!helpRect || helpRect.bottom - itemRect.top > viewportHeight) break;
      revealBottom = Math.max(revealBottom, helpRect.bottom);
    }

    if (itemRect.top < visibleTop) {
      menuOffset += itemRect.top - visibleTop;
    } else if (item.dataset?.ytafControl === 'reader' && itemRect.top > visibleBottom - 81) {
      // Reveal its first lines when a summary pushes a tall reader below the viewport.
      menuOffset += itemRect.top - (visibleBottom - 81);
    } else if (item.dataset?.ytafControl !== 'reader' && revealBottom > visibleBottom) {
      menuOffset += revealBottom - visibleBottom;
    }
    // Controls on the first screen keep the category heading visible.
    const contentRect = menuContent.getBoundingClientRect?.();
    if (contentRect && itemRect.bottom - contentRect.top <= viewportHeight) menuOffset = 0;

    const maximumOffset = Math.max(0, menuContent.scrollHeight - viewportHeight);
    menuOffset = Math.max(0, Math.min(maximumOffset, menuOffset));
    menuContent.style.top = `${-menuOffset}px`;
  }

  function queueMenuItemScroll(item) {
    if (menuScrollFrame !== null) {
      window.cancelAnimationFrame(menuScrollFrame);
    }
    menuScrollFrame = window.requestAnimationFrame(() => {
      menuScrollFrame = null;
      scrollMenuItemIntoView(item);
    });
  }

  function moveFocus(dir) {
    const active = document.activeElement;
    if (active?.dataset.ytafControl === 'reader' && (dir === 'up' || dir === 'down')) {
      const size = menuViewport.getBoundingClientRect().height;
      const nextOffset = Math.max(0, Math.min(Math.max(0, menuContent.scrollHeight - size), menuOffset + (dir === 'down' ? 1 : -1) * 54));
      if (nextOffset !== menuOffset || dir === 'down') {
        menuOffset = nextOffset;
        menuContent.style.top = `${-menuOffset}px`; menuViewport.scrollTop = 0; return;
      }
      // At the start of the report, Up returns to the preceding action.
      // Otherwise keyboard users cannot reach Run capability test again.
    }
    if (sections.nav.contains(active)) {
      const tabs = Array.from(sections.nav.querySelectorAll('[tabindex]'));
      if (dir === 'right') {
        sections.select(active.dataset.ytafSection);
        const first = Array.from(menuContent.querySelectorAll('[tabindex]'))
          .find(item => item.tabIndex > 0 && item.getClientRects().length);
        if (first) { first.focus(); queueMenuItemScroll(first); }
      } else if (dir === 'up' || dir === 'down') {
        const index = tabs.indexOf(active);
        tabs[Math.max(0, Math.min(tabs.length - 1, index + (dir === 'down' ? 1 : -1)))].focus();
      }
      currentFocusIndex = -1;
      return;
    }
    if (dir === 'left') {
      sections.currentButton().focus(); currentFocusIndex = -1; return;
    }
    const focusableItems = Array.from(
      menuContent.querySelectorAll('[tabindex]')
    ).filter((item) => item.tabIndex > 0 && item.getClientRects?.().length !== 0);

    if (focusableItems.length === 0) {
      return;
    }

    const activeIndex = focusableItems.indexOf(document.activeElement);
    currentFocusIndex = activeIndex < 0 ? 0 : activeIndex;
    if (document.activeElement === uiContainer) {
      // Continue from a text-only section reached with the wheel.
      const rect = menuViewport.getBoundingClientRect();
      const forward = dir === 'down' || dir === 'right';
      const ordered = forward ? focusableItems : focusableItems.slice().reverse();
      const target = ordered.find(item => {
        const box = item.getBoundingClientRect();
        return forward ? box.bottom > rect.top : box.top < rect.bottom;
      }) || ordered[ordered.length - 1];
      currentFocusIndex = focusableItems.indexOf(target);
    } else if (dir === 'down' || dir === 'right') {
      currentFocusIndex = Math.min(currentFocusIndex + 1, focusableItems.length - 1);
    } else if (dir === 'up' || dir === 'left') {
      if (currentFocusIndex === 0) { sections.currentButton().focus(); return; }
      currentFocusIndex -= 1;
    }

    const nextItem = focusableItems[currentFocusIndex];
    if (nextItem) {
      nextItem.focus();
      queueMenuItemScroll(nextItem);
      lastFocusedItem = nextItem;
    }
  }

  function queueDirectionMove(direction) {
    if (directionMoveFrame !== null) return;

    const focusBeforeEvent = document.activeElement;
    directionMoveFrame = window.requestAnimationFrame(() => {
      directionMoveFrame = null;
      const focusAfterEvent = document.activeElement;

      // Some Cobalt versions perform native spatial navigation before the
      // cancelled key event settles. Accept that move instead of adding one.
      if (
        focusAfterEvent &&
        focusAfterEvent !== focusBeforeEvent &&
        uiContainer.contains(focusAfterEvent) &&
        focusAfterEvent.tabIndex > 0
      ) {
        const focusableItems = Array.from(
          uiContainer.querySelectorAll('[tabindex]')
        ).filter((item) => item.tabIndex > 0 && item.getClientRects?.().length !== 0);
        currentFocusIndex = focusableItems.indexOf(focusAfterEvent);
        lastFocusedItem = focusAfterEvent;
        queueMenuItemScroll(focusAfterEvent);
        return;
      }

      moveFocus(direction);
    });
  }

  const uiContainer = document.createElement('div');
  uiContainer.classList.add('ytaf-ui-container');
  uiContainer.style.display = 'none';
  uiContainer.style.visibility = 'hidden';
  uiContainer.setAttribute('tabindex', 0);
  uiContainer.addEventListener(
    'focus',
    (event) => {
      if (wheelFocusing) return;
      console.info('uiContainer focused!');
      const focusedElement = event.target;
      if (
        focusedElement &&
        focusedElement !== uiContainer &&
        focusedElement.tabIndex !== null &&
        focusedElement.tabIndex > 0
      ) {
        lastFocusedItem = focusedElement;
        queueMenuItemScroll(focusedElement);
      }
    },
    true
  );
  uiContainer.addEventListener(
    'blur',
    () => console.info('uiContainer blured!'),
    true
  );

  // Key handling is done globally in the window capture handler to ensure a single
  // interception point and avoid duplicate handling across capture/bubble phases.

  const callbackConfig = (configName) => {
    return (newState) => {
      configWrite(configName, newState);
    };
  };

  // One compact header line keeps most of the panel for settings rows.
  const divTitle = document.createElement('div');
  divTitle.classList.add('center');
  const title = document.createElement('h1');
  title.textContent = 'Settings';
  const brand = document.createElement('span');
  brand.className = 'ytaf-brand'; brand.textContent = 'YouTube AdFree';
  title.appendChild(brand);
  divTitle.appendChild(title);
  const closeButton = document.createElement('button');
  closeButton.id = '__settings_close'; closeButton.className = 'ytaf-settings-close';
  closeButton.type = 'button'; closeButton.textContent = '';  closeButton.tabIndex = 1999;
  closeButton.setAttribute('aria-label', 'Close settings');
  closeButton.dataset.ytafControl = 'action'; closeButton.__ytafActivate = closeContainer;
  closeButton.addEventListener('click', () => {
    if (Number(divTitle.dataset.ytafIgnoreClickUntil || 0) <= Date.now()) closeContainer();
  });
  divTitle.appendChild(closeButton);
  // Key help sits in a footer line so it never pushes the settings down.
  const menuHint = document.createElement('div');
  menuHint.className = 'ytaf-menu-hint';
  menuHint.textContent = '↑ ↓ Move   ·   → Open category   ·   ← Categories   ·   OK Change   ·   BACK Close';
  const saveStatus = document.createElement('div');
  saveStatus.className = 'ytaf-save-status';
  saveStatus.setAttribute('aria-live', 'polite');
  function refreshSaveStatus() {
    const persisted = configPersistenceStatus();
    saveStatus.textContent = persisted === false
      ? 'Could not save settings: changes last for this session only. Try again.'
      : persisted === true ? 'Changes saved' : 'Changes save automatically';
    saveStatus.className = 'ytaf-save-status' + (persisted === false ? ' ytaf-save-failed' : '');
    if (menuViewport && isContainerOpen()) {
      applyVisibleContainerStyles();
      queueMenuItemScroll(document.activeElement);
    }
  }
  refreshSaveStatus();
  document.addEventListener('ytaf-config-changed', refreshSaveStatus);
  divTitle.appendChild(saveStatus);
  uiContainer.appendChild(divTitle);

  uiContainer.appendChild(
    checkboxTools.add(
      '__adblock',
      text('adblock'),
      configRead('enableAdBlock'),
      callbackConfig('enableAdBlock')
    )
  );
  uiContainer.appendChild(
    choiceTools.add(
      '__startup_page',
      text('startupPage'),
      configRead('startupPage'),
      [
        { value: 'home', label: text('startupPageHome') },
        { value: 'subscriptions', label: text('startupPageSubscriptions') },
        { value: 'shorts', label: text('startupPageShorts') },
        { value: 'library', label: text('startupPageLibrary') }
      ],
      callbackConfig('startupPage')
    )
  );
  const refreshHome = createHomeRefresh(document, window, showNotification, () => {
    if (isContainerOpen()) closeContainer();
  });
  uiContainer.appendChild(createHomeRefreshButton(document, refreshHome));
  uiContainer.appendChild(choiceTools.add('__clock_display', 'Clock (upper right)', configRead('clockDisplay'), [
    {value:'off',label:'Off'},
    {value:'controls',label:'In menus and with playback controls'}
  ], callbackConfig('clockDisplay')));
  const clockStatus=document.createElement('div');clockStatus.className='ytaf-setting-help';
  clockStatus.id='__clock_status';
  function renderClockStatus() {
    const labels={off:'Clock is off.',mounted:'Clock is on in the upper-right corner.',
      'playback-hidden':'Clock is hidden while watching without controls.',
      background:'Clock is paused while the app is in the background.',
      'waiting-for-body':'Clock will appear when the page is ready.',destroyed:'Clock is stopped.'};
    clockStatus.textContent=(labels[window.__ytafCornerClock?.status] || 'Clock is starting.') +
      ' White text, shifted slightly every 3 minutes. Visible in menus and when the seekbar is up.';
  }
  renderClockStatus();document.addEventListener('ytaf-config-changed',renderClockStatus);
  uiContainer.appendChild(clockStatus);
  installDisplayPreferences(document,configRead);
  uiContainer.appendChild(createDisplaySettings(document,checkboxTools,configRead,configWrite));
  const videoQuality = createVideoCapabilitySetting(document, window, choiceTools);
  videoQuality.dataset.ytafSection = 'playback';
  uiContainer.appendChild(videoQuality);
  uiContainer.appendChild(createSleepTimerPanel(document, window, choiceTools, showNotification));
  const resume = window.__ytafResume || (window.__ytafResume = startPlaybackResume(document, window,
    configRead, persistPlaybackPositions, showNotification));
  const playbackPreferences = document.createElement('div');
  playbackPreferences.dataset.ytafSection = 'playback';
  const autoQuality = window.__ytafAutoQuality || (window.__ytafAutoQuality = startAutoQuality(document,window,configRead));
  playbackPreferences.appendChild(checkboxTools.add('__high_quality_auto_startup',
    'Higher-quality Auto startup',configRead('highQualityAutoStartup'),callbackConfig('highQualityAutoStartup')));
  const qualityStatus=document.createElement('div');qualityStatus.className='ytaf-setting-help';
  qualityStatus.id='__auto_quality_status';
  autoQuality.render=()=>{qualityStatus.textContent='When YouTube quality is Auto, briefly request the highest available level, then let Auto adapt to your connection. Manual choices stay unchanged. '+autoQuality.status;};
  autoQuality.render();playbackPreferences.appendChild(qualityStatus);
  const playbackSpeed = startPlaybackSpeed(document,window,configRead,configWrite,showNotification);
  playbackPreferences.appendChild(choiceTools.add('__playback_speed','Playback speed',configRead('playbackSpeed'),
    [{value:'youtube',label:'YouTube choice'},...playbackRates.map(rate=>({value:String(rate),label:`${rate}×`}))],
    value=>configWrite('playbackSpeed',value)));
  const speedStatus=document.createElement('div');speedStatus.className='ytaf-setting-help';
  playbackSpeed.render=()=>{speedStatus.textContent=playbackSpeed.status;choiceTools.setValue('__playback_speed',configRead('playbackSpeed'));};
  playbackSpeed.render();playbackPreferences.appendChild(speedStatus);
  const resetSpeed = document.createElement('div');
  resetSpeed.id='__reset_playback_speed';resetSpeed.tabIndex=902;resetSpeed.className='ytaf-diagnostic-action';
  resetSpeed.dataset.ytafControl='action';resetSpeed.setAttribute('role','button');
  resetSpeed.textContent='Reset playback speed to 1×';resetSpeed.__ytafActivate=()=>playbackSpeed.reset();
  const resetRow=document.createElement('div');resetRow.appendChild(resetSpeed);
  resetSpeed.addEventListener('click',()=>{if(Number(resetRow.dataset.ytafIgnoreClickUntil||0)<=Date.now())playbackSpeed.reset();});
  playbackPreferences.appendChild(resetRow);
  const speedHint=document.createElement('div');speedHint.className='ytaf-setting-help';
  speedHint.textContent='Custom speed applies to this video only. Each new video starts normally. Unsupported or stalled speeds return to 1× automatically.';
  playbackPreferences.appendChild(speedHint);
  playbackPreferences.appendChild(choiceTools.add('__resume_mode', 'Playback resume', configRead('playbackResumeMode'), [
    {value:'youtube',label:'YouTube watch history'},
    {value:'youtube-local',label:'YouTube + TV fallback'}
  ], callbackConfig('playbackResumeMode')));
  const resumeStatus=document.createElement('div');resumeStatus.className='ytaf-setting-help';
  resumeStatus.id='__resume_status';
  function renderResumeStatus() {resumeStatus.textContent=`${resume.status} ${resume.localStatus || ''}`;}
  renderResumeStatus();document.addEventListener('ytaf-config-changed',renderResumeStatus);
  playbackPreferences.appendChild(resumeStatus);
  playbackPreferences.appendChild(choiceTools.add('__seek_behavior', 'Channel + / − quick seek', configRead('channelSeekBehavior'), [
    {value:'youtube',label:'Off'},
    {value:'immediate',label:'Automatic — 0.5 seconds after release'},
    {value:'delayed',label:'Automatic — 0.8 seconds after release'},
    {value:'relaxed',label:'Automatic — 1 second after release'}
  ], callbackConfig('channelSeekBehavior')));
  const playbackHint = document.createElement('div'); playbackHint.className='ytaf-setting-help';
  playbackHint.textContent='YouTube manages account resume through watch history. Sign in and keep watch history enabled to sync across devices. Optional TV fallback stores unfinished videos on this app install, and gives YouTube priority. Left/Right always use YouTube’s normal seek controls. Channel + seeks forward and Channel − backward in 10-second steps, previewing the target before the delayed jump.';
  playbackPreferences.appendChild(playbackHint);
  const clearRow=document.createElement('div'), clearPositions=document.createElement('div');
  clearPositions.id='__clear_playback_positions';clearPositions.tabIndex=903;clearPositions.className='ytaf-diagnostic-action';
  clearPositions.dataset.ytafControl='action';clearPositions.setAttribute('role','button');
  clearPositions.textContent='Clear TV fallback positions';clearPositions.__ytafActivate=()=>{resume.clear();renderResumeStatus();};
  clearPositions.addEventListener('click',()=>{if(Number(clearRow.dataset.ytafIgnoreClickUntil||0)<=Date.now()){resume.clear();renderResumeStatus();}});
  clearRow.appendChild(clearPositions);playbackPreferences.appendChild(clearRow);uiContainer.appendChild(playbackPreferences);
  const revealPlaybackControls=createPlaybackControlsReveal(document,window);
  window.__ytafPlaybackControls = revealPlaybackControls;
  const handlePlaybackSeek=createPlaybackSeek(document,window,configRead,createSeekPreview(document,window),showNotification,revealPlaybackControls);

  uiContainer.appendChild(checkboxTools.add(
    '__numeric_shortcuts', 'Numeric playback shortcuts',
    configRead('enableNumericShortcuts'), callbackConfig('enableNumericShortcuts')
  ));
  uiContainer.appendChild(createShortcutSettings(document, choiceTools, configRead, configWrite));
  uiContainer.appendChild(createEndStopPanel(document, window, showNotification));
  uiContainer.appendChild(createCaptionSettings(document, window, choiceTools, configRead, configWrite, showNotification));
  uiContainer.appendChild(createDeArrowSettings(document, window, choiceTools, configRead, configWrite));
  uiContainer.appendChild(createRemoteHelp(document));
  uiContainer.appendChild(
    checkboxTools.add(
      '__auto_login',
      text('autoLogin'),
      configRead('enableAutoLogin'),
      callbackConfig('enableAutoLogin')
    )
  );
  uiContainer.appendChild(
    checkboxTools.add(
      '__return_youtube_dislike',
      text('ryd'),
      configRead('enableReturnYouTubeDislike'),
      callbackConfig('enableReturnYouTubeDislike')
    )
  );
  uiContainer.appendChild(
    checkboxTools.add(
      '__shorts',
      text('shorts'),
      configRead('enableShorts'),
      callbackConfig('enableShorts')
    )
  );
  uiContainer.appendChild(
    checkboxTools.add(
      '__sponsorblock',
      text('sponsorblock'),
      configRead('enableSponsorBlock'),
      callbackConfig('enableSponsorBlock')
    )
  );

  const sponsorBlock = document.createElement('div');
  sponsorBlock.classList.add('blockquote');
  sponsorBlockCategories.forEach(category => {
    const labelKey = category === 'music_offtopic' ? 'musicOfftopic' : category;
    const row = choiceTools.add(`__sponsorblock_${category}`, text(labelKey),
      sponsorBlockAction(category, sponsorBlockCategoryConfig[category], configRead),
      sponsorBlockActionOptions, value => {
        const stored = configRead('sponsorBlockActions');
        configWrite('sponsorBlockActions', {...(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}), [category]: value});
      });
    row.style.borderLeft = `3px solid ${sponsorBlockCategoryColors[category]}`;
    sponsorBlock.appendChild(row);
  });
  uiContainer.appendChild(sponsorBlock);
  uiContainer.appendChild(createChannelExclusionsPanel(
    document, window, configRead, configWrite, configPersistenceStatus
  ));
  uiContainer.appendChild(createPlaybackDiagnostics(document, window));

  const sections = createSettingsSections(document, Array.from(uiContainer.children).slice(1), () => {
    const pendingChoiceRelease = choiceTools.resetKeys?.();
    if (heldActivationControl || pendingChoiceRelease) closedActivationReleaseUntil = Date.now() + 1000;
    heldActivationControl = null;
    choiceTools.close(false);
    if (menuScrollFrame !== null) window.cancelAnimationFrame(menuScrollFrame);
    menuScrollFrame = null;
    menuOffset = 0; menuContent.style.top = '0'; menuViewport.scrollTop = 0;
    if (typeof updateScrollIndicator === 'function') updateScrollIndicator();
    currentFocusIndex = -1;
    // A category can be changed by pointer while a hidden setting had focus.
    sections.currentButton().focus();
    renderClockStatus();
    renderResumeStatus();
    if (sections.current() === 'diagnostics') document.dispatchEvent(new CustomEvent('ytaf-diagnostics-opened'));
  });
  menuContent = sections.content;
  menuContent.style.position = 'relative';
  menuContent.style.top = '0';
  uiContainer.appendChild(sections.nav);
  menuViewport = document.createElement('div');
  menuViewport.classList.add('ytaf-ui-viewport');
  menuViewport.style.position = 'relative';
  menuViewport.style.overflow = 'hidden';
  menuViewport.style.boxSizing = 'border-box';
  menuViewport.style.paddingLeft = '4px';
  menuViewport.style.paddingRight = '4px';
  menuViewport.appendChild(menuContent);
  uiContainer.appendChild(menuViewport);
  // A thin position indicator shows that a category continues off screen.
  const scrollTrack = document.createElement('div');
  scrollTrack.className = 'ytaf-scroll-track';
  const scrollThumb = document.createElement('div');
  scrollThumb.className = 'ytaf-scroll-thumb';
  scrollTrack.appendChild(scrollThumb);
  menuViewport.appendChild(scrollTrack);
  function updateScrollIndicator() {
    const viewportHeight = menuViewport.clientHeight;
    const contentHeight = menuContent.scrollHeight;
    if (!viewportHeight || contentHeight <= viewportHeight + 2) { scrollTrack.style.display = 'none'; return; }
    const offset = Math.max(0, -parseFloat(menuContent.style.top || '0') || 0);
    const thumb = Math.max(36, Math.round(viewportHeight * viewportHeight / contentHeight));
    const travel = viewportHeight - thumb;
    scrollTrack.style.display = 'block';
    scrollThumb.style.height = `${thumb}px`;
    scrollThumb.style.top = `${Math.round(travel * Math.min(1, offset / Math.max(1, contentHeight - viewportHeight)))}px`;
  }
  try {
    new MutationObserver(updateScrollIndicator).observe(menuContent, {attributes: true, attributeFilter: ['style']});
  } catch (_) { /* The indicator is optional. */ }
  uiContainer.appendChild(menuHint);

  (document.body || document.documentElement).appendChild(uiContainer);

  let latestFocus = null;
  let focusGuardFrame = null;
  let spatialNavigationState = null;

  function suspendSpatialNavigation() {
    const spatialNavigation =
      window.__spatialNavigation__ || (window.__spatialNavigation__ = {});
    spatialNavigationState = {
      target: spatialNavigation,
      hadKeyMode: Object.prototype.hasOwnProperty.call(spatialNavigation, 'keyMode'),
      keyMode: spatialNavigation.keyMode
    };
    spatialNavigation.keyMode = 'NONE';
  }

  function restoreSpatialNavigation() {
    if (!spatialNavigationState) return;

    const { target, hadKeyMode, keyMode } = spatialNavigationState;
    if (hadKeyMode) {
      target.keyMode = keyMode;
    } else {
      delete target.keyMode;
    }
    spatialNavigationState = null;
  }

  function isContainerOpen() {
    return uiContainer.style.display !== 'none' && uiContainer.style.visibility !== 'hidden';
  }

  function applyVisibleContainerStyles() {
    const viewportHeights = [window.innerHeight, document.documentElement?.clientHeight]
      .filter(value => Number.isFinite(value) && value > 0);
    const screenHeight = viewportHeights.length ? Math.min(...viewportHeights) : 720;
    const widths = [window.innerWidth, document.documentElement?.clientWidth]
      .filter(value => Number.isFinite(value) && value > 0);
    const screenWidth = widths.length ? Math.min(...widths) : 1280;
    // Centred and as large as TV-safe margins allow: more rows fit on screen.
    const menuWidth = Math.min(Math.round(screenWidth * .9), 1400);
    const menuTop = Math.round(screenHeight * .05);
    const menuHeight = Math.floor(screenHeight * .9);
    const padding = screenHeight < 800 ? 22 : 30;
    Object.assign(uiContainer.style, {
      position: 'fixed', display: 'block', visibility: 'visible', opacity: '1',
      left: `${Math.round((screenWidth - menuWidth) / 2)}px`, top: `${menuTop}px`,
      width: `${menuWidth}px`, maxWidth: 'none',
      height: `${menuHeight}px`, maxHeight: `${menuHeight}px`, minHeight: '0', margin: '0', boxSizing: 'border-box',
      overflow: 'hidden', zIndex: '2147483647', pointerEvents: 'auto',
      background: '#101e30', color: '#eef4ff', border: '1px solid #31465f',
      borderRadius: '20px', padding: `${padding}px`, fontSize: '20px',
      lineHeight: '1.4', fontFamily: '"YTAF Inter", Arial, sans-serif',
      transform: 'none', animation: 'none',
      boxShadow: '0 20px 64px rgba(0,0,0,0.35), 0 0 0 9999px rgba(3,9,18,0.6)'
    });
    const gap = 14;
    const viewportHeight = Math.max(
      0, uiContainer.clientHeight - 2 * padding - divTitle.offsetHeight - gap - menuHint.offsetHeight - 10
    );
    sections.nav.style.top = `${padding + divTitle.offsetHeight + gap}px`;
    sections.nav.style.left = `${padding}px`;
    sections.nav.style.height = `${viewportHeight}px`;
    menuViewport.style.height = `${viewportHeight}px`;
    updateScrollIndicator();
  }

  function focusMenuItem(preferredItem = lastFocusedItem) {
    const focusableItems = Array.from(
      uiContainer.querySelectorAll('[tabindex]')
    ).filter((item) => item.tabIndex > 0 && item.getClientRects?.().length !== 0);

    const target = focusableItems.includes(preferredItem) ? preferredItem : sections.currentButton();

    if (target) {
      target.focus();
      queueMenuItemScroll(target);
      currentFocusIndex = focusableItems.indexOf(target);
      if (target.tabIndex !== null && target.tabIndex > 0) {
        lastFocusedItem = target;
      }
      return true;
    }

    uiContainer.focus();
    return false;
  }

  function openContainer() {
    ensureSettingsMounted(document, uiContainer);
    renderClockStatus();
    renderResumeStatus();
    if (typeof window !== 'undefined') window.__ytafSponsorPrompt?.dismiss();
    console.info('Container: Showing & Focusing!');
    latestFocus =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    suspendSpatialNavigation();
    applyVisibleContainerStyles();
    document.dispatchEvent(new CustomEvent('ytaf-menu-opened'));
    if (sections.current() === 'diagnostics') document.dispatchEvent(new CustomEvent('ytaf-diagnostics-opened'));
    menuOffset = 0;
    menuContent.style.top = '0';
    menuViewport.scrollTop = 0;
    uiContainer.scrollTop = 0;

    setTimeout(() => {
      if (isContainerOpen()) focusMenuItem();
    }, 0);
  }

  function menuHasFocus() {
    return Boolean(
      document.activeElement &&
      (document.activeElement === uiContainer || uiContainer.contains(document.activeElement) || choiceTools.contains(document.activeElement))
    );
  }

  function captureMenuFocus() {
    if (!isContainerOpen() || menuHasFocus()) {
      return;
    }
    focusMenuItem();
  }

  function queueMenuFocusGuard() {
    if (!isContainerOpen() || focusGuardFrame !== null) return;

    focusGuardFrame = window.requestAnimationFrame(() => {
      focusGuardFrame = null;
      captureMenuFocus();
    });
  }

  function guardMenuFocus(evt) {
    if (
      isContainerOpen() &&
      evt.target &&
      evt.target !== uiContainer &&
      !uiContainer.contains(evt.target) && !choiceTools.contains(evt.target)
    ) {
      queueMenuFocusGuard();
    }
  }

  function closeContainer() {
    console.info('Container: Hiding!');
    const pendingChoiceRelease = choiceTools.resetKeys?.();
    if (heldActivationControl || pendingChoiceRelease) closedActivationReleaseUntil = Date.now() + 1000;
    heldActivationControl = null;
    if (menuScrollFrame !== null) {
      window.cancelAnimationFrame(menuScrollFrame);
      menuScrollFrame = null;
    }
    if (focusGuardFrame !== null) {
      window.cancelAnimationFrame(focusGuardFrame);
      focusGuardFrame = null;
    }
    if (directionMoveFrame !== null) {
      window.cancelAnimationFrame(directionMoveFrame);
      directionMoveFrame = null;
    }
    choiceTools.close(false);
    uiContainer.style.display = 'none';
    uiContainer.style.visibility = 'hidden';
    uiContainer.style.pointerEvents = 'none';
    document.dispatchEvent(new CustomEvent('ytaf-menu-closed'));
    heldDirection = null;
    const menuFocus = document.activeElement;
    if (menuFocus && uiContainer.contains(menuFocus) && typeof menuFocus.blur === 'function') {
      menuFocus.blur();
    }
    restoreSpatialNavigation();

    const focusBeforeMenu = latestFocus;
    latestFocus = null;
    const restoreFocus = () => {
      if (
        focusBeforeMenu && document.documentElement.contains(focusBeforeMenu) &&
        typeof focusBeforeMenu.focus === 'function' &&
        !uiContainer.contains(focusBeforeMenu)
      ) {
        focusBeforeMenu.focus();
      }
    };
    restoreFocus();
    // Some Cobalt versions update focus once more after the colour-key keydown.
    setTimeout(restoreFocus, 0);
  }

  const handleNumericShortcut = createShortcutHandler(document, configRead, action => {
    if (action === 'refresh_home') refreshHome();
    if (action === 'captions') toggleSubtitles((state, name) => {
      showNotification(text({on:'subtitleOn',off:'subtitleOff',unavailable:'subtitleUnavailable'}[state] || 'subtitleUnavailable') + (state === 'on' && name ? ` (${name})` : ''), 1800, 'green');
    });
    if (action === 'slower' || action === 'faster') adjustPlaybackRate(action === 'slower' ? -1 : 1);
    if (action === 'reset_speed') playbackSpeed.reset();
    if (action === 'end_stop') window.__ytafEndStop?.activate();
    if (action === 'cancel_timer') { window.__ytafSleepTimer?.timer.setMinutes(0); showNotification('Sleep timer cancelled.',2000,'green'); }
    if (action === 'skip' && !window.sponsorblock?.skipCurrentSegment()) showNotification('No skippable segment here.',2000,'green');
  }, window);

  window.addEventListener('blur', () => {
    handleNumericShortcut.reset();
    heldActivationControl = null;
    closedActivationReleaseUntil = 0;
    heldDirection = null;
    choiceTools.resetKeys?.();
  });
  const menuBackGuard = createMenuBackGuard(isContainerOpen, closeContainer);
  const eventHandler = (evt) => {
    if (typeof revealPlaybackControls !== 'undefined' && revealPlaybackControls.isSynthetic(evt)) return true;
    const activationKey = evt.key === 'Enter' || evt.key === ' ' || [13,32].includes(evt.keyCode || evt.which);
    // A missing release from settings must not swallow the next deliberate OK.
    // Still consume the trailing release of the gesture that closed the menu.
    if (activationKey && closedActivationReleaseUntil) {
      if ((evt.type === 'keydown' && !evt.repeat) || Date.now() > closedActivationReleaseUntil) closedActivationReleaseUntil = 0;
      else {
        if (evt.type === 'keyup') closedActivationReleaseUntil = 0;
        evt.preventDefault();evt.stopPropagation();evt.stopImmediatePropagation?.();
        return false;
      }
    }
    const activationRelease = evt.type === 'keyup' && heldActivationControl &&
      (evt.key === 'Enter' || evt.key === ' ' || [13, 32].includes(evt.keyCode || evt.which));
    if (activationRelease) {
      const wrapper = heldActivationControl.parentElement;
      if (wrapper) wrapper.dataset.ytafIgnoreClickUntil = String(Date.now() + 1000);
      heldActivationControl = null;
    }
    if (typeof choiceTools !== 'undefined' && choiceTools.handleKey?.(evt)) return false;
    if (activationRelease) {
      evt.preventDefault(); evt.stopPropagation(); evt.stopImmediatePropagation?.();
      return false;
    }
    if (typeof menuBackGuard !== 'undefined' && menuBackGuard(evt)) return false;
    const menuOpen = isContainerOpen();
    if (typeof window !== 'undefined' && window.__ytafPromptRelease?.(evt)) return false;
    if (!menuOpen && typeof window !== 'undefined' && window.__ytafSponsorPrompt?.handleKey(evt)) return false;
    if (typeof handleNumericShortcut !== 'undefined' && handleNumericShortcut(evt, !menuOpen)) return false;
    if (typeof handlePlaybackSeek !== 'undefined' && handlePlaybackSeek(evt, !menuOpen)) return false;
    const focusInsideMenu = menuOpen && menuHasFocus();
    const eventDirection = menuOpen ? getDirectionFromEvent(evt) : null;
    const isActivationKey =
      evt.key === 'Enter' ||
      evt.key === ' ' ||
      evt.code === 'Space' ||
      evt.keyCode === 13 ||
      evt.keyCode === 32 ||
      evt.which === 13 ||
      evt.which === 32;

    // Cobalt may send repeated presses without setting KeyboardEvent.repeat.
    // Keep the control latched until release, including during guide rerenders.
    if (isActivationKey && heldActivationControl) {
      const wrapper = heldActivationControl.parentElement;
      if (wrapper) {
        wrapper.dataset.ytafIgnoreClickUntil = String(Date.now() + 1000);
      }
      if (evt.type === 'keyup') heldActivationControl = null;
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation?.();
      return false;
    }

    if (menuOpen && isActivationKey && evt.type !== 'keydown') {
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation?.();
      return false;
    }

    if (evt.type === 'keyup' && eventDirection) {
      if (heldDirection === eventDirection) {
        heldDirection = null;
      }
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation?.();
      return false;
    }

    if (evt.type === 'keydown' && menuOpen) {
      if (!focusInsideMenu) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation?.();
        captureMenuFocus();
        // This press only brings focus back. Acting on it as well would move
        // past, or toggle, a control the user could not see was focused.
        if (eventDirection || isActivationKey) return false;
      }

      const direction = eventDirection;
      if (direction) {
        evt.preventDefault();
        evt.stopPropagation();
      evt.stopImmediatePropagation?.();
        const now = Date.now();
        if (
          evt.repeat ||
          (heldDirection === direction && now - heldDirectionAt < 400)
        ) {
          return false;
        }
        heldDirection = direction;
        heldDirectionAt = now;
        queueDirectionMove(direction);
        return false;
      }

      if (isActivationKey) {
        evt.preventDefault();
        evt.stopPropagation();
      evt.stopImmediatePropagation?.();
        if (evt.repeat) return false;
        const focusedElement = document.querySelector(':focus');
        if (focusedElement && focusedElement.id) {
          heldActivationControl = focusedElement;
          // prevent the synthetic click from toggling again
          const wrapper = focusedElement.parentElement;
          if (wrapper) {
            wrapper.dataset.ytafIgnoreClickUntil = String(Date.now() + 1000);
          }
          if (focusedElement.dataset.ytafControl === 'action') {
            focusedElement.__ytafActivate?.();
            queueMenuItemScroll(focusedElement);
          } else if (focusedElement.dataset.ytafControl === 'choice') {
            choiceTools.open(focusedElement.id, evt.keyCode || (evt.key === 'Enter' ? 13 : 32));
          } else if (focusedElement.dataset.ytafControl !== 'reader') {
            checkboxTools.toggleCheck(focusedElement.id);
          }
        }
        return false;
      }

      if (evt.key === 'Escape' || evt.keyCode === 27 || evt.keyCode === 461 || evt.keyCode === 8) {
        evt.preventDefault();
        evt.stopPropagation();
      evt.stopImmediatePropagation?.();
        closeContainer();
        return false;
      }
    }

    if (isGreenKey(evt)) {
      console.info('Taking over!');
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation?.();
      const now = Date.now();
      if (evt.type === 'keydown' && !evt.repeat && now - lastGreenKeyAt > 350) {
        lastGreenKeyAt = now;
        if (!isContainerOpen()) {
          openContainer();
        } else {
          closeContainer();
        }
      }
      return false;
    }

    if (
      evt.type === 'keydown' &&
      evt.charCode == 0 &&
      evt.keyCode == 187
    ) {
      // char '='
      if (!isContainerOpen()) {
        openContainer();
        evt.preventDefault();
        evt.stopPropagation();
      evt.stopImmediatePropagation?.();
      } else {
        closeContainer();
        evt.preventDefault();
        evt.stopPropagation();
      evt.stopImmediatePropagation?.();
      }
    }
    if (menuOpen) {
      // The settings menu is modal: keys it does not use (media, colour,
      // digits) must not reach YouTube's player behind it.
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation?.();
      return false;
    }
    if (typeof revealPlaybackControls !== 'undefined') revealPlaybackControls.handleKey?.(evt);
    return true;
  };

  // Red, Green, Yellow, Blue
  // 403, 404, 405, 406
  // ---, 172, 170, 191
  window.addEventListener('keydown', eventHandler, true);
  window.addEventListener('keypress', eventHandler, true);
  window.addEventListener('keyup', eventHandler, true);
  window.addEventListener('resize', () => {
    if (isContainerOpen()) {
      applyVisibleContainerStyles();
      queueMenuItemScroll(document.activeElement);
    }
  });
  // YouTube's visible player controls can reclaim focus after handling a key.
  // While our menu is open, keep focus modal and restore the last menu item.
  document.addEventListener('focus', guardMenuFocus, true);

  function guardMenuPointer(event) {
    if (!isContainerOpen() || uiContainer.contains(event.target) || choiceTools.contains(event.target)) return;
    // The dimmed area belongs to the settings modal too. A cursor click there
    // must not select a YouTube thumbnail or toggle playback behind the menu.
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
  }
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'])
    document.addEventListener(type, guardMenuPointer, true);

  // Own the wheel only while our modal menu is open. Otherwise Cobalt's
  // native wheel event reaches YouTube unchanged.
  document.addEventListener('wheel', (event) => {
    if (typeof choiceTools !== 'undefined' && choiceTools.handleWheel?.(event)) return;
    if (!isContainerOpen() || event.ctrlKey) return;
    const rect = menuViewport.getBoundingClientRect();
    const delta = wheelScrollDelta(event, rect.height, sections.current() === 'diagnostics' ? 72 : undefined);
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    if (menuScrollFrame !== null) {
      window.cancelAnimationFrame(menuScrollFrame);
      menuScrollFrame = null;
    }
    if (directionMoveFrame !== null) {
      window.cancelAnimationFrame(directionMoveFrame);
      directionMoveFrame = null;
    }
    menuOffset = Math.max(0, Math.min(
      Math.max(0, menuContent.scrollHeight - rect.height), menuOffset + delta
    ));
    menuContent.style.top = `${-menuOffset}px`;
    // Keep OK and subsequent arrows attached to a visible control, without
    // activating it or snapping back to the previously focused setting.
    const items = Array.from(menuContent.querySelectorAll('[tabindex]'))
      .filter(item => item.tabIndex > 0 && item.getClientRects?.().length !== 0);
    const visible = item => {
      const box = item.getBoundingClientRect();
      return item.dataset?.ytafControl === 'reader'
        ? box.bottom > rect.top && box.top < rect.bottom
        : box.top >= rect.top && box.bottom <= rect.bottom;
    };
    const target = visible(document.activeElement) && items.includes(document.activeElement)
      ? document.activeElement : items.find(visible);
    if (target) {
      wheelFocusing = true;
      try { target.focus(); } finally { wheelFocusing = false; }
      currentFocusIndex = -1;
      lastFocusedItem = target;
    } else {
      // A tall text-only section (help/report) may fill the entire viewport.
      // Focus the container so OK cannot toggle an off-screen setting.
      uiContainer.focus();
      currentFocusIndex = -1;
    }
    menuViewport.scrollTop = 0;
    uiContainer.scrollTop = 0;
  }, {capture: true, passive: false});

  window.__ytafAttachSettings = () => ensureSettingsMounted(document, uiContainer);
  window.__ytafUiInitialized = true;
}

export function showNotification(text, time = 3000, variant = 'yellow') {
  console.info('Show notification: ' + text);
  if (!document.querySelector('.ytaf-notification-container')) {
    console.info('Adding notification container');
    const c = document.createElement('div');
    c.classList.add('ytaf-notification-container');
    document.body.appendChild(c);
  }

  const elm = document.createElement('div');
  const elmInner = document.createElement('div');
  elmInner.textContent = text;
  elmInner.classList.add('message');
  elmInner.classList.add(`message-${variant}`);
  elmInner.classList.add('message-hidden');
  elm.appendChild(elmInner);
  const notificationContainer = document.querySelector('.ytaf-notification-container');
  if (!notificationContainer) return;
  notificationContainer.appendChild(elm);
  // Keep feedback above a reopened settings surface without intercepting clicks.
  (document.body || document.documentElement).appendChild(notificationContainer);

  setTimeout(() => {
    elmInner.classList.remove('message-hidden');
  }, 100);
  setTimeout(() => {
    if (elm.parentNode) elm.parentNode.removeChild(elm);
    if (!notificationContainer.children.length && notificationContainer.parentNode)
      notificationContainer.parentNode.removeChild(notificationContainer);
  }, time);
}
