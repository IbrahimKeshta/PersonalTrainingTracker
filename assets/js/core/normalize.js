'use strict';
(function (root) {
  var TIME_RE = /(\d+(?:\.\d+)?)\s*(sec|secs|second|seconds|s|min|mins|minute|minutes|m)\b/i;
  var PER_SIDE_RE = /\b(each|per\s+side|each\s+side|\/\s*side)\b/i;
  var REPS_RE = /(\d+(?:\.\d+)?)/;

  function str(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function slug(v) {
    return str(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function title(v) {
    return str(v).toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }

  function seconds(v) {
    var s = str(v);
    if (!s) return null;
    var m = TIME_RE.exec(s);
    if (!m) return null;
    var n = parseFloat(m[1]);
    var unit = m[2].toLowerCase();
    var isMinutes = unit.charAt(0) === 'm' && unit !== 's';
    return Math.round(isMinutes ? n * 60 : n);
  }

  function target(v) {
    var text = str(v);
    var perSide = PER_SIDE_RE.test(text);
    var secs = seconds(text);
    if (secs !== null) return { kind: 'time', value: secs, perSide: perSide, text: text };
    var m = REPS_RE.exec(text);
    var value = m ? parseFloat(m[1]) : null;
    return { kind: 'reps', value: value, perSide: perSide, text: text };
  }

  function videoId(url) {
    var s = str(url);
    if (!s) return null;
    var patterns = [
      /[?&]v=([A-Za-z0-9_-]{6,})/,
      /\/shorts\/([A-Za-z0-9_-]{6,})/,
      /\/embed\/([A-Za-z0-9_-]{6,})/,
      /youtu\.be\/([A-Za-z0-9_-]{6,})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = patterns[i].exec(s);
      if (m) return m[1];
    }
    return null;
  }

  function thumbUrl(id) {
    return id ? 'https://img.youtube.com/vi/' + id + '/mqdefault.jpg' : null;
  }

  function embedUrl(id) {
    return id ? 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1' : null;
  }

  var api = {
    str: str, slug: slug, title: title, seconds: seconds,
    target: target, videoId: videoId, thumbUrl: thumbUrl, embedUrl: embedUrl
  };

  root.PTT = root.PTT || {};
  root.PTT.normalize = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
