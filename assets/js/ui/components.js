'use strict';
(function (root) {
  var N = root.PTT.normalize;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.indexOf('on') === 0 && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else node.setAttribute(key, value);
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function fmtDuration(seconds) {
    if (!seconds) return '—';
    var mins = Math.round(seconds / 60);
    if (mins < 60) return mins + ' min';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h + 'h ' + (m < 10 ? '0' + m : m) + 'm';
  }

  function fmtClock(seconds) {
    var s = Math.max(0, Math.round(seconds));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' + r : r);
  }

  function fmtTarget(target) {
    if (!target) return '';
    if (target.value === null) return target.text || '—';
    var base = target.kind === 'time' ? target.value + 's' : target.value + ' reps';
    return target.perSide ? base + ' each side' : base;
  }

  // Thumbnail facade: the iframe is created only when the user asks for it,
  // so a 13-exercise page loads 13 images instead of 13 players.
  function video(videoId, opts) {
    opts = opts || {};
    var wrap = el('div', { class: 'video' + (opts.class ? ' ' + opts.class : '') });
    if (!videoId) {
      wrap.appendChild(el('div', { class: 'video-missing', text: 'No video' }));
      return wrap;
    }
    var thumb = el('button', {
      class: 'video-thumb', type: 'button', 'aria-label': 'Play video',
      onclick: function () {
        clear(wrap);
        // YouTube's player requires an HTTP referer header to allow embedding.
        // Pages opened as file:// send no referer at all, so the iframe always
        // fails there (YouTube error 153) regardless of the video. Link out to
        // a real playback instead of showing a broken embedded player.
        if (typeof location !== 'undefined' && location.protocol === 'file:') {
          wrap.appendChild(el('div', { class: 'video-missing' }, [
            el('a', {
              href: 'https://www.youtube.com/watch?v=' + videoId,
              target: '_blank', rel: 'noopener', text: 'Watch on YouTube ↗'
            })
          ]));
          return;
        }
        wrap.appendChild(el('iframe', {
          src: N.embedUrl(videoId) + (opts.autoplay ? '&autoplay=1' : ''),
          allow: 'accelerometer; autoplay; encrypted-media; picture-in-picture',
          allowfullscreen: 'true', loading: 'lazy', title: 'Exercise video'
        }));
      }
    }, [
      el('img', { src: N.thumbUrl(videoId), alt: '', loading: 'lazy',
                  onerror: function () { this.classList.add('is-broken'); } }),
      el('span', { class: 'video-play', text: '▶' })
    ]);
    wrap.appendChild(thumb);
    return wrap;
  }

  function banner(message, tone) {
    return el('div', { class: 'banner banner--' + (tone || 'info'), text: message });
  }

  function section(title, children, actions) {
    return el('section', { class: 'section' }, [
      el('header', { class: 'section-head' }, [
        el('h2', { text: title }),
        actions || null
      ])
    ].concat(children || []));
  }

  root.PTT.ui = { el: el, clear: clear, fmtDuration: fmtDuration, fmtClock: fmtClock,
                  fmtTarget: fmtTarget, video: video, banner: banner, section: section };
})(typeof globalThis !== 'undefined' ? globalThis : this);
