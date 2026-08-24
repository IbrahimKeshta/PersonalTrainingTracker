'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../assets/js/core/parse-grid.js');
const fixture = require('./fixtures/phase1-grid.js');

const META = { id: 'p1', name: 'CrossFit phase 1 program', source: 'crossfit-phase-1.xlsx' };
const program = P.gridToProgram(fixture.grid, META);

test('parses three days from the real workbook', () => {
  assert.ok(program, 'expected a program');
  assert.strictEqual(program.days.length, 3);
  assert.deepStrictEqual(program.days.map((d) => d.name), ['Day 1', 'Day 2', 'Day 3']);
  assert.strictEqual(program.name, META.name);
  assert.strictEqual(program.schemaVersion, 1);
});

test('day 1 has 12 exercises across 4 blocks with correct sets', () => {
  const d1 = program.days[0];
  assert.deepStrictEqual(d1.blocks.map((b) => b.name), ['Warm Up', 'Mobility', 'Circuit 1', 'Circuit 2']);
  assert.deepStrictEqual(d1.blocks.map((b) => b.sets), [2, 2, 4, 4]);
  assert.deepStrictEqual(d1.blocks.map((b) => b.exercises.length), [2, 3, 4, 3]);
  const total = d1.blocks.reduce((n, b) => n + b.exercises.length, 0);
  assert.strictEqual(total, 12);
});

test('days 2 and 3 have 13 exercises each', () => {
  assert.strictEqual(program.days[1].blocks.reduce((n, b) => n + b.exercises.length, 0), 13);
  assert.strictEqual(program.days[2].blocks.reduce((n, b) => n + b.exercises.length, 0), 13);
  assert.deepStrictEqual(program.days[1].blocks.map((b) => b.name), ['Warm Up', 'Core', 'Circuit 1', 'Circuit 2']);
  assert.deepStrictEqual(program.days[2].blocks.map((b) => b.name), ['Mobility', 'Core', 'Circuit 1', 'Circuit 2']);
});

test('rest inherits per block and only where the sheet sets it', () => {
  const d1 = program.days[0];
  assert.strictEqual(d1.blocks[0].restSeconds, null);   // Warm Up has no rest column
  assert.strictEqual(d1.blocks[1].restSeconds, null);   // Mobility
  assert.strictEqual(d1.blocks[2].restSeconds, 30);     // Circuit 1: "30 SEC"
  assert.strictEqual(d1.blocks[3].restSeconds, 30);     // Circuit 2
});

test('reps/duration inherits down within a block', () => {
  const warmup = program.days[0].blocks[0];
  assert.strictEqual(warmup.exercises[0].name, 'Step Jacks');
  assert.deepStrictEqual(warmup.exercises[0].target, { kind: 'time', value: 30, perSide: false, text: '30 SEC' });
  // RUNNING IN PLACE has a blank E cell and must inherit 30 SEC
  assert.strictEqual(warmup.exercises[1].name, 'Running In Place');
  assert.deepStrictEqual(warmup.exercises[1].target, { kind: 'time', value: 30, perSide: false, text: '30 SEC' });
});

test('per-side targets survive the parse', () => {
  const all = program.days.flatMap((d) => d.blocks.flatMap((b) => b.exercises));
  const sidePlank = all.find((e) => e.slug === 'knee-side-plank');
  assert.ok(sidePlank, 'expected knee side plank');
  assert.strictEqual(sidePlank.target.perSide, true);
  assert.strictEqual(sidePlank.target.value, 20);
  assert.strictEqual(sidePlank.target.kind, 'time');
});

test('every exercise carries a video id and a stable slug', () => {
  const all = program.days.flatMap((d) => d.blocks.flatMap((b) => b.exercises));
  assert.strictEqual(all.length, 38);
  const missing = all.filter((e) => !e.videoId).map((e) => e.name);
  assert.deepStrictEqual(missing, [], 'exercises without a video: ' + missing.join(', '));
  assert.ok(all.every((e) => e.slug.length > 0));
  assert.ok(all.every((e) => e.sets >= 1));
});

test('the same exercise in different days shares a slug', () => {
  const d1 = program.days[0].blocks.flatMap((b) => b.exercises);
  const d3 = program.days[2].blocks.flatMap((b) => b.exercises);
  const a = d1.find((e) => e.slug === 'chair-squat');
  const b = d3.find((e) => e.slug === 'chair-squat');
  assert.ok(a && b, 'chair squat should appear in day 1 and day 3');
  assert.notStrictEqual(a.id, b.id, 'ids are per-occurrence');
  assert.strictEqual(a.videoId, b.videoId);
});

test('exercise ids are unique within a program', () => {
  const ids = program.days.flatMap((d) => d.blocks.flatMap((b) => b.exercises.map((e) => e.id)));
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('a grid with no Exercise header yields null', () => {
  const junk = [[{ v: 'hello', link: null }], [{ v: 'world', link: null }]];
  assert.strictEqual(P.gridToProgram(junk, META), null);
  assert.strictEqual(P.gridToProgram([], META), null);
});

test('exercises before any block land in a Main block', () => {
  const cell = (v, link) => ({ v: v, link: link || null });
  const blank = () => [cell(''), cell(''), cell(''), cell(''), cell(''), cell(''), cell('')];
  const grid = [
    [cell('Workout'), cell(''), cell('Exercise'), cell('Sets'), cell('Reps / Duration'), cell('Tempo'), cell('Rest')],
    [cell('DAY 9'), cell(''), cell('BURPEES'), cell('3'), cell('10'), cell(''), cell('')],
    blank()
  ];
  const p = P.gridToProgram(grid, META);
  assert.strictEqual(p.days.length, 1);
  assert.strictEqual(p.days[0].name, 'Day 9');
  assert.strictEqual(p.days[0].blocks[0].name, 'Main');
  assert.strictEqual(p.days[0].blocks[0].sets, 3);
  assert.strictEqual(p.days[0].blocks[0].exercises[0].name, 'Burpees');
});

test('exerciseCount and dayCount are precomputed on the program', () => {
  assert.strictEqual(program.exerciseCount, 38);
  assert.strictEqual(program.days.length, 3);
});
