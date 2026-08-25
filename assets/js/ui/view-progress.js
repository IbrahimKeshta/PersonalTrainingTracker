'use strict';
(function (root) {
  var UI = root.PTT.ui;
  var G = root.PTT.progress;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  function heatmapGrid(sessions) {
    var weeks = 12;
    var cells = G.heatmap(sessions, weeks * 7, new Date());
    // Align so the first column starts on a Monday.
    var firstDow = (new Date(cells[0].date + 'T00:00:00').getDay() + 6) % 7;
    var padded = [];
    for (var i = 0; i < firstDow; i++) padded.push(null);
    var grid = padded.concat(cells);

    var size = 12, gap = 3;
    var cols = Math.ceil(grid.length / 7);
    var chart = svg('svg', {
      class: 'heatmap', viewBox: '0 0 ' + (cols * (size + gap)) + ' ' + (7 * (size + gap)),
      role: 'img', 'aria-label': 'Workout days over the last 12 weeks'
    });

    grid.forEach(function (cell, idx) {
      if (!cell) return;
      var col = Math.floor(idx / 7);
      var row = idx % 7;
      var rect = svg('rect', {
        x: col * (size + gap), y: row * (size + gap), width: size, height: size, rx: 3,
        class: 'heatcell heatcell--' + Math.min(cell.count, 3)
      });
      var title = svg('title', {});
      title.textContent = cell.date + ': ' + cell.count + ' session(s)';
      rect.appendChild(title);
      chart.appendChild(rect);
    });

    return chart;
  }

  function dayBars(sessions, program) {
    var el = UI.el;
    var map = G.dayCompletion(sessions, program);
    var max = 1;
    program.days.forEach(function (d) { max = Math.max(max, map[d.id].count); });
    return el('div', { class: 'daybars' }, program.days.map(function (d) {
      var count = map[d.id].count;
      return el('div', { class: 'daybar' }, [
        el('span', { class: 'daybar-label', text: d.name }),
        el('div', { class: 'daybar-track' }, [
          el('div', { class: 'daybar-fill', style: 'width:' + Math.round((count / max) * 100) + '%' })
        ]),
        el('span', { class: 'daybar-count', text: String(count) })
      ]);
    }));
  }

  function lineChart(history, kind) {
    var w = 320, h = 96, pad = 8;
    var chart = svg('svg', {
      class: 'linechart', viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none',
      role: 'img', 'aria-label': 'Best ' + (kind === 'time' ? 'hold' : 'reps') + ' per session'
    });
    var values = history.map(function (p) { return p.best; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = max - min || 1;
    var stepX = history.length > 1 ? (w - pad * 2) / (history.length - 1) : 0;

    var points = history.map(function (p, i) {
      return {
        x: pad + i * stepX,
        y: pad + (h - pad * 2) * (1 - (p.best - min) / span)
      };
    });

    chart.appendChild(svg('polyline', {
      class: 'linechart-line', fill: 'none',
      points: points.map(function (p) { return p.x + ',' + p.y; }).join(' ')
    }));
    points.forEach(function (p, i) {
      var dot = svg('circle', { class: 'linechart-dot', cx: p.x, cy: p.y, r: 4 });
      var t = svg('title', {});
      t.textContent = history[i].date + ': ' + history[i].best + (kind === 'time' ? 's' : ' reps');
      dot.appendChild(t);
      chart.appendChild(dot);
    });
    return chart;
  }

  function exerciseList(sessions, program) {
    var el = UI.el;
    var seen = {};
    var rows = [];
    program.days.forEach(function (d) {
      d.blocks.forEach(function (b) {
        b.exercises.forEach(function (ex) {
          if (seen[ex.slug]) return;
          seen[ex.slug] = true;
          var history = G.exerciseHistory(sessions, ex.slug);
          if (history.length < 1) return;
          var first = history[0].best;
          var last = history[history.length - 1].best;
          var delta = last - first;
          rows.push(el('article', { class: 'card exrow' }, [
            el('div', { class: 'exrow-head' }, [
              el('h3', { text: ex.name }),
              el('span', {
                class: 'pill' + (delta > 0 ? ' pill--done' : ''),
                text: (delta > 0 ? '+' : '') + delta + (history[0].kind === 'time' ? 's' : ' reps')
              })
            ]),
            el('p', { class: 'ex-note',
                      text: history.length + ' session' + (history.length === 1 ? '' : 's') +
                            ' · best ' + Math.max.apply(null, history.map(function (p) { return p.best; })) +
                            (history[0].kind === 'time' ? 's' : ' reps') }),
            history.length > 1 ? lineChart(history, history[0].kind) : null
          ]));
        });
      });
    });
    return rows;
  }

  function render(ctx) {
    var el = UI.el;
    var program = ctx.program;
    if (!program) {
      return el('div', { class: 'view' }, [
        el('h1', { text: 'Progress' }),
        el('p', { class: 'empty', text: 'Add a plan first.' })
      ]);
    }

    var s = G.summary(ctx.sessions, program, new Date());
    var rows = exerciseList(ctx.sessions, program);
    var hasHistory = s.totalSessions > 0;

    return el('div', { class: 'view' }, [
      el('header', { class: 'view-head' }, [el('h1', { text: 'Progress' })]),

      el('div', { class: 'stat-row' }, [
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value', text: String(s.totalSessions) }),
          el('span', { class: 'stat-label', text: 'sessions' })
        ]),
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value', text: String(s.streakWeeks) }),
          el('span', { class: 'stat-label', text: 'week streak' })
        ]),
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value', text: String(s.longestStreakWeeks) }),
          el('span', { class: 'stat-label', text: 'best streak' })
        ])
      ]),

      hasHistory ? null : UI.banner(
        'No sessions logged yet. Complete a workout to start building your training history.',
        'info'
      ),

      UI.section('Last 12 weeks', [heatmapGrid(ctx.sessions)]),
      UI.section('Days completed', [dayBars(ctx.sessions, program)]),
      UI.section('Exercise progression',
        rows.length ? rows : [el('p', { class: 'empty', text: 'Complete a workout to start tracking exercises.' })])
    ]);
  }

  root.PTT.views = root.PTT.views || {};
  root.PTT.views.progress = { render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
