'use strict';
(function (root) {
  var N = (typeof module !== 'undefined' && module.exports)
    ? require('./normalize.js')
    : root.PTT.normalize;

  var COLUMNS = { day: 0, block: 1, exercise: 2, sets: 3, target: 4, tempo: 5, rest: 6, notes: 12 };

  function cellText(row, index) {
    if (!row || !row[index]) return '';
    return N.str(row[index].v);
  }

  function cellLink(row, index) {
    if (!row || !row[index]) return null;
    return row[index].link || null;
  }

  function isHeaderRow(row) {
    return cellText(row, COLUMNS.exercise).toLowerCase() === 'exercise';
  }

  function findHeaderRows(grid) {
    var out = [];
    for (var i = 0; i < grid.length; i++) if (isHeaderRow(grid[i])) out.push(i);
    return out;
  }

  function buildDay(grid, start, end, dayIndex, programId) {
    var dayName = '';
    var blocks = [];
    var current = null;
    var lastTargetText = '';
    var seq = 0;

    for (var r = start; r < end; r++) {
      var row = grid[r];
      if (!dayName) {
        var a = cellText(row, COLUMNS.day);
        if (a) dayName = N.title(a);
      }

      var exerciseName = cellText(row, COLUMNS.exercise);
      if (!exerciseName) continue;

      var blockName = cellText(row, COLUMNS.block);
      if (blockName || !current) {
        var restText = cellText(row, COLUMNS.rest);
        var setsText = cellText(row, COLUMNS.sets);
        current = {
          id: programId + '-d' + dayIndex + '-b' + blocks.length,
          name: blockName ? N.title(blockName) : 'Main',
          sets: parseInt(setsText, 10) > 0 ? parseInt(setsText, 10) : 1,
          rest: restText,
          restSeconds: N.seconds(restText),
          exercises: []
        };
        blocks.push(current);
        lastTargetText = '';
      }

      var targetText = cellText(row, COLUMNS.target);
      if (targetText) lastTargetText = targetText;

      var url = cellLink(row, COLUMNS.exercise);
      current.exercises.push({
        id: programId + '-d' + dayIndex + '-e' + (seq++),
        slug: N.slug(exerciseName),
        name: N.title(exerciseName),
        raw: exerciseName,
        sets: current.sets,
        target: N.target(lastTargetText),
        tempo: cellText(row, COLUMNS.tempo),
        rest: current.rest,
        restSeconds: current.restSeconds,
        notes: cellText(row, COLUMNS.notes),
        videoUrl: url,
        videoId: N.videoId(url)
      });
    }

    if (!blocks.length) return null;
    return {
      id: programId + '-d' + dayIndex,
      name: dayName || 'Day ' + (dayIndex + 1),
      index: dayIndex,
      blocks: blocks
    };
  }

  function gridToProgram(grid, meta) {
    if (!grid || !grid.length) return null;
    var headers = findHeaderRows(grid);
    if (!headers.length) return null;

    var programId = (meta && meta.id) || ('p' + Date.now());
    var days = [];
    for (var i = 0; i < headers.length; i++) {
      var start = headers[i] + 1;
      var end = i + 1 < headers.length ? headers[i + 1] : grid.length;
      var day = buildDay(grid, start, end, days.length, programId);
      if (day) days.push(day);
    }
    if (!days.length) return null;

    var count = 0;
    days.forEach(function (d) {
      d.blocks.forEach(function (b) { count += b.exercises.length; });
    });

    return {
      id: programId,
      name: (meta && meta.name) || 'Program',
      source: (meta && meta.source) || '',
      importedAt: (meta && meta.importedAt) || new Date().toISOString(),
      schemaVersion: 1,
      exerciseCount: count,
      days: days
    };
  }

  var api = { gridToProgram: gridToProgram, COLUMNS: COLUMNS };
  root.PTT = root.PTT || {};
  root.PTT.parse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
