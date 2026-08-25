'use strict';
(function (root) {
  var UI = root.PTT.ui;
  // reload() rebuilds this whole view from scratch, so a message set just before
  // it runs would otherwise flash and vanish before the user reads it. Stash it
  // here and have the next render() pick it up once.
  var pendingMessage = null;

  function parseWorkbook(arrayBuffer, fileName) {
    var wb = XLSX.read(arrayBuffer, { type: 'array' });
    var programs = [];
    var skipped = [];
    wb.SheetNames.forEach(function (name, i) {
      var grid = root.PTT.sheetGrid.fromWorksheet(XLSX, wb.Sheets[name]);
      var program = root.PTT.parse.gridToProgram(grid, {
        id: 'p' + Date.now() + '-' + i,
        name: name.trim() || fileName,
        source: fileName,
        importedAt: new Date().toISOString()
      });
      if (program) programs.push(program); else skipped.push(name.trim() || '(unnamed sheet)');
    });
    return { programs: programs, skipped: skipped };
  }

  function previewCard(program, onConfirm) {
    var el = UI.el;
    var all = [];
    program.days.forEach(function (d) {
      d.blocks.forEach(function (b) { all = all.concat(b.exercises); });
    });
    var withVideo = all.filter(function (e) { return e.videoId; }).length;
    var unparsed = all.filter(function (e) { return e.target.value === null; });

    return el('div', { class: 'card preview' }, [
      el('h3', { text: program.name }),
      el('ul', { class: 'preview-facts' }, [
        el('li', { text: program.days.length + ' days: ' + program.days.map(function (d) { return d.name; }).join(', ') }),
        el('li', { text: all.length + ' exercises' }),
        el('li', { text: withVideo + ' of ' + all.length + ' have a video',
                   class: withVideo === all.length ? '' : 'is-warn' })
      ].concat(unparsed.length ? [
        el('li', { class: 'is-warn',
                   text: unparsed.length + ' with unrecognised reps/duration: ' +
                         unparsed.slice(0, 3).map(function (e) { return e.name + ' ("' + e.target.text + '")'; }).join(', ') +
                         (unparsed.length > 3 ? '…' : '') })
      ] : [])),
      el('button', { class: 'btn btn--primary btn--block', type: 'button',
                     text: 'Add "' + program.name + '"',
                     onclick: function () { onConfirm(program); } })
    ]);
  }

  function render(ctx) {
    var el = UI.el;
    var store = ctx.store;
    var messages = el('div', { class: 'messages' });
    var previews = el('div', { class: 'previews' });

    function say(text, tone) {
      UI.clear(messages);
      messages.appendChild(UI.banner(text, tone || 'info'));
    }

    if (pendingMessage) {
      say(pendingMessage.text, pendingMessage.tone);
      pendingMessage = null;
    }

    function handleFile(file) {
      if (!file) return;
      UI.clear(previews);
      say('Reading ' + file.name + '…');
      var reader = new FileReader();
      reader.onerror = function () { say('Could not read that file.', 'error'); };
      reader.onload = function (e) {
        var result;
        try {
          result = parseWorkbook(new Uint8Array(e.target.result), file.name);
        } catch (err) {
          say('That file could not be opened as a spreadsheet. ' + (err.message || ''), 'error');
          return;
        }
        if (!result.programs.length) {
          say('No workout tables found. Each day needs a header row with "Exercise" in column C. ' +
              'Sheets checked: ' + (result.skipped.join(', ') || 'none') + '.', 'error');
          return;
        }
        say('Found ' + result.programs.length + ' program' + (result.programs.length > 1 ? 's' : '') +
            '. Review, then add.' + (result.skipped.length ? ' Skipped: ' + result.skipped.join(', ') + '.' : ''));
        result.programs.forEach(function (program) {
          previews.appendChild(previewCard(program, function (p) {
            store.addProgram(p);
            window.location.hash = '#/week';
          }));
        });
      };
      reader.readAsArrayBuffer(file);
    }

    var fileInput = el('input', {
      type: 'file', accept: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      class: 'sr-only', id: 'file-input',
      onchange: function () { handleFile(this.files[0]); this.value = ''; }
    });

    var dropzone = el('label', {
      class: 'dropzone', for: 'file-input',
      ondragover: function (e) { e.preventDefault(); this.classList.add('is-over'); },
      ondragleave: function () { this.classList.remove('is-over'); },
      ondrop: function (e) {
        e.preventDefault();
        this.classList.remove('is-over');
        handleFile(e.dataTransfer.files[0]);
      }
    }, [
      el('span', { class: 'dropzone-icon', text: '⇪' }),
      el('span', { text: 'Drop your trainer’s .xlsx here, or tap to choose' })
    ]);

    function exportBackup() {
      var payload = store.exportAll();
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'training-backup-' + root.PTT.progress.dayKey(new Date()) + '.json' });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      say('Backup downloaded.');
    }

    var restoreInput = el('input', {
      type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'restore-input',
      onchange: function () {
        var file = this.files[0];
        this.value = '';
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            var counts = store.importAll(JSON.parse(e.target.result));
            pendingMessage = { text: 'Restored ' + counts.programs + ' program(s) and ' + counts.sessions + ' session(s).', tone: 'info' };
            root.PTT.app.reload();
          } catch (err) {
            say(err.message || 'That backup could not be restored.', 'error');
          }
        };
        reader.readAsText(file);
      }
    });

    var activeId = ctx.program ? ctx.program.id : null;
    var programs = store.getPrograms();

    return el('div', { class: 'view' }, [
      el('header', { class: 'view-head' }, [el('h1', { text: 'Plans' })]),

      messages,
      dropzone,
      fileInput,
      previews,

      UI.section('Your plans', [
        el('div', { class: 'cards' }, (programs.length
          ? programs.slice().reverse().map(function (p) {
              var used = ctx.sessions.filter(function (s) { return s.programId === p.id; }).length;
              return el('article', { class: 'card program' + (p.id === activeId ? ' is-active' : '') }, [
                el('div', { class: 'program-main' }, [
                  el('h3', { text: p.name }),
                  el('p', { class: 'day-card-meta',
                            text: p.days.length + ' days · ' + p.exerciseCount + ' exercises · ' +
                                  used + ' session' + (used === 1 ? '' : 's') })
                ]),
                el('div', { class: 'program-actions' }, [
                  p.id === activeId
                    ? el('span', { class: 'pill pill--done', text: 'Active' })
                    : el('button', { class: 'btn', type: 'button', text: 'Use',
                        onclick: function () { store.setActiveProgram(p.id); root.PTT.app.reload(); } }),
                  el('button', { class: 'btn btn--ghost btn--danger', type: 'button', text: 'Delete',
                    onclick: function () {
                      var msg = used
                        ? 'Delete "' + p.name + '"? Your ' + used + ' logged session(s) are kept.'
                        : 'Delete "' + p.name + '"?';
                      if (window.confirm(msg)) { store.deleteProgram(p.id); root.PTT.app.reload(); }
                    } })
                ])
              ]);
            })
          : [el('p', { class: 'empty', text: 'No plans yet.' })]))
      ]),

      UI.section('Backup', [
        el('p', { class: 'ex-note',
                  text: 'Your progress lives in this browser only. Export a backup file to keep it safe.' }),
        el('div', { class: 'button-row' }, [
          el('button', { class: 'btn', type: 'button', text: 'Export backup', onclick: exportBackup }),
          el('label', { class: 'btn', for: 'restore-input', text: 'Restore backup' })
        ]),
        restoreInput
      ])
    ]);
  }

  root.PTT.views = root.PTT.views || {};
  root.PTT.views.programs = { render: render, parseWorkbook: parseWorkbook };
})(typeof globalThis !== 'undefined' ? globalThis : this);
