// Pointer focus + minimal row reveal, following PlxNative's CardRow and HitMap:
// https://github.com/danzig666/plx-native/tree/47fd8bbc6c2ca70ab90507b3dc6ccf02672182f7/rust-modules/src/ui
// DOM adaptation: pixel-based reveal for both scroll containers and virtual tracks.
const cards = 'ytlr-tile-renderer, ytlr-grid-video-renderer, ytlr-video-renderer, ytlr-compact-video-renderer';
const candidates = cards + ', [tabindex]';
const rails = 'ytlr-shelf-renderer, ytlr-horizontal-list-renderer, [role="list"]';
const overlays = '.ytaf-ui-container, .ytaf-choice-popup, [role="dialog"], [role="menu"], [role="listbox"]';

export function horizontalReveal(current, left, right, cardLeft, cardRight, maximum, gap) {
  if (![current,left,right,cardLeft,cardRight,maximum,gap].every(Number.isFinite) ||
      right <= left || cardRight <= cardLeft || maximum < 0) return current;
  // PlxNative's nearest legal reveal: a card with breathing room never moves.
  const low = current + cardRight + gap - right;
  const high = current + cardLeft - gap - left;
  return Math.max(0, Math.min(maximum, Math.max(Math.min(low, high), Math.min(high, current))));
}

function bounds(node) {
  const r = node?.getBoundingClientRect?.();
  return r && [r.left,r.right,r.top,r.bottom,r.width,r.height].every(Number.isFinite) &&
    r.width > 0 && r.height > 0 ? r : null;
}
function ancestor(node, selector, stop = null) {
  for (let depth = 0; node && node !== stop && depth < 24; depth++, node = node.parentElement)
    if (node.matches?.(selector)) return node;
  return null;
}

export function startPointerRowScroll(doc, win, read) {
  let frame = null, motion = null, pending = null, lastPoint = null;
  let dpadAt = null, pressed = false, menu = false, stopped = false, lastCard = null;
  let animation = null, nativeReveal = null;
  const tracks = new Map();
  const api = {moves: 0, status: 'Point at a video card to reveal it.', destroy};
  const scale = () => Math.max(0.5, (win.innerWidth || 1920) / 1920);
  function cancelMotion() {
    if (nativeReveal !== null) win.clearTimeout(nativeReveal);
    nativeReveal = null;
    if (motion !== null) win.cancelAnimationFrame(motion);
    motion = null; animation = null;
  }
  function cancel() {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null; pending = null; lastCard = null; cancelMotion();
  }
  function attached(node) { return Boolean(node && doc.documentElement?.contains(node)); }
  function visible(node) {
    if (!attached(node)) return false;
    const r = bounds(node);
    if (!r || r.right <= 0 || r.left >= win.innerWidth || r.bottom <= 0 || r.top >= win.innerHeight) return false;
    for (let parent = node, depth = 0; parent && depth < 24; parent = parent.parentElement, depth++) {
      const style = win.getComputedStyle(parent);
      if (!style || style.display === 'none' || style.visibility === 'hidden' ||
          style.visibility === 'collapse' || (style.opacity !== '' && Number(style.opacity) === 0) ||
          parent.getAttribute?.('aria-hidden') === 'true') return false;
    }
    return true;
  }
  function blocked() {
    if (stopped || menu || !read('pointerRowScroll') || doc.hidden || doc.visibilityState === 'hidden' ||
        doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH') ||
        doc.body?.classList.contains('WEB_PAGE_TYPE_SHORTS')) return true;
    const nodes = doc.querySelectorAll(overlays);
    for (let i = 0; i < nodes.length; i++) if (visible(nodes[i])) return true;
    return false;
  }
  function rowFor(card, rect) {
    let node = card.parentElement, fallback = null;
    for (let depth = 0; node && node !== doc.body && depth < 12; depth++, node = node.parentElement) {
      const box = bounds(node);
      if (!box || !visible(node)) continue;
      const style = win.getComputedStyle(node);
      const scrollable = /^(auto|scroll)$/.test(style.overflowX || style.overflow) &&
        Number.isFinite(node.scrollLeft) && node.scrollWidth > node.clientWidth + 2;
      // YouTube changes shelf wrapper names. Geometry also identifies a
      // clipped horizontal rail without requiring one particular component.
      const clipped = /^(hidden|clip)$/.test(style.overflowX || style.overflow);
      if (!scrollable && !clipped && !node.matches?.(rails)) continue;
      const siblings = node.querySelectorAll(candidates);
      let horizontal = false;
      for (let i = 0; i < siblings.length && i < 100; i++) {
        const sibling = siblings[i];
        if (sibling === card || card.contains(sibling) || sibling.contains(card)) continue;
        const other = bounds(sibling);
        if (other && Math.abs((other.top + other.bottom - rect.top - rect.bottom) / 2) < rect.height / 3 &&
            Math.abs(other.left - rect.left) > rect.width / 2) { horizontal = true; break; }
      }
      if (horizontal) {
        if (scrollable) return {node, box, scrollable};
        // An inner clipping/transform wrapper may sit inside the real rail.
        // Keep looking for the ancestor whose scrollLeft can actually move.
        if (!fallback || box.width <= fallback.box.width) fallback = {node, box, scrollable};
      }
    }
    return fallback;
  }
  function focusTarget(card, row) {
    if (card.hasAttribute?.('tabindex') || card.matches?.('a[href], button')) return card;
    const nested = card.querySelector?.('[tabindex], a[href]');
    if (nested) return nested;
    // A surrounding native focus wrapper is valid only when it belongs to
    // this card, rather than being a shared list/container for many cards.
    const rect = bounds(card);
    for (let node = card.parentElement; node && node !== row; node = node.parentElement) {
      const box = bounds(node);
      if (rect && box && (node.hasAttribute?.('tabindex') || node.matches?.('a[href], button'))) {
        const children = node.querySelectorAll(candidates);
        let shared = false;
        for (let i = 0; i < children.length; i++)
          if (children[i] !== card && !card.contains(children[i]) && !children[i].contains(card)) {shared = true;break;}
        if (!shared) return node;
      }
    }
    return card;
  }
  function ownsFocus(card, target) {
    const active = doc.activeElement;
    return active === target || card.contains(active) || target.contains?.(active);
  }
  function rtl(row) {
    if (row.scrollLeft < 0 || win.getComputedStyle(row).direction === 'rtl') return true;
    // Cobalt's CSSStyleDeclaration omits .direction; HTML dir still works.
    const owner = ancestor(row,'[dir]');
    return owner?.getAttribute('dir')?.toLowerCase() === 'rtl';
  }
  // Find the shared content track, never translate the clipping viewport or
  // a shelf heading. Reject containers that also contain another video row.
  function trackFor(row, card) {
    const rect = bounds(card);
    for (let node = card.parentElement; node && node !== row.node; node = node.parentElement) {
      const peers = node.querySelectorAll(candidates);
      let horizontal = false, otherRow = false;
      for (let i=0; i<peers.length && i<200; i++) {
        if (peers[i] === card || peers[i].contains(card) || card.contains(peers[i])) continue;
        const r = bounds(peers[i]);
        if (!r) continue;
        if (Math.abs((r.top+r.bottom-rect.top-rect.bottom)/2)>rect.height/2) otherRow = true;
        else if (Math.abs(r.left-rect.left)>rect.width/2) horizontal = true;
      }
      if (horizontal && !otherRow) return node;
    }
    return null;
  }
  function releaseTracks() {
    for (const [node,state] of tracks) {
      // YouTube may replace a transform itself. Never restore stale state over
      // an application update, and do not keep detached rows alive.
      if (node.style.getPropertyValue('transform') === state.written) {
        if (state.original) node.style.setProperty('transform',state.original,state.priority);
        else node.style.removeProperty('transform');
      }
      if (node.style.getPropertyValue('transition') === 'none') {
        if (state.transition) node.style.setProperty('transition',state.transition,state.transitionPriority);
        else node.style.removeProperty('transition');
      }
    }
    tracks.clear();
  }
  function priority(style,name) {
    // Cobalt exposes setProperty's priority argument, but no getPropertyPriority.
    return new RegExp('(?:^|;)\\s*'+name+'\\s*:[^;]*!important\\s*(?:;|$)','i').test(style.cssText) ? 'important' : '';
  }
  function pixelTrack(row,card) {
    for (const [old] of tracks) if (!attached(old)) tracks.delete(old);
    const node = trackFor(row,card);
    if (!node) return null;
    let state = tracks.get(node);
    if (state && node.style.getPropertyValue('transform') !== state.written) {
      // Native navigation changed the row. Its new transform becomes the base.
      state.original = node.style.getPropertyValue('transform');
      state.priority = priority(node.style,'transform');
      const base = win.getComputedStyle(node).transform;
      state.base = base && base !== 'none' ? base : '';
      state.offset = 0;state.written = state.original;
      if (node.style.getPropertyValue('transition') !== 'none') {
        state.transition = node.style.getPropertyValue('transition');
        state.transitionPriority = priority(node.style,'transition');
      }
    }
    if (!state) {
      const style = node.style, base = win.getComputedStyle(node).transform;
      state = {node,offset:0,base:base && base !== 'none' ? base : '',
        original:style.getPropertyValue('transform'),priority:priority(style,'transform'),
        transition:style.getPropertyValue('transition'),transitionPriority:priority(style,'transition'),
        written:style.getPropertyValue('transform')};
      tracks.set(node,state);
    }
    return state;
  }
  function writeOffset(a,value) {
    if (!a.track) {a.row.scrollLeft = value;return a.row.scrollLeft;}
    const state = a.track;
    state.offset = value;
    state.node.style.setProperty('transition','none');
    state.node.style.setProperty('transform','translateX('+value+'px) '+state.base,state.priority);
    state.written = state.node.style.getPropertyValue('transform');
    return value;
  }
  function step(time) {
    motion = null;
    const a = animation;
    if (!a || !Number.isFinite(time) || blocked() || !attached(a.row) || !attached(a.card) ||
        !ownsFocus(a.card, a.focus) ||
        (a.track ? !attached(a.track.node) || a.track.node.style.getPropertyValue('transform') !== a.track.written
          : Math.abs(a.row.scrollLeft - a.last) > 2)) {cancelMotion();return;}
    // Exact critically damped spring, like PlxNative K_SCROLL=170, with a
    // bounded lifetime. Virtual tracks use the same spring in pixel space.
    const t = Math.max(0, Math.min(1, (time - a.start) / 1000));
    const omega = Math.sqrt(170);
    const progress = 1 - (1 + omega * t) * Math.exp(-omega * t);
    a.last = a.from + (a.to - a.from) * progress;
    a.last = writeOffset(a,a.last);
    if (Math.abs(a.to - a.last) < 0.5 || t >= 1 || --a.remaining <= 0) {
      writeOffset(a,a.to);
      const after = bounds(a.card);
      api.status = after && Math.abs(after.left-a.cardLeft)>2 ? 'Row movement confirmed.' : 'Scroll requested; card position did not change.';
      animation = null; return;
    }
    motion = win.requestAnimationFrame(step);
  }
  function reveal(row, card, target) {
    if (rtl(row.node)) return;
    const rect = bounds(card);
    if (!rect) return;
    // Leave about half a neighbouring card visible, rather than snapping the
    // row to a tile index. The same nearest-reveal rule works in either direction.
    const peek = Math.min(120 * scale(), rect.width / 2, row.box.width / 4);
    const viewportLeft = Math.max(0,row.box.left), viewportRight = Math.min(win.innerWidth,row.box.right);
    const left = viewportLeft + peek, right = viewportRight - peek;
    let track = null, current, goal;
    if (row.scrollable) {
      current = row.node.scrollLeft;
      goal = horizontalReveal(current,left,right,rect.left,rect.right,
        row.node.scrollWidth-row.node.clientWidth,28*scale());
    } else {
      track = pixelTrack(row,card);
      if (!track) {api.status = 'No separate horizontal track found.';return;}
      const peers = track.node.querySelectorAll(candidates);
      let first = rect.left, last = rect.right;
      for (let i=0;i<peers.length && i<200;i++) {
        const r = bounds(peers[i]);
        if (!r || Math.abs((r.top+r.bottom-rect.top-rect.bottom)/2)>rect.height/2) continue;
        first = Math.min(first,r.left);last = Math.max(last,r.right);
      }
      current = track.offset;
      const lower = current+viewportRight-last, upper = current+viewportLeft-first;
      if (lower>upper) {api.status = 'Entire row already fits.';return;}
      // Translate is the inverse of scrollLeft. Keep the nearest legal offset
      // and preserve YouTube's existing transform as the base of our translation.
      goal = upper-horizontalReveal(upper-current,left,right,rect.left,rect.right,
        upper-lower,28*scale());
    }
    if (Math.abs(goal-current)<0.5) {api.status = 'Card already inside the row viewport.';return;}
    const a = {row:row.node,card,focus:target,track,cardLeft:rect.left,from:current,to:goal,last:current,start:win.performance.now(),remaining:120};
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {writeOffset(a,goal);return;}
    animation = a;
    api.status = 'Smoothly revealing the pointed card.';
    motion = win.requestAnimationFrame(step);
  }
  function update() {
    frame = null;
    const point = pending; pending = null;
    try {
      if (!point || blocked()) {
        if (point && !menu) api.status = 'Browsing navigation blocked by the current page or a popup.';
        cancel();return;
      }
      // Cobalt 23 has no Document.elementFromPoint(). Its native mouse-event
      // target is already hit-tested; retain the latest target for that frame.
      const hit = typeof doc.elementFromPoint === 'function'
        ? doc.elementFromPoint(point.x,point.y) : point.target;
      if (ancestor(hit,overlays) || ancestor(hit,'input, textarea, select, ytlr-guide-entry-renderer')) {cancel();return;}
      let card = ancestor(hit,cards);
      // Renderer hosts may have no layout box. Use the actual focus control,
      // independently of YouTube's component names, before rejecting the hit.
      if (!bounds(card) || !visible(card)) card = ancestor(hit,'[tabindex]');
      if (!bounds(card) || !visible(card) || !rowFor(card,bounds(card))) {
        // Cobalt can target a covering container rather than the tile. Resolve
        // its coordinates against laid-out cards/focus controls. Bound both
        // the scan; no idle/background hit-testing is performed.
        const nodes = doc.querySelectorAll(candidates);
        let smallest = Infinity;
        card = null;
        for (let i = 0; i < nodes.length && i < 400; i++) {
          const node = nodes[i], r = bounds(node);
          if (!r || r.width < 80*scale() || r.height < 45*scale() ||
              point.x < r.left || point.x > r.right || point.y < r.top || point.y > r.bottom ||
              r.width*r.height >= smallest || !visible(node) ||
              ancestor(node,overlays) || ancestor(node,'ytlr-guide-entry-renderer')) continue;
          if (!rowFor(node,r)) continue;
          card = node;smallest = r.width*r.height;
        }
      }
      const rect = bounds(card);
      if (!card || !rect) {
        cancel();
        // Tags only: no titles, URLs, attributes or account information.
        let chain = [], node = hit;
        for (let i=0; node && i<5; i++,node=node.parentElement)
          if (node.localName) chain.push(String(node.localName).replace(/[^a-z0-9-]/gi,'').slice(0,48));
        api.status = 'No card found. Pointer target: ' + chain.join(' > ');
        return;
      }
      if (!visible(card)) {cancel();api.status = 'Card found but hidden.';return;}
      if (rect.top < 0 || rect.bottom > win.innerHeight) {
        cancel();api.status = 'Card found but vertically clipped.';return;
      }
      const row = rowFor(card,rect);
      if (card === lastCard) return;
      cancelMotion();
      if (!row) {lastCard = null;api.status = 'Card found; horizontal row unavailable.';return;}
      const target = focusTarget(card,row.node);
      if (typeof target?.focus !== 'function') return;
      // Cobalt's tabindex <= -2 is a native hybrid-navigation item. Let its
      // focus/scroll engine animate the row; never compete with scrollLeft.
      let native = false;
      for (let node = target; node && node !== row.node; node = node.parentElement)
        if (node.hasAttribute?.('tabindex') && Number(node.getAttribute('tabindex')) <= -2) {native = true;break;}
      // Preserve native focus semantics. RTL offsets remain browser-owned.
      native = native || !row.scrollable || rtl(row.node);
      const beforeFocus = row.node.scrollLeft;
      if (native) target.focus();
      else target.focus({preventScroll:true});
      if (blocked() || !attached(card)) return;
      if (!ownsFocus(card,target)) {api.status = 'Card found; YouTube did not accept focus.';return;}
      lastCard = card;
      api.status = 'Card focus accepted; checking row movement.';
      if (!row.scrollable) reveal(row,card,target);
      else if (!native) reveal(row,card,target);
      else if (row.scrollable && !rtl(row.node)) {
        // Native focus is not a guarantee of native scrolling. Give it time
        // to start, then reveal only if the scroll offset is still unchanged.
        nativeReveal = win.setTimeout(() => {
          nativeReveal = null;
          if (blocked() || !attached(card) || !ownsFocus(card,target) ||
              Math.abs(row.node.scrollLeft-beforeFocus) > 2) return;
          reveal(row,card,target);
        }, 180);
      }
    } catch (_) {cancel();api.status = 'Pointer scrolling is unavailable on this row.';}
  }
  function move(event) {
    const x = event.clientX, y = event.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (lastPoint && x === lastPoint.x && y === lastPoint.y) return;
    lastPoint = {x,y};
    api.moves++;
    if (pressed || event.buttons || stopped || !read('pointerRowScroll')) {cancel();return;}
    if (dpadAt) {
      if (Math.hypot(x-dpadAt.x,y-dpadAt.y) < 120 * scale()) return;
      dpadAt = null;
    }
    pending = {x,y,target:event.target};
    if (frame === null) frame = win.requestAnimationFrame(update);
  }
  function key() {dpadAt = lastPoint || {x:0,y:0};cancel();releaseTracks();}
  function down() {pressed = true;cancel();}
  function up() {pressed = false;}
  function leave() {lastPoint = null;cancel();}
  function openMenu() {menu = true;cancel();}
  function closeMenu() {menu = false;lastCard = null;}
  function config(event) {if (event.detail?.key === 'pointerRowScroll') {cancel();releaseTracks();}}
  function blur() {pressed = false;leave();}
  function route() {leave();releaseTracks();}
  const bindings = [
    [doc,'pointermove',move,true],[doc,'mousemove',move,true],[win,'keydown',key,true],
    [doc,'pointerdown',down,true],[win,'pointerup',up,true],[win,'pointercancel',blur,true],
    [doc,'mousedown',down,true],[win,'mouseup',up,true],
    [doc,'wheel',leave,true],[doc,'mouseleave',leave,false],
    [win,'blur',blur,false],[win,'pagehide',route,false],[win,'resize',route,false],
    [win,'hashchange',route,false],[doc,'yt-navigate-finish',route,false],
    [doc,'visibilitychange',blur,false],[doc,'ytaf-menu-opened',openMenu,false],
    [doc,'ytaf-menu-closed',closeMenu,false],[doc,'ytaf-config-changed',config,false]
  ];
  for (const [owner,type,callback,capture] of bindings) owner.addEventListener(type,callback,capture);
  function destroy() {
    stopped = true;cancel();releaseTracks();
    for (const [owner,type,callback,capture] of bindings) owner.removeEventListener(type,callback,capture);
  }
  return api;
}
