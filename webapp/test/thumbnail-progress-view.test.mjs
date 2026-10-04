import assert from 'node:assert/strict';
import test from 'node:test';
import {createThumbnailProgressView} from '../src/thumbnail-progress-view.mjs';

const firstId = 'aaaaaaaaaaa', secondId = 'bbbbbbbbbbb';
const sample = (id = firstId, position = 90, ended = false) => ({id, position, duration: 300, ended});
function fixture() {
  function element(tagName = 'div', bounds = {left: 100, top: 100, width: 320, height: 180}) {
    const attrs = {};
    return {tagName: tagName.toUpperCase(), bounds, parentNode: null, parentElement: null, children: [], style: {},
      getBoundingClientRect() { return {...this.bounds}; },
      getAttribute(key) { return attrs[key] || null; }, setAttribute(key, value) { attrs[key] = value; },
      appendChild(child) { child.parentNode?.removeChild(child); this.children.push(child); child.parentNode = child.parentElement = this; },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = child.parentElement = null; },
      contains(node) { return this === node || this.children.some(child => child.contains(node)); },
      closest() { for (let node = this; node; node = node.parentElement) if (node.tagName === 'YTLR-TILE-RENDERER') return node; return null; },
      focus() { throw new Error('Progress decoration must not move focus'); }
    };
  }
  const root = element('html'), body = element('body'); root.appendChild(body);
  const doc = {documentElement: root, body, activeElement: body, hidden: false, nodes: [],
    createElement: element, querySelectorAll() { return Object.assign({length: this.nodes.length}, this.nodes); }};
  const win = {innerWidth: 1280, innerHeight: 720,
    getComputedStyle: node => ({display: 'block', visibility: 'visible', opacity: '1', position: 'static', ...node.style})};
  function thumbnail(id = firstId, tagName = 'ytlr-thumbnail-details') {
    const card = element('ytlr-tile-renderer'), host = element(tagName);
    card.__instance = {props: {data: {navigationEndpoint: {watchEndpoint: {videoId: id}}}}};
    host.style.backgroundImage = `url("https://i.ytimg.com/vi/${id}/hqdefault.jpg")`;
    card.appendChild(host); body.appendChild(card); doc.nodes.push(host);
    return {card, host};
  }
  return {doc, win, element, thumbnail, view: createThumbnailProgressView(doc, win)};
}

test('matching CSS thumbnails show updated progress without changing YouTube data, focus or list position', () => {
  const f = fixture(), {card, host} = f.thumbnail(), other = f.thumbnail(secondId);
  const native = f.element('native-overlay'); host.appendChild(native);
  const data = JSON.stringify(card.__instance.props.data), order = f.doc.body.children.slice();
  f.doc.activeElement = card; card.scrollTop = 170;
  assert.equal(f.view.render([sample()]), 1);
  const rail = host.children[1];
  assert.equal(rail.className, 'ytaf-thumbnail-progress');
  assert.equal(rail.children[0].style.width, '30%');
  assert.equal(rail.style.pointerEvents, 'none');
  assert.equal(rail.style.bottom, '0');
  assert.equal(rail.getAttribute('aria-hidden'), 'true');
  assert.equal(host.children[0], native);
  assert.equal(other.host.children.length, 0);
  assert.equal(JSON.stringify(card.__instance.props.data), data);
  assert.deepEqual(f.doc.body.children, order);
  assert.equal(f.doc.activeElement, card); assert.equal(card.scrollTop, 170);
  f.view.render([sample(firstId, 30)]);
  assert.equal(rail.children[0].style.width, '10%', 'backward seeking must lower displayed position');
  f.view.render([sample(firstId, 299, true)]); assert.equal(rail.children[0].style.width, '100%');
  f.view.clear(); assert.deepEqual(host.children, [native]); assert.equal(host.style.position, '');
});

test('recycled cards discard prior decoration before a new thumbnail identity is ready', () => {
  const f = fixture(), {card, host} = f.thumbnail();
  f.view.render([sample()]); assert.equal(host.children.length, 1);
  card.__instance.props.data.navigationEndpoint.watchEndpoint.videoId = secondId;
  assert.equal(f.view.render([sample(), sample(secondId)]), 0);
  assert.equal(host.children.length, 0); assert.equal(host.style.position, '');
  host.style.backgroundImage = `url("https://i.ytimg.com/vi/${secondId}/hqdefault.jpg")`;
  assert.equal(f.view.render([sample(), sample(secondId, 150)]), 1);
  assert.equal(host.children[0].children[0].style.width, '50%');
  f.doc.body.removeChild(card); assert.equal(f.view.render([sample(secondId)]), 0);
  assert.equal(host.children.length, 0);
});

test('unmatched, ambiguous, hidden and fullscreen thumbnail candidates remain untouched', () => {
  for (const variant of ['unknown', 'ambiguous', 'hidden', 'offscreen', 'fullscreen', 'invalid']) {
    const f = fixture(), {card, host} = f.thumbnail();
    if (variant === 'unknown') { host.style.backgroundImage = 'none'; card.__instance = null; }
    if (variant === 'ambiguous') host.style.backgroundImage += `,url("https://i.ytimg.com/vi/${secondId}/hqdefault.jpg")`;
    if (variant === 'hidden') card.style.opacity = '0';
    if (variant === 'offscreen') host.bounds.top = 800;
    if (variant === 'fullscreen') host.bounds = {left: 0, top: 0, width: 1280, height: 720};
    const value = variant === 'invalid' ? {...sample(), position: Infinity} : sample();
    assert.equal(f.view.render([value]), 0, variant); assert.equal(host.children.length, 0, variant);
  }
});

test('IMG thumbnails use only a wrapper with matching image bounds', () => {
  const f = fixture(), {card, host: image} = f.thumbnail(firstId, 'img');
  delete image.style.backgroundImage; image.setAttribute('src', `https://i.ytimg.com/vi_webp/${firstId}/hqdefault.webp`);
  assert.equal(f.view.render([sample()]), 1);
  assert.equal(image.children.length, 0); assert.equal(card.children[1].children[0].style.width, '30%');
  f.view.clear(); card.bounds.height = 240;
  assert.equal(f.view.render([sample()]), 0); assert.deepEqual(card.children, [image]);
});

test('clear preserves subsequent YouTube style changes and hidden documents remove bars', () => {
  const f = fixture(), {host} = f.thumbnail();
  host.style.position = 'absolute'; f.view.render([sample()]); f.view.clear();
  assert.equal(host.style.position, 'absolute');
  host.style.position = ''; f.view.render([sample()]); host.style.position = 'fixed'; f.view.clear();
  assert.equal(host.style.position, 'fixed');
  f.view.render([sample()]); f.doc.hidden = true;
  assert.equal(f.view.render([sample()]), 0); assert.equal(host.children.length, 0);
});

test('renderer replacement reattaches one bar and bounded scans do not retain removed samples', () => {
  const f = fixture(), {host} = f.thumbnail();
  f.view.render([sample()]); const original = host.children[0]; host.removeChild(original);
  f.view.render([sample()]); assert.equal(host.children.length, 1); assert.notEqual(host.children[0], original);
  f.view.render([]); assert.equal(host.children.length, 0);
  for (let i = 0; i < 70; i++) f.thumbnail();
  assert.equal(f.view.render([sample()]), 50);
  f.view.clear(); assert.ok(f.doc.nodes.every(node => node.children.length === 0));
});
