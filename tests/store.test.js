'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../assets/js/core/store.js');

function makeProgram(id, name) {
  return {
    id: id, name: name, source: 's.xlsx', importedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1, exerciseCount: 1,
    days: [{ id: id + '-d0', name: 'Day 1', index: 0, blocks: [{
      id: id + '-d0-b0', name: 'Main', sets: 3, rest: '30 SEC', restSeconds: 30,
      exercises: [{ id: id + '-d0-e0', slug: 'squat', name: 'Squat', raw: 'SQUAT', sets: 3,
        target: { kind: 'reps', value: 12, perSide: false, text: '12' },
        tempo: '', rest: '30 SEC', restSeconds: 30, notes: '', videoUrl: null, videoId: 'abc' }]
    }] }]
  };
}

function makeSession(id, programId, startedAt) {
  return {
    id: id, programId: programId, dayId: programId + '-d0',
    startedAt: startedAt, completedAt: startedAt,
    entries: [{ exerciseId: programId + '-d0-e0', slug: 'squat', name: 'Squat',
      sets: [{ index: 0, done: true, reps: 12, seconds: null, note: '' }] }]
  };
}

test('starts empty and reports healthy', () => {
  const store = S.create(S.memoryBackend());
  assert.deepStrictEqual(store.getPrograms(), []);
  assert.deepStrictEqual(store.getSessions(), []);
  assert.strictEqual(store.getActiveProgram(), null);
  assert.strictEqual(store.isHealthy(), true);
});

test('adding a program makes it active', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  assert.strictEqual(store.getActiveProgram().id, 'p1');
  store.addProgram(makeProgram('p2', 'Phase 2'));
  assert.strictEqual(store.getActiveProgram().id, 'p2');
  assert.strictEqual(store.getPrograms().length, 2);
});

test('adding never overwrites existing programs or sessions', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  store.saveSession(makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z'));
  store.addProgram(makeProgram('p2', 'Phase 2'));
  assert.strictEqual(store.getPrograms().length, 2);
  assert.strictEqual(store.getSessions().length, 1);
});

test('deleting a program keeps its sessions and reassigns active', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  store.saveSession(makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z'));
  store.addProgram(makeProgram('p2', 'Phase 2'));
  store.deleteProgram('p2');
  assert.strictEqual(store.getPrograms().length, 1);
  assert.strictEqual(store.getActiveProgram().id, 'p1');
  assert.strictEqual(store.getSessions().length, 1);
});

test('deleting the last program leaves no active program', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  store.deleteProgram('p1');
  assert.strictEqual(store.getActiveProgram(), null);
});

test('saveSession upserts by id', () => {
  const store = S.create(S.memoryBackend());
  const s = makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z');
  store.saveSession(s);
  s.completedAt = '2026-01-02T11:00:00.000Z';
  store.saveSession(s);
  assert.strictEqual(store.getSessions().length, 1);
  assert.strictEqual(store.getSessions()[0].completedAt, '2026-01-02T11:00:00.000Z');
});

test('draft survives a reload and is promoted on finish', () => {
  const backend = S.memoryBackend();
  const store = S.create(backend);
  const draft = makeSession('d1', 'p1', '2026-01-02T10:00:00.000Z');
  draft.completedAt = null;
  store.setDraft(draft);

  const reloaded = S.create(backend);
  assert.strictEqual(reloaded.getDraft().id, 'd1');

  const finished = reloaded.finishDraft('2026-01-02T10:45:00.000Z');
  assert.strictEqual(finished.completedAt, '2026-01-02T10:45:00.000Z');
  assert.strictEqual(reloaded.getDraft(), null);
  assert.strictEqual(reloaded.getSessions().length, 1);
});

test('finishDraft with no draft returns null', () => {
  const store = S.create(S.memoryBackend());
  assert.strictEqual(store.finishDraft('2026-01-02T10:45:00.000Z'), null);
});

test('export then import round-trips through a fresh store', () => {
  const a = S.create(S.memoryBackend());
  a.addProgram(makeProgram('p1', 'Phase 1'));
  a.saveSession(makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z'));
  const payload = a.exportAll();

  const b = S.create(S.memoryBackend());
  const counts = b.importAll(payload);
  assert.deepStrictEqual(counts, { programs: 1, sessions: 1 });
  assert.strictEqual(b.getPrograms()[0].id, 'p1');
  assert.strictEqual(b.getSessions()[0].id, 's1');
  assert.strictEqual(b.getActiveProgram().id, 'p1');
});

test('import merges by id without duplicating', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  store.saveSession(makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z'));
  const payload = store.exportAll();
  const counts = store.importAll(payload);
  assert.deepStrictEqual(counts, { programs: 0, sessions: 0 });
  assert.strictEqual(store.getPrograms().length, 1);
  assert.strictEqual(store.getSessions().length, 1);
});

test('import rejects a payload that is not an export', () => {
  const store = S.create(S.memoryBackend());
  assert.throws(() => store.importAll({ nonsense: true }), /not a valid backup/i);
  assert.throws(() => store.importAll(null), /not a valid backup/i);
});

test('corrupt stored data recovers instead of throwing', () => {
  const backend = S.memoryBackend();
  backend.setItem('ptt.v1.programs', '{not json');
  const store = S.create(backend);
  assert.deepStrictEqual(store.getPrograms(), []);
  assert.strictEqual(backend.getItem('ptt.v1.corrupt.programs'), '{not json');
});

test('a failing backend degrades to in-memory and reports unhealthy', () => {
  const failing = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {}
  };
  const store = S.create(failing);
  store.addProgram(makeProgram('p1', 'Phase 1'));
  assert.strictEqual(store.isHealthy(), false);
  assert.strictEqual(store.getPrograms().length, 1, 'still usable in memory');
});

test('seedIfEmpty only seeds once', () => {
  const store = S.create(S.memoryBackend());
  assert.strictEqual(store.seedIfEmpty(makeProgram('seed', 'Seed')), true);
  assert.strictEqual(store.seedIfEmpty(makeProgram('seed', 'Seed')), false);
  assert.strictEqual(store.getPrograms().length, 1);
});

test('mutating getPrograms return does not affect stored data', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  const programs1 = store.getPrograms();
  programs1.push(makeProgram('ghost', 'Ghost'));
  const programs2 = store.getPrograms();
  assert.strictEqual(programs2.length, 1, 'returned array mutations do not persist');
  assert.strictEqual(programs2[0].id, 'p1');
});

test('mutating getSessions return does not affect stored data', () => {
  const store = S.create(S.memoryBackend());
  store.saveSession(makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z'));
  const sessions1 = store.getSessions();
  sessions1.push(makeSession('ghost', 'p1', '2026-01-02T11:00:00.000Z'));
  const sessions2 = store.getSessions();
  assert.strictEqual(sessions2.length, 1, 'returned array mutations do not persist');
  assert.strictEqual(sessions2[0].id, 's1');
});

test('mutating getDraft return does not affect stored data', () => {
  const store = S.create(S.memoryBackend());
  const draft = makeSession('d1', 'p1', '2026-01-02T10:00:00.000Z');
  draft.completedAt = null;
  store.setDraft(draft);
  const retrieved1 = store.getDraft();
  retrieved1.entries.push({ exerciseId: 'ghost', slug: 'ghost', name: 'Ghost', sets: [] });
  const retrieved2 = store.getDraft();
  assert.strictEqual(retrieved2.entries.length, 1, 'returned object mutations do not persist');
});

test('mutating object passed to addProgram does not affect stored copy', () => {
  const store = S.create(S.memoryBackend());
  const p = makeProgram('p1', 'Phase 1');
  store.addProgram(p);
  p.name = 'Modified';
  p.exerciseCount = 999;
  const stored = store.getPrograms()[0];
  assert.strictEqual(stored.name, 'Phase 1', 'caller mutations do not affect stored copy');
  assert.strictEqual(stored.exerciseCount, 1);
});

test('mutating object passed to saveSession does not affect stored copy', () => {
  const store = S.create(S.memoryBackend());
  const s = makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z');
  store.saveSession(s);
  s.entries[0].name = 'Modified';
  const stored = store.getSessions()[0];
  assert.strictEqual(stored.entries[0].name, 'Squat', 'caller mutations do not affect stored copy');
});

test('mutating object passed to setDraft does not affect stored copy', () => {
  const store = S.create(S.memoryBackend());
  const d = makeSession('d1', 'p1', '2026-01-02T10:00:00.000Z');
  d.completedAt = null;
  store.setDraft(d);
  d.entries[0].sets[0].reps = 999;
  const stored = store.getDraft();
  assert.strictEqual(stored.entries[0].sets[0].reps, 12, 'caller mutations do not affect stored copy');
});

test('corrupt blob preservation is atomic with failing setItem', () => {
  const failing = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {}
  };
  failing.getItem = function(k) {
    if (k === 'ptt.v1.programs') return '{not json';
    return null;
  };
  const store = S.create(failing);
  assert.deepStrictEqual(store.getPrograms(), []);
  assert.strictEqual(failing.getItem('ptt.v1.programs'), '{not json', 'original key not removed if corruption preservation failed');
  assert.strictEqual(failing.getItem('ptt.v1.corrupt.programs'), null, 'corrupt key not created if setItem throws');
});

test('importAll rejects payload with wrong schemaVersion', () => {
  const store = S.create(S.memoryBackend());
  assert.throws(
    () => store.importAll({ schemaVersion: 2, programs: [], sessions: [] }),
    /not a valid backup/i
  );
});
