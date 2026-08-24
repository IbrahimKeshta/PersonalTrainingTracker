'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../assets/js/vendor/xlsx.full.min.js');
const SG = require('../assets/js/core/sheet-grid.js');

const WORKBOOK = path.join(__dirname, '..', 'data', 'source', 'crossfit-phase-1.xlsx');

function loadGrid() {
  const wb = XLSX.read(fs.readFileSync(WORKBOOK), { type: 'buffer' });
  return SG.fromWorksheet(XLSX, wb.Sheets[wb.SheetNames[0]]);
}

test('grid is dense and covers the used range', () => {
  const grid = loadGrid();
  assert.ok(grid.length >= 53, 'expected at least 53 rows, got ' + grid.length);
  assert.strictEqual(grid[0].length, 13, 'expected 13 columns A-M');
  grid.forEach((row, i) => {
    assert.strictEqual(row.length, 13, 'row ' + i + ' has wrong width');
    row.forEach((cell) => {
      assert.strictEqual(typeof cell.v, 'string');
      assert.ok(cell.link === null || typeof cell.link === 'string');
    });
  });
});

test('grid carries cell text with numbers stringified', () => {
  const grid = loadGrid();
  assert.strictEqual(grid[1][2].v, 'Exercise');          // C2 header
  assert.strictEqual(grid[2][0].v.trim(), 'day 1');      // A3
  assert.strictEqual(grid[2][2].v.trim(), 'STEP JACKS'); // C3
  assert.strictEqual(grid[2][3].v, '2');                 // D3 sets, numeric in source
  assert.strictEqual(grid[4][4].v, '12');                // E5 reps, numeric in source
});

test('grid carries hyperlinks on the exercise column', () => {
  const grid = loadGrid();
  assert.strictEqual(grid[2][2].link, 'https://www.youtube.com/watch?v=JHdVMkRBuRA');
  assert.strictEqual(grid[3][2].link, 'https://www.youtube.com/shorts/uOY1rxnFY9w');
  assert.strictEqual(grid[2][3].link, null);
  const linked = grid.reduce((n, row) => n + (row[2].link ? 1 : 0), 0);
  assert.strictEqual(linked, 38, 'expected 38 linked exercise cells');
});

test('empty cells are normalized, not missing', () => {
  const grid = loadGrid();
  assert.strictEqual(grid[3][0].v, '');   // A4 blank
  assert.strictEqual(grid[3][0].link, null);
  assert.strictEqual(grid[14][2].v, '');  // C15 blank spacer row
});
