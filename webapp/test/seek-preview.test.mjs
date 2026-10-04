import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSeekPreview, seekTimeline} from '../src/seek-preview.mjs';

test('seek preview uses full VOD duration and the available live DVR window', () => {
  assert.deepEqual(seekTimeline({duration: 300}), {start: 0, end: 300});
  assert.deepEqual(seekTimeline({duration: Infinity, seekable: {
    length: 2, start: i => [30, 80][i], end: i => [60, 120][i]
  }}), {start: 30, end: 120});
});

test('seek preview refuses missing, empty and invalid timelines', () => {
  for (const video of [null, {duration: NaN}, {duration: Infinity, seekable: {length: 0}},
    {seekable: {length: 1, start: () => 50, end: () => 50}}]) {
    assert.equal(seekTimeline(video), null);
  }
});

function previewFixture() {
  let time = 0, sequence = 0;
  const timers = new Map();
  function element() {
    return {parentNode: null, parentElement: null, children: [], style: {}, textContent: '',
      setAttribute() {},
      appendChild(child) {
        child.parentNode?.removeChild(child);
        this.children.push(child);child.parentNode = child.parentElement = this;
      },
      removeChild(child) {
        this.children.splice(this.children.indexOf(child), 1);
        child.parentNode = child.parentElement = null;
      }
    };
  }
  const video = {duration: 300, currentTime: 100};
  const doc = {body: element(), createElement: element, tracks: [],
    // Indexed-only DOM collections are sufficient on Cobalt.
    querySelectorAll() {return Object.assign({length: this.tracks.length}, this.tracks);}};
  const win = {innerWidth: 1280, innerHeight: 720,
    getComputedStyle(node) {return node.style;},
    setTimeout(fn, delay) {const id = ++sequence;timers.set(id,{fn,at:time+delay});return id;},
    clearTimeout(id) {timers.delete(id);}};
  function advance(ms) {
    const end = time + ms;
    for (;;) {
      const next = [...timers].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
      if (!next) break;
      time = next[1].at;timers.delete(next[0]);next[1].fn();
    }
    time = end;
  }
  return {doc, win, video, timers, advance, element, preview: createSeekPreview(doc, win)};
}

test('pending seek destination appears synchronously and remains visible through a held gesture', () => {
  const f = previewFixture();
  f.preview(110, f.video);
  const root = f.doc.body.children[0], marker = root.children[2], label = root.children[3];
  assert.equal(label.textContent, 'Seek to 1:50 / 5:00');
  assert.equal(marker.style.left, `${110 / 300 * 100}%`);
  assert.equal(f.video.currentTime, 100);
  f.advance(2500);
  assert.equal(f.doc.body.children[0], root, 'pending preview must not expire before key release');
  f.preview(140, f.video);
  assert.equal(label.textContent, 'Seek to 2:20 / 5:00');
  assert.equal(marker.style.left, `${140 / 300 * 100}%`);
  assert.equal(f.video.currentTime, 100);
  f.preview(140, f.video, 'applied');
  f.advance(899);assert.equal(f.doc.body.children[0], root);
  f.advance(1);assert.equal(f.doc.body.children.length, 0);assert.equal(f.timers.size, 0);
});

test('seek feedback survives YouTube removal and follows a track revealed after keydown', () => {
  const f = previewFixture();f.preview(110, f.video);
  const root = f.doc.body.children[0];
  assert.equal(root.style.top, `${720 * .86}px`);
  f.doc.body.removeChild(root);
  const track = f.element();track.getBoundingClientRect = () => ({left: 100, top: 570, width: 1080, height: 6, bottom: 576});
  f.doc.tracks = [track];
  f.advance(100);
  assert.equal(f.doc.body.children[0], root);
  assert.equal(root.style.top, '570px');assert.equal(root.style.width, '1080px');
  assert.equal(root.className, 'ytaf-seek-preview ytaf-seek-preview-native');
  const oldBody = f.doc.body;f.doc.body = f.element();
  track.style.opacity = '0';f.advance(100);
  assert.equal(f.doc.body.children[0], root);assert.equal(oldBody.children.length, 0);
  assert.equal(root.className, 'ytaf-seek-preview');
  assert.equal(root.style.top, `${720 * .86}px`);
  f.preview(null);assert.equal(f.doc.body.children.length, 0);assert.equal(f.timers.size, 0);
});

test('unavailable YouTube layout cannot prevent target feedback or resurrect a cancelled preview', () => {
  const f = previewFixture();
  f.doc.querySelectorAll = () => {throw new Error('YouTube renderer replaced');};
  f.preview(110, f.video);
  const root = f.doc.body.children[0];
  assert.equal(root.children[3].textContent, 'Seek to 1:50 / 5:00');
  assert.equal(root.className, 'ytaf-seek-preview');
  const staleFrame = [...f.timers.values()][0].fn;
  f.preview(null);f.preview(120, f.video);
  const replacement = f.doc.body.children[0];
  staleFrame();
  assert.equal(f.doc.body.children[0], replacement);assert.equal(f.timers.size, 1);
  f.preview(null);staleFrame();
  assert.equal(f.doc.body.children.length, 0);assert.equal(f.timers.size, 0);
});
