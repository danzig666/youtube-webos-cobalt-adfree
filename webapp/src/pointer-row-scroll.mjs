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
  const api = {moves: 0, frames: 0, maxFrameGap: 0, status: 'Point at a video card to reveal it.', destroy};
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
    if (state.node.style.getPropertyValue('transition') !== 'none') state.node.style.setProperty('transition','none');
    state.node.style.setProperty('transform','translateX('+value+'px) '+state.base,state.priority);
    state.written = state.node.style.getPropertyValue('transform');
    return value;
  }
  function edgeSpeed(box, point) {
    if (!point || point.y < box.top || point.y > box.bottom) return 0;
    const left = Math.max(0,box.left), right = Math.min(win.innerWidth,box.right);
    if (point.x < left || point.x > right) return 0;
    const band = Math.min(180*scale(),(right-left)/4);
    const amount = point.x < left+band ? -(left+band-point.x)/band
      : point.x > right-band ? (point.x-right+band)/band : 0;
    return amount*420*scale();
  }
  function fastBlocked() {
    return stopped || menu || !read('pointerRowScroll') || doc.hidden ||
      doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH') || doc.body?.classList.contains('WEB_PAGE_TYPE_SHORTS');
  }
  function step(time) {
    motion = null;
    const a = animation;
    if (!a || !Number.isFinite(time) || fastBlocked() || !attached(a.row) ||
        (!a.edge && (!attached(a.card) || !ownsFocus(a.card, a.focus))) ||
        (a.track ? !attached(a.track.node) || a.track.node.style.getPropertyValue('transform') !== a.track.written
          : Math.abs(a.row.scrollLeft - a.last) > 2)) {cancelMotion();return;}
    // Use only rAF timestamps, never mix them with a different clock origin.
    if (a.start === null) {a.start = time;a.previous = time;}
    const gap = Math.max(0,time-a.previous);
    api.frames++;api.maxFrameGap = Math.max(api.maxFrameGap,Math.round(gap));
    a.previous = time;
    if (a.edge) {
      // Full DOM/popup checks are bounded, not repeated on every frame or move.
      if (time-a.checked > 200) {
        a.checked = time;
        if (blocked()) {cancel();return;}
      }
      const speed = edgeSpeed(a.box,lastPoint);
      if (!speed) {cancelMotion();api.status = 'Pointer left the edge; scrolling stopped.';return;}
      const dt = Math.min(0.033,gap/1000);
      a.velocity += (speed-a.velocity)*(1-Math.exp(-dt/0.12));
      const next = Math.max(a.lower,Math.min(a.upper,a.last+(a.track?-1:1)*a.velocity*dt));
      const moved = Math.abs(next-a.last);
      a.last = writeOffset(a,next);
      if (dt>0 && moved<0.001 && Math.abs(a.velocity)>1) {
        cancelMotion();api.status = 'Row end reached.';return;
      }
      api.status = speed<0 ? 'Scrolling left.' : 'Scrolling right.';
      motion = win.requestAnimationFrame(step);return;
    }
  }
  function reveal(row, card, target) {
    if (rtl(row.node)) return;
    const rect = bounds(card);
    if (!rect) return;
    const viewportLeft = Math.max(0,row.box.left), viewportRight = Math.min(win.innerWidth,row.box.right);
    let track = null, current, lower = 0, upper = 0;
    if (row.scrollable) {
      current = row.node.scrollLeft;
      upper = row.node.scrollWidth-row.node.clientWidth;
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
      lower = current+viewportRight-last;upper = current+viewportLeft-first;
      if (lower>upper) {api.status = 'Entire row already fits.';return;}
    }
    const edge = Boolean(edgeSpeed(row.box,lastPoint));
    if (!edge) {api.status = 'Point near either row edge to scroll.';return;}
    const a = {row:row.node,card,focus:target,track,last:current,start:null,previous:null,edge,box:row.box,lower,upper,velocity:0,checked:0};
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
              point.y < r.top || point.y > r.bottom || !visible(node) ||
              ancestor(node,overlays) || ancestor(node,'ytlr-guide-entry-renderer')) continue;
          const distance = Math.max(0,r.left-point.x,point.x-r.right);
          if (distance>40*scale()) continue;
          const row = rowFor(node,r);
          if (!row || (distance>0 && !edgeSpeed(row.box,point))) continue;
          // Gaps between cards at the edge still belong to the row. Prefer a
          // direct hit, then the nearest card, then the smallest nested control.
          const score = distance*10000000+r.width*r.height;
          if (score>=smallest) continue;
          card = node;smallest = score;
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
      if (card === lastCard && animation) return;
      cancelMotion();
      if (!row) {lastCard = null;api.status = 'Card found; horizontal row unavailable.';return;}
      const target = focusTarget(card,row.node);
      if (typeof target?.focus !== 'function') return;
      // Edge panning must not focus each passing tile: native focus can snap
      // the row and compete with pixel motion. Clicking still uses native hits.
      if (!edgeSpeed(row.box,lastPoint)) {
        if (row.scrollable) target.focus({preventScroll:true});else target.focus();
      }
      if (blocked() || !attached(card)) return;
      lastCard = card;
      reveal(row,card,target);
    } catch (_) {cancel();api.status = 'Pointer scrolling is unavailable on this row.';}
  }
  function move(event) {
    const x = event.clientX, y = event.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (lastPoint && x === lastPoint.x && y === lastPoint.y) return;
    lastPoint = {x,y};
    api.moves++;
    if (pressed || event.buttons || stopped || !read('pointerRowScroll')) {cancel();return;}
    // Keep the active row while its contents move under a stationary pointer.
    // Repeated mouse events must not scan the page, refocus tiles or reset speed.
    if (!dpadAt && animation?.edge) {
      if (fastBlocked()) {cancel();return;}
      if (edgeSpeed(animation.box,lastPoint)) return;
      cancel();api.status = 'Pointer left the edge; scrolling stopped.';
    }
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
