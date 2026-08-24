'use strict';
(function (root) {
  var SECONDS_PER_REP = 3;
  var DAY_MS = 86400000;

  function toDate(v) { return v instanceof Date ? v : new Date(v); }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function dayKey(v) {
    var d = toDate(v);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // ISO-8601 week: Monday starts the week; week 1 contains the first Thursday.
  function weekKey(v) {
    var d = toDate(v);
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (t.getDay() + 6) % 7;           // Monday = 0
    t.setDate(t.getDate() - dow + 3);         // move to Thursday of this week
    var isoYear = t.getFullYear();
    var firstThursday = new Date(isoYear, 0, 4);
    var firstDow = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstDow + 3);
    var week = 1 + Math.round((t - firstThursday) / (7 * DAY_MS));
    return isoYear + '-W' + pad(week);
  }

  function weekStart(v) {
    var d = toDate(v);
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return t;
  }

  function completed(sessions) {
    return (sessions || []).filter(function (s) { return s && s.completedAt; });
  }

  function byDateAsc(a, b) { return new Date(a.completedAt) - new Date(b.completedAt); }

  function summary(sessions, program, now) {
    var reference = now ? toDate(now) : new Date();
    var done = completed(sessions).slice().sort(byDateAsc);
    var weekTarget = program && program.days ? program.days.length : 0;

    if (!done.length) {
      return { totalSessions: 0, streakWeeks: 0, longestStreakWeeks: 0,
               weekCompleted: 0, weekTarget: weekTarget, lastSessionAt: null, daysSince: null };
    }

    var weeks = {};
    done.forEach(function (s) { weeks[weekKey(s.completedAt)] = true; });

    var currentWeek = weekStart(reference);
    var streak = 0;
    var cursor = new Date(currentWeek);
    // The in-progress week only extends the streak; it never breaks it.
    if (!weeks[weekKey(cursor)]) cursor.setDate(cursor.getDate() - 7);
    while (weeks[weekKey(cursor)]) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
    }

    var sortedWeeks = Object.keys(weeks).sort();
    var longest = 0;
    var run = 0;
    var prev = null;
    sortedWeeks.forEach(function (key) {
      if (prev === null) { run = 1; } else {
        var expected = new Date(prev.getTime());
        expected.setDate(expected.getDate() + 7);
        run = weekKey(expected) === key ? run + 1 : 1;
      }
      prev = weekStart(firstDateOfWeek(key));
      if (run > longest) longest = run;
    });

    var thisWeekKey = weekKey(reference);
    var weekCompleted = done.filter(function (s) { return weekKey(s.completedAt) === thisWeekKey; }).length;
    var last = done[done.length - 1].completedAt;
    // Use Date.UTC to compute daysSince across DST boundaries: UTC of components is immune to local offset.
    var lastDate = new Date(last);
    var daysSince = Math.floor(
      (Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate()) -
       Date.UTC(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate())) / DAY_MS
    );

    return {
      totalSessions: done.length,
      streakWeeks: streak,
      longestStreakWeeks: Math.max(longest, streak),
      weekCompleted: weekCompleted,
      weekTarget: weekTarget,
      lastSessionAt: last,
      daysSince: daysSince
    };
  }

  // '2026-W35' -> a Date inside that week, used only for streak arithmetic.
  function firstDateOfWeek(key) {
    var parts = key.split('-W');
    var year = parseInt(parts[0], 10);
    var week = parseInt(parts[1], 10);
    var jan4 = new Date(year, 0, 4);
    var start = weekStart(jan4);
    start.setDate(start.getDate() + (week - 1) * 7);
    return start;
  }

  function heatmap(sessions, days, endDate) {
    var end = endDate ? toDate(endDate) : new Date();
    var counts = {};
    completed(sessions).forEach(function (s) {
      var k = dayKey(s.completedAt);
      counts[k] = (counts[k] || 0) + 1;
    });
    var cells = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      d.setDate(d.getDate() - i);
      var key = dayKey(d);
      cells.push({ date: key, count: counts[key] || 0 });
    }
    return cells;
  }

  function dayCompletion(sessions, program) {
    var map = {};
    ((program && program.days) || []).forEach(function (d) { map[d.id] = { count: 0, lastAt: null }; });
    completed(sessions).slice().sort(byDateAsc).forEach(function (s) {
      if (!map[s.dayId]) map[s.dayId] = { count: 0, lastAt: null };
      map[s.dayId].count++;
      map[s.dayId].lastAt = s.completedAt;
    });
    return map;
  }

  function exerciseHistory(sessions, slug) {
    var out = [];
    completed(sessions).slice().sort(byDateAsc).forEach(function (s) {
      (s.entries || []).forEach(function (entry) {
        if (entry.slug !== slug) return;
        var doneSets = (entry.sets || []).filter(function (set) { return set.done; });
        if (!doneSets.length) return;
        var isTime = doneSets.some(function (set) { return set.seconds !== null && set.seconds !== undefined; });
        var values = doneSets.map(function (set) {
          var v = isTime ? set.seconds : set.reps;
          // A set with both reps and seconds null contributes 0 and defaults kind to 'reps'.
          return typeof v === 'number' ? v : 0;
        });
        out.push({
          date: dayKey(s.completedAt),
          kind: isTime ? 'time' : 'reps',
          best: Math.max.apply(null, values),
          total: values.reduce(function (a, b) { return a + b; }, 0),
          sets: doneSets.length
        });
      });
    });
    return out;
  }

  function lastPerformance(sessions, slug) {
    var found = null;
    completed(sessions).slice().sort(byDateAsc).forEach(function (s) {
      (s.entries || []).forEach(function (entry) {
        if (entry.slug !== slug) return;
        var doneSets = (entry.sets || []).filter(function (set) { return set.done; });
        if (doneSets.length) found = { date: dayKey(s.completedAt), sets: doneSets };
      });
    });
    return found;
  }

  function estimateSeconds(day) {
    var total = 0;
    ((day && day.blocks) || []).forEach(function (block) {
      var perRound = 0;
      block.exercises.forEach(function (ex) {
        var t = ex.target || {};
        var one = t.kind === 'time'
          ? (t.value || 0) * (t.perSide ? 2 : 1)
          : (t.value || 0) * SECONDS_PER_REP * (t.perSide ? 2 : 1);
        perRound += one;
      });
      var sets = block.sets || 1;
      total += sets * perRound + sets * (block.restSeconds || 0);
    });
    return total;
  }

  var api = { dayKey: dayKey, weekKey: weekKey, summary: summary, heatmap: heatmap,
              dayCompletion: dayCompletion, exerciseHistory: exerciseHistory,
              lastPerformance: lastPerformance, estimateSeconds: estimateSeconds };
  root.PTT = root.PTT || {};
  root.PTT.progress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
