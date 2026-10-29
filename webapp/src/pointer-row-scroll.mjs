// Pointer focus + minimal row reveal, following PlxNative's CardRow and HitMap:
// https://github.com/danzig666/plx-native/tree/47fd8bbc6c2ca70ab90507b3dc6ccf02672182f7/rust-modules/src/ui
// Independent DOM adaptation; no video activation, synthetic keys or transforms.
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
        if (!fallback) fallback = {node, box, scrollable};
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
  function step(time) {
    motion = null;
    const a = animation;
    if (!a || !Number.isFinite(time) || blocked() || !attached(a.row) || !attached(a.card) ||
        !ownsFocus(a.card, a.focus) || Math.abs(a.row.scrollLeft - a.last) > 2) {cancelMotion();return;}
    // Exact critically damped spring, like PlxNative K_SCROLL=170, with a
    // bounded lifetime. Only a real horizontal scroll container is written.
    const t = Math.max(0, Math.min(1, (time - a.start) / 1000));
    const omega = Math.sqrt(170);
    const progress = 1 - (1 + omega * t) * Math.exp(-omega * t);
    a.last = a.from + (a.to - a.from) * progress;
    a.row.scrollLeft = a.last;
    a.last = a.row.scrollLeft;
    if (Math.abs(a.to - a.last) < 0.5 || t >= 1 || --a.remaining <= 0) {
      a.row.scrollLeft = a.to; animation = null; return;
    }
    motion = win.requestAnimationFrame(step);
  }
  function reveal(row, card, target) {
    if (!row.scrollable) return;
    // RTL scrollLeft conventions differ across Cobalt/browser versions. Its
    // native focus system owns RTL reveal instead of guessing offsets here.
    if (rtl(row.node)) return;
    const rect = bounds(card);
    if (!rect) return;
    // PlxNative reveals inside its outer margin, while the adjacent card can
    // still be hit in that margin. Keep a small peek inside a DOM row's hard
    // clip too, so the pointer can reach the next card in either direction.
    const peek = Math.min(80 * scale(), rect.width / 3, row.box.width / 6);
    const left = Math.max(0, row.box.left) + peek;
    const right = Math.min(win.innerWidth, row.box.right) - peek;
    const current = row.node.scrollLeft;
    const goal = horizontalReveal(current,left,right,rect.left,rect.right,
      row.node.scrollWidth - row.node.clientWidth,28 * scale());
    if (Math.abs(goal - current) < 0.5) return;
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {row.node.scrollLeft = goal;return;}
    animation = {row:row.node,card,focus:target,from:current,to:goal,last:current,start:win.performance.now(),remaining:120};
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
      if (card === lastCard) return;
      cancelMotion();
      const row = rowFor(card,rect);
      if (!row) {lastCard = null;api.status = 'Card found; horizontal row unavailable.';return;}
      const target = focusTarget(card,row.node);
      if (typeof target?.focus !== 'function') return;
      // Cobalt's tabindex <= -2 is a native hybrid-navigation item. Let its
      // focus/scroll engine animate the row; never compete with scrollLeft.
      let native = false;
      for (let node = target; node && node !== row.node; node = node.parentElement)
        if (node.hasAttribute?.('tabindex') && Number(node.getAttribute('tabindex')) <= -2) {native = true;break;}
      // YouTube owns transformed/virtual rows. The browser/native engine also
      // owns RTL offsets, whose sign differs between implementations.
      native = native || !row.scrollable || rtl(row.node);
      const beforeFocus = row.node.scrollLeft;
      if (native) target.focus();
      else target.focus({preventScroll:true});
      if (blocked() || !attached(card)) return;
      if (!ownsFocus(card,target)) {api.status = 'Card found; YouTube did not accept focus.';return;}
      lastCard = card;
      api.status = 'Video row follows the pointer.';
      if (!native) reveal(row,card,target);
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
  function key() {dpadAt = lastPoint || {x:0,y:0};cancel();}
  function down() {pressed = true;cancel();}
  function up() {pressed = false;}
  function leave() {lastPoint = null;cancel();}
  function openMenu() {menu = true;cancel();}
  function closeMenu() {menu = false;lastCard = null;}
  function config(event) {if (event.detail?.key === 'pointerRowScroll') cancel();}
  function blur() {pressed = false;leave();}
  const bindings = [
    [doc,'pointermove',move,true],[doc,'mousemove',move,true],[win,'keydown',key,true],
    [doc,'pointerdown',down,true],[win,'pointerup',up,true],[win,'pointercancel',blur,true],
    [doc,'mousedown',down,true],[win,'mouseup',up,true],
    [doc,'wheel',leave,true],[doc,'mouseleave',leave,false],
    [win,'blur',blur,false],[win,'pagehide',blur,false],[win,'resize',leave,false],
    [win,'hashchange',leave,false],[doc,'yt-navigate-finish',leave,false],
    [doc,'visibilitychange',blur,false],[doc,'ytaf-menu-opened',openMenu,false],
    [doc,'ytaf-menu-closed',closeMenu,false],[doc,'ytaf-config-changed',config,false]
  ];
  for (const [owner,type,callback,capture] of bindings) owner.addEventListener(type,callback,capture);
  function destroy() {
    stopped = true;cancel();
    for (const [owner,type,callback,capture] of bindings) owner.removeEventListener(type,callback,capture);
  }
  return api;
}
