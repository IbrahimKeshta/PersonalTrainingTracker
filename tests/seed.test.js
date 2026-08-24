'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SEED_PATH = path.join(__dirname, '..', 'data', 'seed-program.js');

test('seed file exists and is a classic script', () => {
  assert.ok(fs.existsSync(SEED_PATH), 'run: "$NODE" tools/build-seed.js');
  const src = fs.readFileSync(SEED_PATH, 'utf8');
  assert.ok(!/^\s*(import|export)\s/m.test(src), 'seed must not use ES module syntax');
  assert.ok(src.includes('PTT.seed'), 'seed must assign PTT.seed');
});

test('seed contains the full parsed Phase 1 program', () => {
  const seed = require(SEED_PATH);
  assert.strictEqual(seed.days.length, 3);
  assert.strictEqual(seed.exerciseCount, 38);
  assert.strictEqual(seed.schemaVersion, 1);
  assert.ok(seed.name.toLowerCase().includes('crossfit'));
  assert.ok(seed.id, 'seed needs a stable id');
  const all = seed.days.flatMap((d) => d.blocks.flatMap((b) => b.exercises));
  assert.strictEqual(all.filter((e) => e.videoId).length, 38);
});

test('seed id is stable, not time-based', () => {
  const seed = require(SEED_PATH);
  assert.strictEqual(seed.id, 'seed-crossfit-phase-1');
});

test('seed attaches to a PTT global when evaluated as a browser script', () => {
  const src = fs.readFileSync(SEED_PATH, 'utf8');
  const fakeGlobal = { PTT: {} };
  // The 'globalThis' parameter shadows the global identifier within the function,
  // so the seed's footer already resolves its typeof check to the fake object.
  // This evaluates the source outside Node's CommonJS wrapper, validating it works
  // as a browser script where module/exports are absent.
  const fn = new Function('globalThis', src);
  fn(fakeGlobal);
  assert.ok(fakeGlobal.PTT.seed, 'PTT.seed should be assigned');
  assert.strictEqual(fakeGlobal.PTT.seed.days.length, 3);
});
