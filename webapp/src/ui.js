/*global navigate*/

// import './spatial-navigation-polyfill.js';
import './navigation-checkbox.js';

import './ui.css';
import { startPlaybackResume } from './playback-resume.mjs';
import { createPlaybackSeek } from './playback-seek.mjs';
import { startPlaybackSpeed, playbackRates } from './playback-speed.mjs';
import { createSettingsSections } from './settings-sections.mjs';
import { wheelScrollDelta } from './wheel-scroll.mjs';
import { createMenuBackGuard } from './menu-back-guard.mjs';
import { createCaptionSettings } from './caption-preferences.mjs';
import { createDeArrowSettings } from './dearrow.mjs';
import { createShortcutHandler, createShortcutSettings } from './remote-shortcuts.mjs';
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

let lastTabIndex = 0;

function text(key) {
  return languageText('ui', key);
}

export function userScriptStartUI() {
  if (window.__ytafUiInitialized && document.querySelector('.ytaf-ui-container')) {
    return;
  }
  window.__ytafUiInitialized = true;
  console.info('[ytaf] userScriptStartUI() called');

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

    const visibleMargin = 8;
    const row = item.dataset?.ytafControl === 'reader' ? item : item.parentElement && uiContainer.contains(item.parentElement)
      ? item.parentElement
      : item;
    const viewportRect = menuViewport.getBoundingClientRect();
    const itemRect = row.getBoundingClientRect();
    const visibleTop = viewportRect.top + visibleMargin;
    const visibleBottom = viewportRect.bottom - visibleMargin;

    if (itemRect.top < visibleTop) {
      menuOffset += itemRect.top - visibleTop;
    } else if (item.dataset?.ytafControl !== 'reader' && itemRect.bottom > visibleBottom) {
      menuOffset += itemRect.bottom - visibleBottom;
    }

    const viewportHeight = Math.max(0, visibleBottom - visibleTop);
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
      menuOffset = Math.max(0, Math.min(Math.max(0, menuContent.scrollHeight - size), menuOffset + (dir === 'down' ? 1 : -1) * size * .7));
      menuContent.style.top = `${-menuOffset}px`; menuViewport.scrollTop = 0; return;
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
      lastTabIndex = nextItem.tabIndex;
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
        lastTabIndex = focusAfterEvent.tabIndex;
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
        lastTabIndex = focusedElement.tabIndex;
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

  const divTitle = document.createElement('div');
  divTitle.classList.add('center');
  const title = document.createElement('h1');
  const brand = document.createElement('div');
  brand.className = 'ytaf-brand'; brand.textContent = 'YouTube AdFree';
  divTitle.appendChild(brand);
  title.textContent = 'Settings';
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
  const menuHint = document.createElement('div');
  menuHint.className = 'ytaf-menu-hint';
  menuHint.textContent = '↑ ↓ Navigate   ·   → Open category   ·   ← Categories   ·   OK Select   ·   BACK Close   ·   Wheel Scroll';
  divTitle.appendChild(menuHint);
  const saveStatus = document.createElement('div');
  saveStatus.className = 'ytaf-save-status';
  saveStatus.setAttribute('aria-live', 'polite');
  function refreshSaveStatus() {
    const persisted = configPersistenceStatus();
    saveStatus.textContent = persisted === false
      ? 'Could not save menu preferences. Changes apply only for this session; try changing a setting again.'
      : persisted === true ? 'Changes saved' : 'Changes save automatically';
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
  const videoQuality = createVideoCapabilitySetting(document, window, choiceTools);
  videoQuality.dataset.ytafSection = 'playback';
  uiContainer.appendChild(videoQuality);
  uiContainer.appendChild(createSleepTimerPanel(document, window, choiceTools, showNotification));
  const resume = window.__ytafResume || (window.__ytafResume = startPlaybackResume(document, window,
    configRead, persistPlaybackPositions, showNotification));
  const playbackPreferences = document.createElement('div');
  playbackPreferences.dataset.ytafSection = 'playback';
  const playbackSpeed = startPlaybackSpeed(document,window,configRead,configWrite,showNotification);
  playbackPreferences.appendChild(choiceTools.add('__playback_speed','Playback speed',configRead('playbackSpeed'),
    [{value:'youtube',label:'YouTube choice'},...playbackRates.map(rate=>({value:String(rate),label:`${rate}×`}))],
    value=>configWrite('playbackSpeed',value)));
  const speedStatus=document.createElement('div');speedStatus.className='ytaf-setting-help';
  playbackSpeed.render=()=>{speedStatus.textContent=playbackSpeed.status;choiceTools.setValue('__playback_speed',configRead('playbackSpeed'));};
  playbackSpeed.render();playbackPreferences.appendChild(speedStatus);
  playbackPreferences.appendChild(checkboxTools.add('__remember_position', 'Remember playback position on this TV',
    configRead('rememberPlaybackPosition'), callbackConfig('rememberPlaybackPosition')));
  playbackPreferences.appendChild(choiceTools.add('__seek_behavior', 'Left / Right seeking', configRead('seekBehavior'), [
    {value:'youtube',label:'YouTube default (OK to confirm)'},
    {value:'immediate',label:'Immediately'},
    {value:'delayed',label:'After a short pause (300 ms)'}
  ], callbackConfig('seekBehavior')));
  const playbackHint = document.createElement('div'); playbackHint.className='ytaf-setting-help';
  playbackHint.textContent='Positions are saved on this TV, separately for each app install. Live streams and Shorts are excluded. Automatic seeking uses 10-second steps during playback or on the timeline; other controls keep normal arrow navigation.';
  playbackPreferences.appendChild(playbackHint);
  const clearRow=document.createElement('div'), clearPositions=document.createElement('div');
  clearPositions.id='__clear_playback_positions';clearPositions.tabIndex=903;clearPositions.className='ytaf-diagnostic-action';
  clearPositions.dataset.ytafControl='action';clearPositions.setAttribute('role','button');
  clearPositions.textContent='Clear saved playback positions';clearPositions.__ytafActivate=()=>resume.clear();
  clearPositions.addEventListener('click',()=>{if(Number(clearRow.dataset.ytafIgnoreClickUntil||0)<=Date.now())resume.clear();});
  clearRow.appendChild(clearPositions);playbackPreferences.appendChild(clearRow);uiContainer.appendChild(playbackPreferences);
  let seekPreview=null;
  const handlePlaybackSeek=createPlaybackSeek(document,window,configRead,target=>{
    if(target===null){if(seekPreview?.parentNode)seekPreview.parentNode.removeChild(seekPreview);seekPreview=null;return;}
    if(!seekPreview){seekPreview=document.createElement('div');seekPreview.className='ytaf-seek-preview';seekPreview.setAttribute('role','status');document.body.appendChild(seekPreview);}
    const seconds=Math.floor(target), minutes=Math.floor(seconds/60);
    seekPreview.textContent=`Seek to ${minutes}:${String(seconds%60).padStart(2,'0')}`;
  },showNotification);

  uiContainer.appendChild(checkboxTools.add(
    '__numeric_shortcuts', 'Numeric playback shortcuts',
    configRead('enableNumericShortcuts'), callbackConfig('enableNumericShortcuts')
  ));
  uiContainer.appendChild(createShortcutSettings(document, choiceTools, configRead, configWrite));
  uiContainer.appendChild(createEndStopPanel(document, window, showNotification));
  uiContainer.appendChild(createCaptionSettings(document, window, choiceTools, configRead, configWrite));
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
    choiceTools.close(false);
    if (menuScrollFrame !== null) window.cancelAnimationFrame(menuScrollFrame);
    menuScrollFrame = null;
    menuOffset = 0; menuContent.style.top = '0';
    currentFocusIndex = -1;
    // A category can be changed by pointer while a hidden setting had focus.
    sections.currentButton().focus();
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
    Object.assign(uiContainer.style, {
      position: 'fixed', display: 'block', visibility: 'visible', opacity: '1',
      left: '5vw', top: '5vh', width: '90vw', maxWidth: '1160px',
      height: '90vh', maxHeight: '90vh', boxSizing: 'border-box',
      overflow: 'hidden', zIndex: '2147483647', pointerEvents: 'auto',
      background: '#101e30', color: '#eef4ff', border: '1px solid #31465f',
      borderRadius: '24px', padding: '28px', fontSize: '22px',
      lineHeight: '1.4', fontFamily: 'Arial, sans-serif',
      transform: 'none', animation: 'none',
      boxShadow: '0 20px 64px rgba(0,0,0,0.35), 0 0 0 9999px rgba(3,9,18,0.55)'
    });
    const viewportHeight = Math.max(
      0, uiContainer.clientHeight - 56 - divTitle.offsetHeight - 18
    );
    sections.nav.style.top = `${28 + divTitle.offsetHeight + 18}px`;
    sections.nav.style.height = `${viewportHeight}px`;
    menuViewport.style.height = `${viewportHeight}px`;
  }

  function focusMenuItem(preferredTabIndex = lastTabIndex) {
    const focusableItems = Array.from(
      uiContainer.querySelectorAll('[tabindex]')
    ).filter((item) => item.tabIndex > 0 && item.getClientRects?.().length !== 0);

    let target = null;
    if (preferredTabIndex > 0) {
      target =
        focusableItems.find((item) => item.tabIndex === preferredTabIndex) ||
        sections.currentButton();
    } else {
      target = sections.currentButton();
    }

    if (target) {
      target.focus();
      queueMenuItemScroll(target);
      currentFocusIndex = focusableItems.indexOf(target);
      if (target.tabIndex !== null && target.tabIndex > 0) {
        lastTabIndex = target.tabIndex;
      }
      return true;
    }

    uiContainer.focus();
    return false;
  }

  function openContainer() {
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
    if (action === 'captions') toggleSubtitles((state, name) => {
      showNotification(text({on:'subtitleOn',off:'subtitleOff',unavailable:'subtitleUnavailable'}[state] || 'subtitleUnavailable') + (state === 'on' && name ? ` (${name})` : ''), 1800, 'green');
    });
    if (action === 'slower' || action === 'faster') adjustPlaybackRate(action === 'slower' ? -1 : 1);
    if (action === 'end_stop') window.__ytafEndStop?.activate();
    if (action === 'cancel_timer') { window.__ytafSleepTimer?.timer.setMinutes(0); showNotification('Sleep timer cancelled.',2000,'green'); }
    if (action === 'skip' && !window.sponsorblock?.skipCurrentSegment()) showNotification('No skippable segment here.',2000,'green');
  });

  window.addEventListener('blur', () => handleNumericShortcut.reset());
  const menuBackGuard = createMenuBackGuard(isContainerOpen, closeContainer);
  const eventHandler = (evt) => {
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
    return true;
  };

  // Red, Green, Yellow, Blue
  // 403, 404, 405, 406
  // ---, 172, 170, 191
  window.addEventListener('keydown', eventHandler, true);
  window.addEventListener('keypress', eventHandler, true);
  window.addEventListener('keyup', eventHandler, true);
  // YouTube's visible player controls can reclaim focus after handling a key.
  // While our menu is open, keep focus modal and restore the last menu item.
  document.addEventListener('focus', guardMenuFocus, true);

  // Own the wheel only while our modal menu is open. Otherwise Cobalt's
  // native wheel event reaches YouTube unchanged.
  document.addEventListener('wheel', (event) => {
    if (typeof choiceTools !== 'undefined' && choiceTools.handleWheel?.(event)) return;
    if (!isContainerOpen() || event.ctrlKey) return;
    const rect = menuViewport.getBoundingClientRect();
    const delta = wheelScrollDelta(event, rect.height);
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
      lastTabIndex = target.tabIndex;
    } else {
      // A tall text-only section (help/report) may fill the entire viewport.
      // Focus the container so OK cannot toggle an off-screen setting.
      uiContainer.focus();
      currentFocusIndex = -1;
    }
    menuViewport.scrollTop = 0;
    uiContainer.scrollTop = 0;
  }, {capture: true, passive: false});




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

  setTimeout(() => {
    elmInner.classList.remove('message-hidden');
  }, 100);
  setTimeout(() => {
    if (elm.parentNode) elm.parentNode.removeChild(elm);
    if (!notificationContainer.children.length && notificationContainer.parentNode)
      notificationContainer.parentNode.removeChild(notificationContainer);
  }, time);
}
