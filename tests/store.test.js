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
