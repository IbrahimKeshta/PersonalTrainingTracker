'use strict';
(function (root) {
  var UI = root.PTT.ui;

  function buildSteps(day) {
    var steps = [];
    day.blocks.forEach(function (block) {
      var sets = block.sets || 1;
      for (var s = 0; s < sets; s++) {
        block.exercises.forEach(function (ex, i) {
          steps.push({
            block: block, exercise: ex, setIndex: s, totalSets: sets,
            isRoundEnd: i === block.exercises.length - 1,
            restAfter: (i === block.exercises.length - 1 && s < sets - 1) ? (block.restSeconds || 0) : 0
          });
        });
      }
    });
    return steps;
  }

  function blankDraft(program, day) {
    var entries = [];
    day.blocks.forEach(function (block) {
      block.exercises.forEach(function (ex) {
        entries.push({
          exerciseId: ex.id, slug: ex.slug, name: ex.name,
          sets: []
        });
        for (var s = 0; s < (block.sets || 1); s++) {
          entries[entries.length - 1].sets.push({ index: s, done: false, reps: null, seconds: null, note: '' });
        }
      });
    });
    return {
      id: 'sess-' + Date.now(),
      programId: program.id, dayId: day.id,
      startedAt: new Date().toISOString(), completedAt: null,
      entries: entries
    };
  }

  function findSet(draft, exerciseId, setIndex) {
    var entry = null;
    draft.entries.forEach(function (e) { if (e.exerciseId === exerciseId) entry = e; });
    if (!entry) return null;
    while (entry.sets.length <= setIndex) {
      entry.sets.push({ index: entry.sets.length, done: false, reps: null, seconds: null, note: '' });
    }
    return entry.sets[setIndex];
  }

  function firstUndoneStep(steps, draft) {
    for (var i = 0; i < steps.length; i++) {
      var set = findSet(draft, steps[i].exercise.id, steps[i].setIndex);
      if (!set || !set.done) return i;
    }
    return steps.length - 1;
  }

  function render(ctx) {
    var el = UI.el;
    var store = ctx.store;

    if (!ctx.day) {
      return el('div', { class: 'view' }, [
        el('h1', { text: 'Day not found' }),
        el('a', { class: 'btn', href: '#/week', text: 'Back to the week' })
      ]);
    }

    var day = ctx.day;
    var steps = buildSteps(day);

    var draft = store.getDraft();
    if (!draft || draft.dayId !== day.id) {
      if (draft && draft.dayId !== day.id) store.clearDraft();
      draft = blankDraft(ctx.program, day);
      store.setDraft(draft);
    }

    var index = firstUndoneStep(steps, draft);
    var timer = null;          // active interval id — shared across every screen this view draws
    var container = el('div', { class: 'view view--session' });

    function stopTimer() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    function persist() { store.setDraft(draft); }

    function goTo(i) {
      stopTimer();
      index = Math.max(0, Math.min(steps.length - 1, i));
      draw();
    }

    function completeSet(value, restSeconds) {
      // Guard against the manual "Done" button being pressed while a countdown
      // (top control) is still ticking — without this the interval keeps firing
      // into whatever screen we navigate to next.
      stopTimer();
      var step = steps[index];
      var set = findSet(draft, step.exercise.id, step.setIndex);
      set.done = true;
      if (step.exercise.target.kind === 'time') set.seconds = value;
      else set.reps = value;
      persist();
      if (index >= steps.length - 1) { drawFinish(); return; }
      if (restSeconds > 0) drawRest(restSeconds);
      else goTo(index + 1);
    }

    function finish() {
      stopTimer();
      var done = store.finishDraft(new Date().toISOString());
      void done;
      window.location.hash = '#/week';
    }

    function abandon() {
      stopTimer();
      store.clearDraft();
      window.location.hash = '#/day/' + day.id;
    }

    // --- countdown widget -------------------------------------------------
    function countdown(seconds, label, onDone) {
      var remaining = seconds;
      var running = false;
      var display = el('div', { class: 'timer-value', text: UI.fmtClock(remaining) });
      var caption = el('p', { class: 'timer-label', text: label });
      var startBtn = el('button', { class: 'btn btn--primary', type: 'button', text: 'Start' });

      function tick() {
        remaining--;
        display.textContent = UI.fmtClock(Math.max(0, remaining));
        if (remaining <= 0) {
          stopTimer();
          running = false;
          startBtn.textContent = 'Done';
          if (navigator.vibrate) navigator.vibrate(200);
          onDone();
        }
      }

      startBtn.addEventListener('click', function () {
        if (running) { stopTimer(); running = false; startBtn.textContent = 'Resume'; return; }
        running = true;
        startBtn.textContent = 'Pause';
        stopTimer();
        timer = setInterval(tick, 1000);
      });

      return { node: el('div', { class: 'timer' }, [display, caption, startBtn]) };
    }

    // --- screens ----------------------------------------------------------
    function drawRest(seconds) {
      UI.clear(container);
      var next = steps[index + 1];
      var cd = countdown(seconds, 'Rest', function () { goTo(index + 1); });
      container.appendChild(el('div', { class: 'session-rest' }, [
        el('p', { class: 'eyebrow', text: 'Rest' }),
        cd.node,
        el('p', { class: 'rest-next', text: 'Next: ' + next.exercise.name }),
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'Skip rest',
                       onclick: function () { goTo(index + 1); } })
      ]));
      cd.node.querySelector('.btn').click();  // rest starts automatically
    }

    function drawFinish() {
      stopTimer();
      UI.clear(container);
      var doneSets = 0;
      var doneExercises = 0;
      draft.entries.forEach(function (e) {
        var n = e.sets.filter(function (s) { return s.done; }).length;
        doneSets += n;
        if (n > 0) doneExercises++;
      });
      var minutes = Math.max(1, Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 60000));

      container.appendChild(el('div', { class: 'session-finish' }, [
        el('h1', { text: 'Workout complete' }),
        el('div', { class: 'stat-row' }, [
          el('div', { class: 'stat' }, [
            el('span', { class: 'stat-value', text: String(minutes) }),
            el('span', { class: 'stat-label', text: 'minutes' })
          ]),
          el('div', { class: 'stat' }, [
            el('span', { class: 'stat-value', text: String(doneSets) }),
            el('span', { class: 'stat-label', text: 'sets' })
          ]),
          el('div', { class: 'stat' }, [
            el('span', { class: 'stat-value', text: String(doneExercises) }),
            el('span', { class: 'stat-label', text: 'exercises' })
          ])
        ]),
        el('button', { class: 'btn btn--primary btn--block', type: 'button',
                       text: 'Save workout', onclick: finish })
      ]));
    }

    function draw() {
      UI.clear(container);
      var step = steps[index];
      var ex = step.exercise;
      var set = findSet(draft, ex.id, step.setIndex);
      var isTime = ex.target.kind === 'time';
      var perSide = isTime && !!ex.target.perSide;
      // For a perSide time target the exercise is "complete" once both sides have
      // been held, so the number we log is the sum of both holds, not one.
      var fullValue = perSide ? ex.target.value * 2 : ex.target.value;
      var logged = { value: isTime ? (set.seconds !== null ? set.seconds : fullValue)
                                   : (set.reps !== null ? set.reps : ex.target.value) };

      var progressPct = Math.round((index / steps.length) * 100);

      var valueDisplay = el('span', { class: 'stepper-value',
        text: logged.value === null ? '—' : String(logged.value) + (isTime ? 's' : '') });

      function bump(delta) {
        var base = logged.value === null ? 0 : logged.value;
        logged.value = Math.max(0, base + delta);
        valueDisplay.textContent = String(logged.value) + (isTime ? 's' : '');
      }

      var control;
      if (isTime && ex.target.value) {
        if (perSide) {
          // Two-phase countdown: run the hold once per side, back to back, then
          // complete the set with the combined time. Phase 2 starts on its own —
          // the vibration + "Done" flash at the end of phase 1 is the cue to switch.
          control = el('div', { class: 'timer-phase' });
          var renderPhase = function (phase) {
            UI.clear(control);
            var cd = countdown(ex.target.value, 'Hold — side ' + phase + ' of 2', function () {
              if (phase === 1) renderPhase(2);
              else completeSet(fullValue, step.restAfter);
            });
            control.appendChild(cd.node);
            if (phase === 2) cd.node.querySelector('.btn').click();
          };
          renderPhase(1);
        } else {
          var cd = countdown(ex.target.value, 'Hold', function () {
            completeSet(ex.target.value, step.restAfter);
          });
          control = cd.node;
        }
      } else {
        control = el('div', { class: 'stepper' }, [
          el('button', { class: 'btn stepper-btn', type: 'button', text: '−',
                         onclick: function () { bump(-1); } }),
          valueDisplay,
          el('button', { class: 'btn stepper-btn', type: 'button', text: '+',
                         onclick: function () { bump(1); } })
        ]);
      }

      var noteField = el('input', {
        class: 'note-input', type: 'text', placeholder: 'Note (optional)',
        value: set.note || '',
        oninput: function () { set.note = this.value; persist(); }
      });

      container.appendChild(el('div', { class: 'session' }, [
        el('header', { class: 'session-head' }, [
          el('button', { class: 'backlink', type: 'button', text: '‹ Exit', onclick: abandon }),
          el('span', { class: 'session-count', text: (index + 1) + ' / ' + steps.length })
        ]),
        el('div', { class: 'progressbar' }, [
          el('div', { class: 'progressbar-fill', style: 'width:' + progressPct + '%' })
        ]),

        el('p', { class: 'eyebrow', text: step.block.name + ' · set ' + (step.setIndex + 1) + ' of ' + step.totalSets }),
        el('h1', { class: 'session-title', text: ex.name }),
        el('p', { class: 'session-target', text: 'Target: ' + UI.fmtTarget(ex.target) }),

        UI.video(ex.videoId, { class: 'session-video' }),

        el('div', { class: 'set-dots' }, (function () {
          var dots = [];
          for (var s = 0; s < step.totalSets; s++) {
            var d = findSet(draft, ex.id, s);
            dots.push(el('span', {
              class: 'set-dot' + (d && d.done ? ' is-done' : '') + (s === step.setIndex ? ' is-current' : '')
            }));
          }
          return dots;
        })()),

        control,
        noteField,

        el('div', { class: 'session-actions' }, [
          el('button', { class: 'btn btn--ghost', type: 'button', text: '‹ Back',
                         disabled: index === 0 ? 'disabled' : null,
                         onclick: function () { goTo(index - 1); } }),
          el('button', { class: 'btn btn--primary', type: 'button',
                         text: index >= steps.length - 1 ? 'Finish' : 'Done',
                         onclick: function () { completeSet(logged.value, step.restAfter); } }),
          el('button', { class: 'btn btn--ghost', type: 'button', text: 'Skip ›',
                         onclick: function () {
                           stopTimer();
                           if (index >= steps.length - 1) drawFinish(); else goTo(index + 1);
                         } })
        ])
      ]));
    }

    draw();
    return container;
  }

  root.PTT.views = root.PTT.views || {};
  root.PTT.views.session = { render: render, buildSteps: buildSteps };
})(typeof globalThis !== 'undefined' ? globalThis : this);
