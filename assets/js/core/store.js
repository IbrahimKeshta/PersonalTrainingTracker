'use strict';
(function (root) {
  var PREFIX = 'ptt.v1.';
  var KEYS = { programs: PREFIX + 'programs', sessions: PREFIX + 'sessions',
               settings: PREFIX + 'settings', draft: PREFIX + 'draft' };

  function memoryBackend() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; }
    };
  }

  function create(backend) {
    var healthy = true;
    var cache = {};

    function clone(value) {
      return value ? JSON.parse(JSON.stringify(value)) : value;
    }

    function readRaw(key) {
      try { return backend.getItem(key); } catch (e) { healthy = false; return null; }
    }

    function writeRaw(key, value) {
      try {
        if (value === null) backend.removeItem(key); else backend.setItem(key, value);
        return true;
      } catch (e) { healthy = false; return false; }
    }

    function read(key, fallback) {
      if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
      var raw = readRaw(key);
      var value = fallback;
      if (raw !== null && raw !== undefined) {
        try {
          value = JSON.parse(raw);
        } catch (e) {
          // Preserve the unreadable blob so the user can recover it by hand.
          var preservedCorrupt = writeRaw(key.replace(PREFIX, PREFIX + 'corrupt.'), raw);
          if (preservedCorrupt) {
            writeRaw(key, null);
          }
          value = fallback;
        }
      }
      cache[key] = value;
      return value;
    }

    function write(key, value) {
      cache[key] = value;
      writeRaw(key, JSON.stringify(value));
    }

    function settings() { return read(KEYS.settings, { activeProgramId: null }); }
    function programs() { return read(KEYS.programs, []); }
    function sessions() { return read(KEYS.sessions, []); }

    function setActiveProgram(id) {
      var s = settings();
      s.activeProgramId = id;
      write(KEYS.settings, s);
    }

    function addProgram(program) {
      var list = programs().slice();
      list.push(clone(program));
      write(KEYS.programs, list);
      setActiveProgram(program.id);
      return program;
    }

    function deleteProgram(id) {
      var list = programs().filter(function (p) { return p.id !== id; });
      write(KEYS.programs, list);
      if (settings().activeProgramId === id) {
        setActiveProgram(list.length ? list[list.length - 1].id : null);
      }
    }

    function getActiveProgram() {
      var list = programs();
      var id = settings().activeProgramId;
      var found = null;
      list.forEach(function (p) { if (p.id === id) found = p; });
      var result = found || (list.length ? list[list.length - 1] : null);
      return clone(result);
    }

    function saveSession(session) {
      var list = sessions().slice();
      var replaced = false;
      var cloned = clone(session);
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === cloned.id) { list[i] = cloned; replaced = true; break; }
      }
      if (!replaced) list.push(cloned);
      write(KEYS.sessions, list);
      return session;
    }

    function getDraft() { return read(KEYS.draft, null); }

    function setDraft(session) { write(KEYS.draft, clone(session)); }

    function clearDraft() {
      cache[KEYS.draft] = null;
      writeRaw(KEYS.draft, null);
    }

    function finishDraft(completedAt) {
      var draft = getDraft();
      if (!draft) return null;
      draft.completedAt = completedAt;
      saveSession(draft);
      clearDraft();
      return clone(draft);
    }

    function exportAll() {
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        programs: clone(programs()),
        sessions: clone(sessions()),
        settings: clone(settings())
      };
    }

    function importAll(payload) {
      if (!payload || !Array.isArray(payload.programs) || !Array.isArray(payload.sessions) || payload.schemaVersion !== 1) {
        throw new Error('That file is not a valid backup.');
      }
      var existingPrograms = programs().slice();
      var programIds = {};
      existingPrograms.forEach(function (p) { programIds[p.id] = true; });
      var addedPrograms = 0;
      payload.programs.forEach(function (p) {
        if (!programIds[p.id]) { existingPrograms.push(clone(p)); programIds[p.id] = true; addedPrograms++; }
      });

      var existingSessions = sessions().slice();
      var sessionIds = {};
      existingSessions.forEach(function (s) { sessionIds[s.id] = true; });
      var addedSessions = 0;
      payload.sessions.forEach(function (s) {
        if (!sessionIds[s.id]) { existingSessions.push(clone(s)); sessionIds[s.id] = true; addedSessions++; }
      });

      write(KEYS.programs, existingPrograms);
      write(KEYS.sessions, existingSessions);
      if (!settings().activeProgramId && existingPrograms.length) {
        setActiveProgram(existingPrograms[existingPrograms.length - 1].id);
      }
      return { programs: addedPrograms, sessions: addedSessions };
    }

    function seedIfEmpty(program) {
      if (programs().length) return false;
      addProgram(program);
      return true;
    }

    return {
      getPrograms: function() { return clone(programs()); },
      addProgram: addProgram, deleteProgram: deleteProgram,
      getActiveProgram: getActiveProgram, setActiveProgram: setActiveProgram,
      getSessions: function() { return clone(sessions()); },
      saveSession: saveSession,
      getDraft: function() { return clone(getDraft()); },
      setDraft: setDraft, clearDraft: clearDraft, finishDraft: finishDraft,
      exportAll: exportAll, importAll: importAll, seedIfEmpty: seedIfEmpty,
      isHealthy: function () { return healthy; },
      KEYS: KEYS
    };
  }

  function browserBackend() {
    try {
      var probe = PREFIX + 'probe';
      root.localStorage.setItem(probe, '1');
      root.localStorage.removeItem(probe);
      return root.localStorage;
    } catch (e) {
      return memoryBackend();
    }
  }

  var api = { create: create, memoryBackend: memoryBackend, browserBackend: browserBackend, KEYS: KEYS };
  root.PTT = root.PTT || {};
  root.PTT.store = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
