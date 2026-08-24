'use strict';
(function (root) {
  function fromWorksheet(XLSX, ws) {
    if (!ws || !ws['!ref']) return [];
    var range = XLSX.utils.decode_range(ws['!ref']);
    var grid = [];
    for (var r = range.s.r; r <= range.e.r; r++) {
      var row = [];
      for (var c = range.s.c; c <= range.e.c; c++) {
        var addr = XLSX.utils.encode_cell({ r: r, c: c });
        var cell = ws[addr];
        var value = '';
        if (cell && cell.v !== undefined && cell.v !== null) {
          value = cell.w !== undefined ? String(cell.w) : String(cell.v);
        }
        var link = cell && cell.l && cell.l.Target ? String(cell.l.Target) : null;
        row.push({ v: value, link: link });
      }
      grid.push(row);
    }
    return grid;
  }

  var api = { fromWorksheet: fromWorksheet };
  root.PTT = root.PTT || {};
  root.PTT.sheetGrid = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
