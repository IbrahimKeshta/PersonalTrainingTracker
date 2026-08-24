'use strict';
const test = require('node:test');
const assert = require('node:assert');
const N = require('../assets/js/core/normalize.js');

test('slug is stable across casing and whitespace', () => {
  assert.strictEqual(N.slug('WALL SIT '), 'wall-sit');
  assert.strictEqual(N.slug('  wall  sit'), 'wall-sit');
  assert.strictEqual(N.slug('KNEE SIDE PLANK  '), 'knee-side-plank');
  assert.strictEqual(N.slug('PRONED TOWELL PULLDOWN '), 'proned-towell-pulldown');
  assert.strictEqual(N.slug(''), '');
  assert.strictEqual(N.slug(null), '');
});

test('title case tames the shouting', () => {
  assert.strictEqual(N.title('STEP JACKS '), 'Step Jacks');
  assert.strictEqual(N.title('day 1 '), 'Day 1');
  assert.strictEqual(N.title('CIRCUIT 2'), 'Circuit 2');
  assert.strictEqual(N.title(''), '');
});

test('seconds parses every rest/duration form in the sheet', () => {
  assert.strictEqual(N.seconds('30 SEC '), 30);
  assert.strictEqual(N.seconds('30SEC'), 30);
  assert.strictEqual(N.seconds('20 SEC'), 20);
  assert.strictEqual(N.seconds('1 MIN'), 60);
  assert.strictEqual(N.seconds('1 min '), 60);
  assert.strictEqual(N.seconds('2 mins'), 120);
  assert.strictEqual(N.seconds('90s'), 90);
  assert.strictEqual(N.seconds('12'), null);
  assert.strictEqual(N.seconds(''), null);
  assert.strictEqual(N.seconds(null), null);
});

test('target distinguishes reps from time', () => {
  assert.deepStrictEqual(N.target(12), { kind: 'reps', value: 12, perSide: false, text: '12' });
  assert.deepStrictEqual(N.target('8'), { kind: 'reps', value: 8, perSide: false, text: '8' });
  assert.deepStrictEqual(N.target('12 REPS'), { kind: 'reps', value: 12, perSide: false, text: '12 REPS' });
  assert.deepStrictEqual(N.target('30 SEC '), { kind: 'time', value: 30, perSide: false, text: '30 SEC' });
  assert.deepStrictEqual(N.target('30SEC'), { kind: 'time', value: 30, perSide: false, text: '30SEC' });
  assert.deepStrictEqual(N.target('1 MIN'), { kind: 'time', value: 60, perSide: false, text: '1 MIN' });
});

test('target marks per-side work without halving the value', () => {
  assert.deepStrictEqual(N.target('20 SEC EACH'), { kind: 'time', value: 20, perSide: true, text: '20 SEC EACH' });
  assert.deepStrictEqual(N.target('10 EACH SIDE'), { kind: 'reps', value: 10, perSide: true, text: '10 EACH SIDE' });
});

test('unparseable target keeps the raw text and a null value', () => {
  const r = N.target('AMRAP until failure');
  assert.strictEqual(r.kind, 'reps');
  assert.strictEqual(r.value, null);
  assert.strictEqual(r.text, 'AMRAP until failure');
  const empty = N.target('');
  assert.strictEqual(empty.value, null);
  assert.strictEqual(empty.text, '');
});

test('videoId handles watch, shorts, youtu.be and embed forms', () => {
  assert.strictEqual(N.videoId('https://www.youtube.com/watch?v=JHdVMkRBuRA'), 'JHdVMkRBuRA');
  assert.strictEqual(N.videoId('https://www.youtube.com/shorts/uOY1rxnFY9w'), 'uOY1rxnFY9w');
  assert.strictEqual(N.videoId('https://youtu.be/g_BYB0R-4Ws'), 'g_BYB0R-4Ws');
  assert.strictEqual(N.videoId('https://www.youtube.com/embed/q-UYBCNGaTw'), 'q-UYBCNGaTw');
  assert.strictEqual(N.videoId('https://www.youtube.com/watch?v=c4DAnQ6DtF8&t=30s'), 'c4DAnQ6DtF8');
  assert.strictEqual(N.videoId('https://example.com/video.mp4'), null);
  assert.strictEqual(N.videoId(null), null);
});

test('thumb and embed urls are built from the id', () => {
  assert.strictEqual(N.thumbUrl('abc123'), 'https://img.youtube.com/vi/abc123/mqdefault.jpg');
  assert.strictEqual(N.embedUrl('abc123'), 'https://www.youtube-nocookie.com/embed/abc123?rel=0&playsinline=1');
  assert.strictEqual(N.thumbUrl(null), null);
  assert.strictEqual(N.embedUrl(null), null);
});
