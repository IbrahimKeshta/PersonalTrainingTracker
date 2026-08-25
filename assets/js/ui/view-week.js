'use strict';
(function (root) {
  var UI = root.PTT.ui;
  var G = root.PTT.progress;

  function dayCard(day, completion, hasDraft) {
    var el = UI.el;
    var exercises = day.blocks.reduce(function (n, b) { return n + b.exercises.length; }, 0);
    var blockNames = day.blocks.map(function (b) { return b.name; }).join(' · ');
    var estimate = G.estimateSeconds(day);

    return el('article', { class: 'card day-card' + (completion.count ? ' is-done' : '') }, [
      el('a', { class: 'day-card-main', href: '#/day/' + day.id }, [
        el('div', { class: 'day-card-title' }, [
          el('h3', { text: day.name }),
          completion.count
            ? el('span', { class: 'pill pill--done', text: '✓ ' + completion.count + '×' })
            : el('span', { class: 'pill', text: 'Not yet' })
        ]),
        el('p', { class: 'day-card-blocks', text: blockNames }),
        el('p', { class: 'day-card-meta',
                  text: exercises + ' exercises · ~' + UI.fmtDuration(estimate) })
      ]),
      el('a', {
        class: 'btn btn--primary day-card-start',
        href: '#/session/' + day.id,
        text: hasDraft ? 'Resume' : 'Start'
      })
    ]);
  }

  function render(ctx) {
    var el = UI.el;
    var program = ctx.program;
    if (!program) {
      return el('div', { class: 'view' }, [
        el('h1', { text: 'No plan loaded' }),
        el('p', { class: 'empty', text: 'Upload your trainer’s spreadsheet to get started.' }),
        el('a', { class: 'btn btn--primary', href: '#/programs', text: 'Add a plan' })
      ]);
    }

    var summary = G.summary(ctx.sessions, program, new Date());
    var completion = G.dayCompletion(ctx.sessions, program);
    var draft = ctx.store.getDraft();
    var draftDay = draft && root.PTT.app ? root.PTT.app.findDay(program, draft.dayId) : null;
    var cells = G.heatmap(ctx.sessions, 7, new Date());

    return el('div', { class: 'view' }, [
      el('header', { class: 'view-head' }, [
        el('p', { class: 'eyebrow', text: program.name }),
        el('h1', { text: 'This week' })
      ]),

      el('div', { class: 'stat-row' }, [
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value', text: summary.weekCompleted + '/' + summary.weekTarget }),
          el('span', { class: 'stat-label', text: 'sessions' })
        ]),
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value', text: String(summary.streakWeeks) }),
          el('span', { class: 'stat-label', text: summary.streakWeeks === 1 ? 'week streak' : 'weeks streak' })
        ]),
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value',
                       text: summary.daysSince === null ? '—'
                           : summary.daysSince === 0 ? 'Today' : summary.daysSince + 'd' }),
          el('span', { class: 'stat-label', text: 'since last' })
        ])
      ]),

      el('div', { class: 'weekstrip' }, cells.map(function (cell) {
        var d = new Date(cell.date + 'T00:00:00');
        return el('div', { class: 'weekstrip-day' + (cell.count ? ' is-on' : '') }, [
          el('span', { class: 'weekstrip-dow', text: 'MTWTFSS'.charAt((d.getDay() + 6) % 7) }),
          el('span', { class: 'weekstrip-dot' })
        ]);
      })),

      draft
        ? (draftDay
            ? el('a', { class: 'banner banner--warn banner--link',
                        href: '#/session/' + draft.dayId,
                        text: 'You have a workout in progress — tap to resume' })
            : el('div', { class: 'banner banner--warn' }, [
                el('p', { text: 'You have a paused workout from a different plan. It will not appear here until you switch back to that plan.' }),
                el('button', { class: 'btn btn--ghost btn--danger', type: 'button', text: 'Discard paused workout',
                  onclick: function () {
                    if (!window.confirm('Discard the paused workout from the other plan? Its logged sets will be lost.')) return;
                    ctx.store.clearDraft();
                    root.PTT.app.reload();
                  } })
              ]))
        : null,

      el('div', { class: 'cards' }, program.days.map(function (day) {
        return dayCard(day, completion[day.id] || { count: 0, lastAt: null },
                       !!draftDay && draft.dayId === day.id);
      }))
    ]);
  }

  root.PTT.views = root.PTT.views || {};
  root.PTT.views.week = { render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
