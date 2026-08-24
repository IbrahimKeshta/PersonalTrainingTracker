'use strict';
(function (root) {
  var routes = [];
  var mountEl = null;
  var notFound = null;

  function toRegex(pattern) {
    var names = [];
    var source = pattern.replace(/:[A-Za-z0-9_]+/g, function (m) {
      names.push(m.slice(1));
      return '([^/]+)';
    });
    return { re: new RegExp('^' + source + '$'), names: names };
  }

  function register(pattern, handler) {
    var compiled = toRegex(pattern);
    routes.push({ re: compiled.re, names: compiled.names, handler: handler });
  }

  function current() {
    return window.location.hash || '#/week';
  }

  function resolve() {
    var hash = current();
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].re.exec(hash);
      if (!m) continue;
      var params = {};
      routes[i].names.forEach(function (name, idx) { params[name] = decodeURIComponent(m[idx + 1]); });
      return { handler: routes[i].handler, params: params, hash: hash };
    }
    return notFound ? { handler: notFound, params: {}, hash: hash } : null;
  }

  function render() {
    var match = resolve();
    if (!match || !mountEl) return;
    var view = match.handler(match.params);
    root.PTT.ui.clear(mountEl);
    if (view) mountEl.appendChild(view);
    mountEl.scrollTop = 0;
    window.scrollTo(0, 0);
    highlightTab(match.hash);
  }

  function highlightTab(hash) {
    var tabs = document.querySelectorAll('#tabbar a');
    for (var i = 0; i < tabs.length; i++) {
      var href = tabs[i].getAttribute('href');
      var active = hash.indexOf(href) === 0 ||
        (href === '#/week' && (hash.indexOf('#/day') === 0 || hash.indexOf('#/session') === 0));
      tabs[i].classList.toggle('is-active', active);
    }
  }

  function start(mount, fallback) {
    mountEl = mount;
    notFound = fallback;
    window.addEventListener('hashchange', render);
    if (!window.location.hash) window.location.hash = '#/week';
    render();
  }

  function go(hash) {
    if (window.location.hash === hash) render(); else window.location.hash = hash;
  }

  root.PTT.router = { register: register, start: start, go: go, render: render, current: current };
})(typeof globalThis !== 'undefined' ? globalThis : this);
