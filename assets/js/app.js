'use strict';
(function (root) {
  var PTT = root.PTT;
  var store = PTT.store.create(PTT.store.browserBackend());

  function context() {
    return { store: store, program: store.getActiveProgram(), sessions: store.getSessions() };
  }

  function findDay(program, dayId) {
    if (!program) return null;
    var found = null;
    program.days.forEach(function (d) { if (d.id === dayId) found = d; });
    return found;
  }

  function boot() {
    var mount = document.getElementById('app');

    if (PTT.seed) store.seedIfEmpty(PTT.seed);

    if (!store.isHealthy()) {
      document.body.insertBefore(
        PTT.ui.banner('Browser storage is unavailable — progress will not be saved after you close this page.', 'warn'),
        document.body.firstChild
      );
    }

    PTT.router.register('#/week', function () { return PTT.views.week.render(context()); });
    PTT.router.register('#/day/:dayId', function (params) {
      var ctx = context();
      ctx.day = findDay(ctx.program, params.dayId);
      return PTT.views.day.render(ctx);
    });
    PTT.router.register('#/session/:dayId', function (params) {
      var ctx = context();
      ctx.day = findDay(ctx.program, params.dayId);
      return PTT.views.session.render(ctx);
    });
    PTT.router.register('#/progress', function () { return PTT.views.progress.render(context()); });
    PTT.router.register('#/programs', function () { return PTT.views.programs.render(context()); });

    PTT.router.start(mount, function () { return PTT.views.week.render(context()); });
  }

  PTT.app = { context: context, findDay: findDay, reload: function () { PTT.router.render(); } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
