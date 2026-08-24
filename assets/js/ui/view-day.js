'use strict';
(function (root) {
  root.PTT = root.PTT || {};
  root.PTT.views = root.PTT.views || {};
  root.PTT.views.day = {
    render: function () {
      return root.PTT.ui.el('p', { class: 'empty', text: 'Not built yet.' });
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
