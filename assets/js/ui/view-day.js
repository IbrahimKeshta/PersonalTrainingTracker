'use strict';
(function (root) {
  var UI = root.PTT.ui;
  var G = root.PTT.progress;

  function lastLine(sessions, ex) {
    var last = G.lastPerformance(sessions, ex.slug);
    if (!last) return null;
    var values = last.sets.map(function (s) {
      return s.seconds !== null && s.seconds !== undefined ? s.seconds + 's' : String(s.reps);
    });
    return 'Last time (' + last.date + '): ' + values.join(' · ');
  }

  function exerciseRow(ex, sessions) {
    var el = UI.el;
    var bodyId = 'ex-body-' + ex.id;
    var body = el('div', { class: 'ex-body', id: bodyId, hidden: 'hidden' });
    var expanded = false;
    var videoEl = null;

    var toggle = el('button', {
      class: 'ex-head', type: 'button', 'aria-expanded': 'false', 'aria-controls': bodyId,
      onclick: function () {
        expanded = !expanded;
        this.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        if (expanded) {
          body.removeAttribute('hidden');
          if (!body.childNodes.length) {
            videoEl = UI.video(ex.videoId);
            body.appendChild(videoEl);
            var meta = [];
            if (ex.tempo) meta.push(el('p', { class: 'ex-note', text: 'Tempo: ' + ex.tempo }));
            if (ex.notes) meta.push(el('p', { class: 'ex-note', text: ex.notes }));
            var line = lastLine(sessions, ex);
            if (line) meta.push(el('p', { class: 'ex-note ex-note--last', text: line }));
            meta.forEach(function (m) { body.appendChild(m); });
          }
        } else {
          body.setAttribute('hidden', 'hidden');
          // Collapsing must kill a playing iframe (audio keeps going otherwise) without
          // touching the note paragraphs already built, or the build-once guard above
          // would see an empty body and duplicate them on the next expand. The facade
          // has been "opened" once its play button (.video-thumb) is gone — true for
          // both the real iframe and the file:// "Watch on YouTube" fallback link.
          if (ex.videoId && videoEl && !videoEl.querySelector('.video-thumb')) {
            var fresh = UI.video(ex.videoId);
            body.replaceChild(fresh, videoEl);
            videoEl = fresh;
          }
        }
      }
    }, [
      ex.videoId
        ? el('img', { class: 'ex-thumb', src: root.PTT.normalize.thumbUrl(ex.videoId), alt: '', loading: 'lazy' })
        : el('span', { class: 'ex-thumb ex-thumb--empty', text: '—' }),
      el('span', { class: 'ex-text' }, [
        el('span', { class: 'ex-name', text: ex.name }),
        el('span', { class: 'ex-target', text: ex.sets + ' × ' + UI.fmtTarget(ex.target) })
      ]),
      el('span', { class: 'ex-chevron', text: '⌄' })
    ]);

    return el('li', { class: 'ex' }, [toggle, body]);
  }

  function render(ctx) {
    var el = UI.el;
    if (!ctx.day) {
      return el('div', { class: 'view' }, [
        el('h1', { text: 'Day not found' }),
        el('a', { class: 'btn', href: '#/week', text: 'Back to the week' })
      ]);
    }

    var day = ctx.day;
    var total = day.blocks.reduce(function (n, b) { return n + b.exercises.length; }, 0);

    return el('div', { class: 'view' }, [
      el('header', { class: 'view-head' }, [
        el('a', { class: 'backlink', href: '#/week', text: '‹ Week' }),
        el('h1', { text: day.name }),
        el('p', { class: 'day-card-meta',
                  text: total + ' exercises · ~' + UI.fmtDuration(G.estimateSeconds(day)) })
      ]),

      el('div', { class: 'blocks' }, day.blocks.map(function (block) {
        return el('section', { class: 'block' }, [
          el('header', { class: 'block-head' }, [
            el('h2', { text: block.name }),
            el('span', { class: 'pill',
                         text: block.sets + ' sets' + (block.restSeconds ? ' · ' + block.restSeconds + 's rest' : '') })
          ]),
          el('ul', { class: 'ex-list' }, block.exercises.map(function (ex) {
            return exerciseRow(ex, ctx.sessions);
          }))
        ]);
      })),

      el('a', { class: 'btn btn--primary btn--block', href: '#/session/' + day.id, text: 'Start workout' })
    ]);
  }

  root.PTT.views = root.PTT.views || {};
  root.PTT.views.day = { render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
