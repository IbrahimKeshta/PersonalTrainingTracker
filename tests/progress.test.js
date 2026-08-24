'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../assets/js/core/progress.js');

const PROGRAM = {
  id: 'p1', name: 'Phase 1',
  days: [
    { id: 'd0', name: 'Day 1', index: 0, blocks: [{ id: 'b0', name: 'Circuit 1', sets: 4, restSeconds: 30,
      exercises: [
        { id: 'e0', slug: 'chair-squat', name: 'Chair Squat', sets: 4, target: { kind: 'reps', value: 12, perSide: false, text: '12' } },
        { id: 'e1', slug: 'wall-sit', name: 'Wall Sit', sets: 4, target: { kind: 'time', value: 30, perSide: false, text: '30 SEC' } }
      ] }] },
    { id: 'd1', name: 'Day 2', index: 1, blocks: [] },
    { id: 'd2', name: 'Day 3', index: 2, blocks: [] }
  ]
};

function session(id, dayId, completedAt, entries) {
  return { id, programId: 'p1', dayId, startedAt: completedAt, completedAt, entries: entries || [] };
}

function reps(slug, values) {
  return { exerciseId: 'e', slug, name: slug,
    sets: values.map((v, i) => ({ index: i, done: true, reps: v, seconds: null, note: '' })) };
}

function holds(slug, values) {
  return { exerciseId: 'e', slug, name: slug,
    sets: values.map((v, i) => ({ index: i, done: true, reps: null, seconds: v, note: '' })) };
}

test('dayKey and weekKey use local time', () => {
  assert.strictEqual(G.dayKey('2026-08-24T10:30:00'), '2026-08-24');
  assert.strictEqual(G.weekKey('2026-08-24T10:30:00'), '2026-W35'); // Monday
  assert.strictEqual(G.weekKey('2026-08-30T23:00:00'), '2026-W35'); // Sunday, same week
  assert.strictEqual(G.weekKey('2026-08-31T00:30:00'), '2026-W36'); // next Monday
});

test('summary counts only completed sessions', () => {
  const sessions = [
    session('s1', 'd0', '2026-08-24T10:00:00'),
    { id: 's2', programId: 'p1', dayId: 'd1', startedAt: '2026-08-25T10:00:00', completedAt: null, entries: [] }
  ];
  const s = G.summary(sessions, PROGRAM, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s.totalSessions, 1);
  assert.strictEqual(s.weekCompleted, 1);
  assert.strictEqual(s.weekTarget, 3);
});

test('streak counts consecutive weeks with at least one session', () => {
  const sessions = [
    session('a', 'd0', '2026-08-10T10:00:00'), // W33
    session('b', 'd0', '2026-08-17T10:00:00'), // W34
    session('c', 'd0', '2026-08-24T10:00:00')  // W35, current
  ];
  const s = G.summary(sessions, PROGRAM, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s.streakWeeks, 3);
  assert.strictEqual(s.longestStreakWeeks, 3);
});

test('the current week never breaks the streak before it is over', () => {
  const sessions = [
    session('a', 'd0', '2026-08-10T10:00:00'), // W33
    session('b', 'd0', '2026-08-17T10:00:00')  // W34
  ];
  // Now is Tuesday of W35 with nothing logged yet: streak holds at 2.
  const s = G.summary(sessions, PROGRAM, new Date('2026-08-25T12:00:00'));
  assert.strictEqual(s.streakWeeks, 2);
});

test('a fully skipped week breaks the streak', () => {
  const sessions = [
    session('a', 'd0', '2026-08-03T10:00:00'), // W32
    session('b', 'd0', '2026-08-24T10:00:00')  // W35, gap at W33/W34
  ];
  const s = G.summary(sessions, PROGRAM, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s.streakWeeks, 1);
  assert.strictEqual(s.longestStreakWeeks, 1);
});

test('empty history is safe', () => {
  const s = G.summary([], PROGRAM, new Date('2026-08-26T12:00:00'));
  assert.deepStrictEqual(
    { t: s.totalSessions, st: s.streakWeeks, w: s.weekCompleted, last: s.lastSessionAt, d: s.daysSince },
    { t: 0, st: 0, w: 0, last: null, d: null }
  );
});

test('daysSince reflects the most recent completed session', () => {
  const sessions = [session('a', 'd0', '2026-08-24T10:00:00')];
  const s = G.summary(sessions, PROGRAM, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s.daysSince, 2);
});

test('daysSince is accurate across calendar days including DST boundaries', () => {
  const PROGRAM_STUB = { days: [] };
  // 0 days: session same day as now
  const today = G.dayKey(new Date('2026-08-26T12:00:00'));
  const s0 = G.summary([session('a', 'd0', today + 'T10:00:00')], PROGRAM_STUB, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s0.daysSince, 0);
  // 1 day: session yesterday
  const s1 = G.summary([session('a', 'd0', '2026-08-25T10:00:00')], PROGRAM_STUB, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s1.daysSince, 1);
  // 3 days: session three days ago
  const s3 = G.summary([session('a', 'd0', '2026-08-23T10:00:00')], PROGRAM_STUB, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s3.daysSince, 3);
});

test('heatmap returns one bucket per day, oldest first', () => {
  const sessions = [
    session('a', 'd0', '2026-08-24T10:00:00'),
    session('b', 'd1', '2026-08-24T18:00:00'),
    session('c', 'd2', '2026-08-26T10:00:00')
  ];
  const cells = G.heatmap(sessions, 7, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(cells.length, 7);
  assert.strictEqual(cells[0].date, '2026-08-20');
  assert.strictEqual(cells[6].date, '2026-08-26');
  assert.strictEqual(cells.find((c) => c.date === '2026-08-24').count, 2);
  assert.strictEqual(cells.find((c) => c.date === '2026-08-26').count, 1);
  assert.strictEqual(cells.find((c) => c.date === '2026-08-25').count, 0);
});

test('dayCompletion reports counts per program day', () => {
  const sessions = [
    session('a', 'd0', '2026-08-24T10:00:00'),
    session('b', 'd0', '2026-08-17T10:00:00'),
    session('c', 'd1', '2026-08-25T10:00:00')
  ];
  const map = G.dayCompletion(sessions, PROGRAM);
  assert.strictEqual(map.d0.count, 2);
  assert.strictEqual(map.d0.lastAt, '2026-08-24T10:00:00');
  assert.strictEqual(map.d1.count, 1);
  assert.strictEqual(map.d2.count, 0);
  assert.strictEqual(map.d2.lastAt, null);
});

test('exerciseHistory tracks best and total per session, oldest first', () => {
  const sessions = [
    session('b', 'd0', '2026-08-24T10:00:00', [holds('wall-sit', [30, 35, 40])]),
    session('a', 'd0', '2026-08-17T10:00:00', [holds('wall-sit', [20, 20, 25])])
  ];
  const h = G.exerciseHistory(sessions, 'wall-sit');
  assert.strictEqual(h.length, 2);
  assert.strictEqual(h[0].date, '2026-08-17');
  assert.strictEqual(h[0].best, 25);
  assert.strictEqual(h[0].total, 65);
  assert.strictEqual(h[0].kind, 'time');
  assert.strictEqual(h[1].best, 40);
  assert.strictEqual(h[1].total, 105);
});

test('exerciseHistory ignores sets that were not done', () => {
  const entry = reps('chair-squat', [12, 12]);
  entry.sets.push({ index: 2, done: false, reps: null, seconds: null, note: '' });
  const h = G.exerciseHistory([session('a', 'd0', '2026-08-24T10:00:00', [entry])], 'chair-squat');
  assert.strictEqual(h[0].sets, 2);
  assert.strictEqual(h[0].total, 24);
  assert.strictEqual(h[0].kind, 'reps');
});

test('exerciseHistory handles a set with both reps and seconds null as 0 contribution', () => {
  // A set with both values null defaults to kind 'reps' and contributes 0.
  const entry = { exerciseId: 'e', slug: 'mystery', name: 'mystery',
    sets: [{ index: 0, done: true, reps: null, seconds: null, note: '' }] };
  const h = G.exerciseHistory([session('a', 'd0', '2026-08-24T10:00:00', [entry])], 'mystery');
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].kind, 'reps');
  assert.strictEqual(h[0].best, 0);
  assert.strictEqual(h[0].total, 0);
  assert.strictEqual(h[0].sets, 1);
});

test('exerciseHistory for an unknown slug is empty', () => {
  assert.deepStrictEqual(G.exerciseHistory([], 'nope'), []);
});

test('lastPerformance returns the most recent completed sets', () => {
  const sessions = [
    session('a', 'd0', '2026-08-17T10:00:00', [reps('chair-squat', [10, 10, 10])]),
    session('b', 'd0', '2026-08-24T10:00:00', [reps('chair-squat', [12, 12, 11])])
  ];
  const last = G.lastPerformance(sessions, 'chair-squat');
  assert.strictEqual(last.date, '2026-08-24');
  assert.deepStrictEqual(last.sets.map((s) => s.reps), [12, 12, 11]);
  assert.strictEqual(G.lastPerformance(sessions, 'wall-sit'), null);
});

test('estimateSeconds sums work and rest across a day', () => {
  // Block: 4 sets x (12 reps x 3s + 30s hold) + 4 x 30s rest
  const seconds = G.estimateSeconds(PROGRAM.days[0]);
  assert.strictEqual(seconds, 4 * (36 + 30) + 4 * 30);
  assert.strictEqual(G.estimateSeconds(PROGRAM.days[1]), 0);
});

test('estimateSeconds doubles work and rest for per-side exercises', () => {
  const dayPerSide = {
    blocks: [
      {
        id: 'b0', name: 'Per-side circuit', sets: 2, restSeconds: 20,
        exercises: [
          { id: 'e0', slug: 'split-squat', name: 'Split Squat', sets: 2, target: { kind: 'reps', value: 10, perSide: true } },
          { id: 'e1', slug: 'single-arm-hold', name: 'Single Arm Hold', sets: 2, target: { kind: 'time', value: 15, perSide: true } }
        ]
      }
    ]
  };
  // Per set: (10 reps x 3s x 2 sides) + (15s x 2 sides) = 60 + 30 = 90s
  // 2 sets: (2 x 90) + (2 x 20 rest) = 180 + 40 = 220s
  const seconds = G.estimateSeconds(dayPerSide);
  assert.strictEqual(seconds, 220);
});
