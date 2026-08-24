# Personal Training Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-build static web app that imports a trainer's `.xlsx` workout plan, plays each exercise's video inline, guides workouts with timers, and tracks progress across uploaded programs.

**Architecture:** Classic (non-module) browser scripts, each attaching one namespace to a global `PTT` object, so the app runs by opening `index.html` from the filesystem. Pure logic lives in `assets/js/core/` with no DOM access and is unit-tested under Node; DOM code lives in `assets/js/ui/`. SheetJS is confined to a single adapter that converts a worksheet to a plain grid.

**Tech Stack:** Vanilla JavaScript (ES2017, no transpiler), SheetJS 0.20.3 (vendored), Node 20 + `node:test` for tests only, YouTube iframe embeds.

**Spec:** `docs/superpowers/specs/2026-08-24-personal-training-tracker-design.md`

## Global Constraints

- **No build step, no package manager.** Nothing in `assets/` may require compilation, bundling, or `npm install` to run.
- **No ES modules in app code.** Browsers block `import` on `file://`. Every app script is a classic `<script>` that assigns to `window.PTT`. `import`/`export` statements are forbidden in `assets/` and `data/`.
- **No `fetch`/`XMLHttpRequest` against local files.** Blocked on `file://`. Data ships as `.js` files loaded by `<script>` tags.
- **Core modules must load under both Node and the browser.** Use the dual-export footer defined in Task 1 verbatim in every `assets/js/core/*.js` file.
- **Node invocation.** Node is not on `PATH`. Every command uses the absolute binary:
  `"C:/Users/PC/AppData/Roaming/fnm/node-versions/v20.17.0/installation/node.exe"`
  In this plan that path is written as `$NODE`. Define it per shell session:
  `export NODE="C:/Users/PC/AppData/Roaming/fnm/node-versions/v20.17.0/installation/node.exe"`
- **SheetJS reads buffers, not paths.** `XLSX.readFile()` fails in this environment. Always use `XLSX.read(buffer, {type:'buffer'})` under Node and `XLSX.read(arrayBuffer, {type:'array'})` in the browser.
- **Schema version is `v1`.** All localStorage keys are prefixed `ptt.v1.`.
- **Target amounts are per side.** `20 SEC EACH` is `{kind:'time', value:20, perSide:true}` — two 20-second holds.
- **Dark theme only.** No light-mode variant in this release.

## File Structure

| Path | Responsibility |
|---|---|
| `index.html` | Shell: script tags in dependency order, app root, nav |
| `assets/css/app.css` | All styling; dark theme, phone-first |
| `assets/js/vendor/xlsx.full.min.js` | Vendored SheetJS 0.20.3 (already downloaded) |
| `assets/js/core/normalize.js` | Text → structured values: targets, seconds, video ids, slugs, titles |
| `assets/js/core/sheet-grid.js` | SheetJS worksheet → plain `grid` (the only SheetJS-aware code) |
| `assets/js/core/parse-grid.js` | `grid` → `Program` object |
| `assets/js/core/store.js` | localStorage repository, export/import, draft handling |
| `assets/js/core/progress.js` | Streaks, completion, heatmap, per-exercise history |
| `assets/js/ui/components.js` | Shared DOM helpers, video facade, timer widget |
| `assets/js/ui/router.js` | Hash router |
| `assets/js/ui/view-week.js` | `#/week` |
| `assets/js/ui/view-day.js` | `#/day/:dayId` |
| `assets/js/ui/view-session.js` | `#/session/:dayId` |
| `assets/js/ui/view-progress.js` | `#/progress` |
| `assets/js/ui/view-programs.js` | `#/programs`: upload, preview, backup |
| `assets/js/app.js` | Bootstrap: seed on first run, mount router |
| `data/source/crossfit-phase-1.xlsx` | The original workbook (already copied) |
| `data/seed-program.js` | Generated: assigns `PTT.seed` |
| `tools/build-seed.js` | Node script that regenerates `data/seed-program.js` |
| `tests/*.test.js` | `node:test` suites |
| `tests/fixtures/phase1-grid.js` | Generated grid fixture from the real workbook |
| `tools/build-fixture.js` | Node script that regenerates the fixture |

Files already present from the design phase: `assets/js/vendor/xlsx.full.min.js`, `data/source/crossfit-phase-1.xlsx`, `.gitignore`, the spec.

---

### Task 1: Normalize module

Converts the shouty, inconsistent spreadsheet text into structured values. Pure functions, no dependencies. This is the foundation every other module builds on.

**Files:**
- Create: `assets/js/core/normalize.js`
- Test: `tests/normalize.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PTT.normalize.slug(text) -> string` — lowercase, hyphenated, trimmed
  - `PTT.normalize.title(text) -> string` — Title Case display name
  - `PTT.normalize.seconds(text) -> number|null` — `"30 SEC"` → `30`, `"1 min"` → `60`
  - `PTT.normalize.target(text) -> {kind:'reps'|'time', value:number|null, perSide:boolean, text:string}`
  - `PTT.normalize.videoId(url) -> string|null`
  - `PTT.normalize.thumbUrl(videoId) -> string|null`
  - `PTT.normalize.embedUrl(videoId) -> string|null`

- [ ] **Step 1: Write the failing test**

Create `tests/normalize.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const N = require('../assets/js/core/normalize.js');

test('slug is stable across casing and whitespace', () => {
  assert.strictEqual(N.slug('WALL SIT '), 'wall-sit');
  assert.strictEqual(N.slug('  wall  sit'), 'wall-sit');
  assert.strictEqual(N.slug('KNEE SIDE PLANK  '), 'knee-side-plank');
  assert.strictEqual(N.slug('PRONED TOWELL PULLDOWN '), 'proned-towell-pulldown');
  assert.strictEqual(N.slug(''), '');
  assert.strictEqual(N.slug(null), '');
});

test('title case tames the shouting', () => {
  assert.strictEqual(N.title('STEP JACKS '), 'Step Jacks');
  assert.strictEqual(N.title('day 1 '), 'Day 1');
  assert.strictEqual(N.title('CIRCUIT 2'), 'Circuit 2');
  assert.strictEqual(N.title(''), '');
});

test('seconds parses every rest/duration form in the sheet', () => {
  assert.strictEqual(N.seconds('30 SEC '), 30);
  assert.strictEqual(N.seconds('30SEC'), 30);
  assert.strictEqual(N.seconds('20 SEC'), 20);
  assert.strictEqual(N.seconds('1 MIN'), 60);
  assert.strictEqual(N.seconds('1 min '), 60);
  assert.strictEqual(N.seconds('2 mins'), 120);
  assert.strictEqual(N.seconds('90s'), 90);
  assert.strictEqual(N.seconds('12'), null);
  assert.strictEqual(N.seconds(''), null);
  assert.strictEqual(N.seconds(null), null);
});

test('target distinguishes reps from time', () => {
  assert.deepStrictEqual(N.target(12), { kind: 'reps', value: 12, perSide: false, text: '12' });
  assert.deepStrictEqual(N.target('8'), { kind: 'reps', value: 8, perSide: false, text: '8' });
  assert.deepStrictEqual(N.target('12 REPS'), { kind: 'reps', value: 12, perSide: false, text: '12 REPS' });
  assert.deepStrictEqual(N.target('30 SEC '), { kind: 'time', value: 30, perSide: false, text: '30 SEC' });
  assert.deepStrictEqual(N.target('30SEC'), { kind: 'time', value: 30, perSide: false, text: '30SEC' });
  assert.deepStrictEqual(N.target('1 MIN'), { kind: 'time', value: 60, perSide: false, text: '1 MIN' });
});

test('target marks per-side work without halving the value', () => {
  assert.deepStrictEqual(N.target('20 SEC EACH'), { kind: 'time', value: 20, perSide: true, text: '20 SEC EACH' });
  assert.deepStrictEqual(N.target('10 EACH SIDE'), { kind: 'reps', value: 10, perSide: true, text: '10 EACH SIDE' });
});

test('unparseable target keeps the raw text and a null value', () => {
  const r = N.target('AMRAP until failure');
  assert.strictEqual(r.kind, 'reps');
  assert.strictEqual(r.value, null);
  assert.strictEqual(r.text, 'AMRAP until failure');
  const empty = N.target('');
  assert.strictEqual(empty.value, null);
  assert.strictEqual(empty.text, '');
});

test('videoId handles watch, shorts, youtu.be and embed forms', () => {
  assert.strictEqual(N.videoId('https://www.youtube.com/watch?v=JHdVMkRBuRA'), 'JHdVMkRBuRA');
  assert.strictEqual(N.videoId('https://www.youtube.com/shorts/uOY1rxnFY9w'), 'uOY1rxnFY9w');
  assert.strictEqual(N.videoId('https://youtu.be/g_BYB0R-4Ws'), 'g_BYB0R-4Ws');
  assert.strictEqual(N.videoId('https://www.youtube.com/embed/q-UYBCNGaTw'), 'q-UYBCNGaTw');
  assert.strictEqual(N.videoId('https://www.youtube.com/watch?v=c4DAnQ6DtF8&t=30s'), 'c4DAnQ6DtF8');
  assert.strictEqual(N.videoId('https://example.com/video.mp4'), null);
  assert.strictEqual(N.videoId(null), null);
});

test('thumb and embed urls are built from the id', () => {
  assert.strictEqual(N.thumbUrl('abc123'), 'https://img.youtube.com/vi/abc123/mqdefault.jpg');
  assert.strictEqual(N.embedUrl('abc123'), 'https://www.youtube-nocookie.com/embed/abc123?rel=0&playsinline=1');
  assert.strictEqual(N.thumbUrl(null), null);
  assert.strictEqual(N.embedUrl(null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export NODE="C:/Users/PC/AppData/Roaming/fnm/node-versions/v20.17.0/installation/node.exe"
"$NODE" --test tests/normalize.test.js
```

Expected: FAIL — `Cannot find module '../assets/js/core/normalize.js'`

- [ ] **Step 3: Write minimal implementation**

Create `assets/js/core/normalize.js`:

```js
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
```

**This dual-export footer is the required pattern for every `core/*.js` file.** It assigns to `PTT` for the browser and to `module.exports` for Node, with no `import`/`export` keywords.

- [ ] **Step 4: Run test to verify it passes**

```bash
"$NODE" --test tests/normalize.test.js
```

Expected: PASS — 8 tests, 0 failures.

Note the `2 mins` case: the guard `unit.charAt(0) === 'm' && unit !== 's'` treats `m`, `min`, `mins`, `minute`, `minutes` as minutes, and `s`, `sec`, `secs`, `second`, `seconds` as seconds. Verify `90s` → `90`, not `5400`.

- [ ] **Step 5: Commit**

```bash
git add tests/normalize.test.js assets/js/core/normalize.js
git commit -m "feat: add normalize module for spreadsheet text parsing"
```

---

### Task 2: Grid fixture from the real workbook

Generates a checked-in JS fixture of the actual spreadsheet so Task 3's parser is tested against real data, not invented data. Also produces the `sheet-grid` adapter the app uses at upload time.

**Files:**
- Create: `assets/js/core/sheet-grid.js`
- Create: `tools/build-fixture.js`
- Create: `tests/fixtures/phase1-grid.js` (generated by the script)
- Test: `tests/sheet-grid.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PTT.sheetGrid.fromWorksheet(XLSX, worksheet) -> Cell[][]` where `Cell = {v: string, link: string|null}`
  - `tests/fixtures/phase1-grid.js` exporting `{name: string, grid: Cell[][]}`

A `grid` is a dense 2D array indexed `[rowIndex][colIndex]`, zero-based, covering `A1` to the sheet's last used cell. Missing cells are `{v:'', link:null}`. `v` is always a string; numbers are stringified. This is the boundary that keeps SheetJS out of the rest of the app.

- [ ] **Step 1: Write the failing test**

Create `tests/sheet-grid.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
"$NODE" --test tests/sheet-grid.test.js
```

Expected: FAIL — `Cannot find module '../assets/js/core/sheet-grid.js'`

- [ ] **Step 3: Write minimal implementation**

Create `assets/js/core/sheet-grid.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
"$NODE" --test tests/sheet-grid.test.js
```

Expected: PASS — 4 tests. If the "38 linked cells" assertion fails, print the actual count and inspect before changing the assertion; the source file was verified to contain exactly 38 hyperlinks.

- [ ] **Step 5: Write the fixture generator**

Create `tools/build-fixture.js`:

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../assets/js/vendor/xlsx.full.min.js');
const SG = require('../assets/js/core/sheet-grid.js');

const src = path.join(__dirname, '..', 'data', 'source', 'crossfit-phase-1.xlsx');
const out = path.join(__dirname, '..', 'tests', 'fixtures', 'phase1-grid.js');

const wb = XLSX.read(fs.readFileSync(src), { type: 'buffer' });
const name = wb.SheetNames[0];
const grid = SG.fromWorksheet(XLSX, wb.Sheets[name]);

// Trim trailing all-empty rows; the sheet declares 891 rows but uses ~53.
let last = grid.length - 1;
while (last >= 0 && grid[last].every((c) => c.v === '' && c.link === null)) last--;
const trimmed = grid.slice(0, last + 1);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  '// Generated by tools/build-fixture.js from data/source/crossfit-phase-1.xlsx\n' +
  "// Do not edit by hand. Regenerate with: \"$NODE\" tools/build-fixture.js\n" +
  "'use strict';\n" +
  'module.exports = ' + JSON.stringify({ name: name, grid: trimmed }, null, 1) + ';\n',
  'utf8'
);
console.log('wrote', out, trimmed.length, 'rows');
```

- [ ] **Step 6: Generate the fixture and sanity-check it**

```bash
"$NODE" tools/build-fixture.js
"$NODE" -e "const f=require('./tests/fixtures/phase1-grid.js'); console.log(f.name, f.grid.length, f.grid.filter(r=>r[2].link).length)"
```

Expected: fixture reports ~53 rows and 38 linked rows.

- [ ] **Step 7: Commit**

```bash
git add assets/js/core/sheet-grid.js tools/build-fixture.js tests/sheet-grid.test.js tests/fixtures/phase1-grid.js
git commit -m "feat: add SheetJS grid adapter and real-workbook fixture"
```

---

### Task 3: Grid to Program parser

The heart of the import. Turns the 2D grid into the nested `Program` structure, applying the sheet's implicit inheritance rules.

**Files:**
- Create: `assets/js/core/parse-grid.js`
- Test: `tests/parse-grid.test.js`

**Interfaces:**
- Consumes: `PTT.normalize` (Task 1), `tests/fixtures/phase1-grid.js` (Task 2)
- Produces:
  - `PTT.parse.gridToProgram(grid, meta) -> Program|null` where `meta = {name, source, id}`
  - `PTT.parse.COLUMNS` — the column index map, exported for tests

**Parsing rules** (each derived from the real sheet):

1. A **day table** starts at any row whose column C text is `Exercise` (case-insensitive).
2. The table runs until the next header row or the end of the grid.
3. Rows with an empty column C are skipped — they are spacers, not exercises.
4. The **day name** is the first non-empty column A within the table.
5. A non-empty column B **starts a new block**. Its `sets` is that row's column D, its `rest` is that row's column G.
6. Column E (**reps/duration**) inherits the last non-empty value within the current block. This is what makes `RUNNING IN PLACE` inherit `30 SEC` from `STEP JACKS`.
7. Exercises before any block get a block named `Main`.
8. A block with no sets value defaults to `1`.
9. A program with zero days returns `null`.

- [ ] **Step 1: Write the failing test**

Create `tests/parse-grid.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../assets/js/core/parse-grid.js');
const fixture = require('./fixtures/phase1-grid.js');

const META = { id: 'p1', name: 'CrossFit phase 1 program', source: 'crossfit-phase-1.xlsx' };
const program = P.gridToProgram(fixture.grid, META);

test('parses three days from the real workbook', () => {
  assert.ok(program, 'expected a program');
  assert.strictEqual(program.days.length, 3);
  assert.deepStrictEqual(program.days.map((d) => d.name), ['Day 1', 'Day 2', 'Day 3']);
  assert.strictEqual(program.name, META.name);
  assert.strictEqual(program.schemaVersion, 1);
});

test('day 1 has 12 exercises across 4 blocks with correct sets', () => {
  const d1 = program.days[0];
  assert.deepStrictEqual(d1.blocks.map((b) => b.name), ['Warm Up', 'Mobility', 'Circuit 1', 'Circuit 2']);
  assert.deepStrictEqual(d1.blocks.map((b) => b.sets), [2, 2, 4, 4]);
  assert.deepStrictEqual(d1.blocks.map((b) => b.exercises.length), [2, 3, 4, 3]);
  const total = d1.blocks.reduce((n, b) => n + b.exercises.length, 0);
  assert.strictEqual(total, 12);
});

test('days 2 and 3 have 13 exercises each', () => {
  assert.strictEqual(program.days[1].blocks.reduce((n, b) => n + b.exercises.length, 0), 13);
  assert.strictEqual(program.days[2].blocks.reduce((n, b) => n + b.exercises.length, 0), 13);
  assert.deepStrictEqual(program.days[1].blocks.map((b) => b.name), ['Warm Up', 'Core', 'Circuit 1', 'Circuit 2']);
  assert.deepStrictEqual(program.days[2].blocks.map((b) => b.name), ['Mobility', 'Core', 'Circuit 1', 'Circuit 2']);
});

test('rest inherits per block and only where the sheet sets it', () => {
  const d1 = program.days[0];
  assert.strictEqual(d1.blocks[0].restSeconds, null);   // Warm Up has no rest column
  assert.strictEqual(d1.blocks[1].restSeconds, null);   // Mobility
  assert.strictEqual(d1.blocks[2].restSeconds, 30);     // Circuit 1: "30 SEC"
  assert.strictEqual(d1.blocks[3].restSeconds, 30);     // Circuit 2
});

test('reps/duration inherits down within a block', () => {
  const warmup = program.days[0].blocks[0];
  assert.strictEqual(warmup.exercises[0].name, 'Step Jacks');
  assert.deepStrictEqual(warmup.exercises[0].target, { kind: 'time', value: 30, perSide: false, text: '30 SEC' });
  // RUNNING IN PLACE has a blank E cell and must inherit 30 SEC
  assert.strictEqual(warmup.exercises[1].name, 'Running In Place');
  assert.deepStrictEqual(warmup.exercises[1].target, { kind: 'time', value: 30, perSide: false, text: '30 SEC' });
});

test('per-side targets survive the parse', () => {
  const all = program.days.flatMap((d) => d.blocks.flatMap((b) => b.exercises));
  const sidePlank = all.find((e) => e.slug === 'knee-side-plank');
  assert.ok(sidePlank, 'expected knee side plank');
  assert.strictEqual(sidePlank.target.perSide, true);
  assert.strictEqual(sidePlank.target.value, 20);
  assert.strictEqual(sidePlank.target.kind, 'time');
});

test('every exercise carries a video id and a stable slug', () => {
  const all = program.days.flatMap((d) => d.blocks.flatMap((b) => b.exercises));
  assert.strictEqual(all.length, 38);
  const missing = all.filter((e) => !e.videoId).map((e) => e.name);
  assert.deepStrictEqual(missing, [], 'exercises without a video: ' + missing.join(', '));
  assert.ok(all.every((e) => e.slug.length > 0));
  assert.ok(all.every((e) => e.sets >= 1));
});

test('the same exercise in different days shares a slug', () => {
  const d1 = program.days[0].blocks.flatMap((b) => b.exercises);
  const d3 = program.days[2].blocks.flatMap((b) => b.exercises);
  const a = d1.find((e) => e.slug === 'chair-squat');
  const b = d3.find((e) => e.slug === 'chair-squat');
  assert.ok(a && b, 'chair squat should appear in day 1 and day 3');
  assert.notStrictEqual(a.id, b.id, 'ids are per-occurrence');
  assert.strictEqual(a.videoId, b.videoId);
});

test('exercise ids are unique within a program', () => {
  const ids = program.days.flatMap((d) => d.blocks.flatMap((b) => b.exercises.map((e) => e.id)));
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('a grid with no Exercise header yields null', () => {
  const junk = [[{ v: 'hello', link: null }], [{ v: 'world', link: null }]];
  assert.strictEqual(P.gridToProgram(junk, META), null);
  assert.strictEqual(P.gridToProgram([], META), null);
});

test('exercises before any block land in a Main block', () => {
  const cell = (v, link) => ({ v: v, link: link || null });
  const blank = () => [cell(''), cell(''), cell(''), cell(''), cell(''), cell(''), cell('')];
  const grid = [
    [cell('Workout'), cell(''), cell('Exercise'), cell('Sets'), cell('Reps / Duration'), cell('Tempo'), cell('Rest')],
    [cell('DAY 9'), cell(''), cell('BURPEES'), cell('3'), cell('10'), cell(''), cell('')],
    blank()
  ];
  const p = P.gridToProgram(grid, META);
  assert.strictEqual(p.days.length, 1);
  assert.strictEqual(p.days[0].name, 'Day 9');
  assert.strictEqual(p.days[0].blocks[0].name, 'Main');
  assert.strictEqual(p.days[0].blocks[0].sets, 3);
  assert.strictEqual(p.days[0].blocks[0].exercises[0].name, 'Burpees');
});

test('exerciseCount and dayCount are precomputed on the program', () => {
  assert.strictEqual(program.exerciseCount, 38);
  assert.strictEqual(program.days.length, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
"$NODE" --test tests/parse-grid.test.js
```

Expected: FAIL — `Cannot find module '../assets/js/core/parse-grid.js'`

- [ ] **Step 3: Write minimal implementation**

Create `assets/js/core/parse-grid.js`:

```js
'use strict';
(function (root) {
  var N = (typeof module !== 'undefined' && module.exports)
    ? require('./normalize.js')
    : root.PTT.normalize;

  var COLUMNS = { day: 0, block: 1, exercise: 2, sets: 3, target: 4, tempo: 5, rest: 6, notes: 12 };

  function cellText(row, index) {
    if (!row || !row[index]) return '';
    return N.str(row[index].v);
  }

  function cellLink(row, index) {
    if (!row || !row[index]) return null;
    return row[index].link || null;
  }

  function isHeaderRow(row) {
    return cellText(row, COLUMNS.exercise).toLowerCase() === 'exercise';
  }

  function findHeaderRows(grid) {
    var out = [];
    for (var i = 0; i < grid.length; i++) if (isHeaderRow(grid[i])) out.push(i);
    return out;
  }

  function buildDay(grid, start, end, dayIndex, programId) {
    var dayName = '';
    var blocks = [];
    var current = null;
    var lastTargetText = '';
    var seq = 0;

    for (var r = start; r < end; r++) {
      var row = grid[r];
      if (!dayName) {
        var a = cellText(row, COLUMNS.day);
        if (a) dayName = N.title(a);
      }

      var exerciseName = cellText(row, COLUMNS.exercise);
      if (!exerciseName) continue;

      var blockName = cellText(row, COLUMNS.block);
      if (blockName || !current) {
        var restText = cellText(row, COLUMNS.rest);
        var setsText = cellText(row, COLUMNS.sets);
        current = {
          id: programId + '-d' + dayIndex + '-b' + blocks.length,
          name: blockName ? N.title(blockName) : 'Main',
          sets: parseInt(setsText, 10) > 0 ? parseInt(setsText, 10) : 1,
          rest: restText,
          restSeconds: N.seconds(restText),
          exercises: []
        };
        blocks.push(current);
        lastTargetText = '';
      }

      var targetText = cellText(row, COLUMNS.target);
      if (targetText) lastTargetText = targetText;

      var url = cellLink(row, COLUMNS.exercise);
      current.exercises.push({
        id: programId + '-d' + dayIndex + '-e' + (seq++),
        slug: N.slug(exerciseName),
        name: N.title(exerciseName),
        raw: exerciseName,
        sets: current.sets,
        target: N.target(lastTargetText),
        tempo: cellText(row, COLUMNS.tempo),
        rest: current.rest,
        restSeconds: current.restSeconds,
        notes: cellText(row, COLUMNS.notes),
        videoUrl: url,
        videoId: N.videoId(url)
      });
    }

    if (!blocks.length) return null;
    return {
      id: programId + '-d' + dayIndex,
      name: dayName || 'Day ' + (dayIndex + 1),
      index: dayIndex,
      blocks: blocks
    };
  }

  function gridToProgram(grid, meta) {
    if (!grid || !grid.length) return null;
    var headers = findHeaderRows(grid);
    if (!headers.length) return null;

    var programId = (meta && meta.id) || ('p' + Date.now());
    var days = [];
    for (var i = 0; i < headers.length; i++) {
      var start = headers[i] + 1;
      var end = i + 1 < headers.length ? headers[i + 1] : grid.length;
      var day = buildDay(grid, start, end, days.length, programId);
      if (day) days.push(day);
    }
    if (!days.length) return null;

    var count = 0;
    days.forEach(function (d) {
      d.blocks.forEach(function (b) { count += b.exercises.length; });
    });

    return {
      id: programId,
      name: (meta && meta.name) || 'Program',
      source: (meta && meta.source) || '',
      importedAt: (meta && meta.importedAt) || new Date().toISOString(),
      schemaVersion: 1,
      exerciseCount: count,
      days: days
    };
  }

  var api = { gridToProgram: gridToProgram, COLUMNS: COLUMNS };
  root.PTT = root.PTT || {};
  root.PTT.parse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
"$NODE" --test tests/parse-grid.test.js
```

Expected: PASS — 12 tests. If block or exercise counts differ, print the parsed structure with
`"$NODE" -e "const P=require('./assets/js/core/parse-grid.js'),f=require('./tests/fixtures/phase1-grid.js');console.dir(P.gridToProgram(f.grid,{id:'p1'}),{depth:4})"`
and fix the parser, not the expectations — the counts in the test were verified against the source workbook.

- [ ] **Step 5: Commit**

```bash
git add assets/js/core/parse-grid.js tests/parse-grid.test.js
git commit -m "feat: parse spreadsheet grid into program structure"
```

---

### Task 4: Seed data generation

Produces `data/seed-program.js` so the app opens with Phase 1 already loaded and no import step.

**Files:**
- Create: `tools/build-seed.js`
- Create: `data/seed-program.js` (generated)
- Test: `tests/seed.test.js`

**Interfaces:**
- Consumes: `PTT.sheetGrid` (Task 2), `PTT.parse` (Task 3)
- Produces: `data/seed-program.js` assigning `PTT.seed = <Program>` and, under Node, exporting the same object

- [ ] **Step 1: Write the failing test**

Create `tests/seed.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SEED_PATH = path.join(__dirname, '..', 'data', 'seed-program.js');

test('seed file exists and is a classic script', () => {
  assert.ok(fs.existsSync(SEED_PATH), 'run: "$NODE" tools/build-seed.js');
  const src = fs.readFileSync(SEED_PATH, 'utf8');
  assert.ok(!/^\s*(import|export)\s/m.test(src), 'seed must not use ES module syntax');
  assert.ok(src.includes('PTT.seed'), 'seed must assign PTT.seed');
});

test('seed contains the full parsed Phase 1 program', () => {
  const seed = require(SEED_PATH);
  assert.strictEqual(seed.days.length, 3);
  assert.strictEqual(seed.exerciseCount, 38);
  assert.strictEqual(seed.schemaVersion, 1);
  assert.ok(seed.name.toLowerCase().includes('crossfit'));
  assert.ok(seed.id, 'seed needs a stable id');
  const all = seed.days.flatMap((d) => d.blocks.flatMap((b) => b.exercises));
  assert.strictEqual(all.filter((e) => e.videoId).length, 38);
});

test('seed id is stable, not time-based', () => {
  const seed = require(SEED_PATH);
  assert.strictEqual(seed.id, 'seed-crossfit-phase-1');
});

test('seed attaches to a PTT global when evaluated as a browser script', () => {
  const src = fs.readFileSync(SEED_PATH, 'utf8');
  const sandbox = { PTT: {} };
  const fn = new Function('globalThis', 'window', 'PTT_HOST', 'with (PTT_HOST) { ' + src + ' }');
  // Evaluate with a fake global whose PTT we can inspect.
  const fakeGlobal = { PTT: {} };
  new Function('root', src.replace(/typeof globalThis[^)]*\)/, 'root'))(fakeGlobal);
  assert.ok(fakeGlobal.PTT.seed, 'PTT.seed should be assigned');
  assert.strictEqual(fakeGlobal.PTT.seed.days.length, 3);
  void sandbox; void fn;
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
"$NODE" --test tests/seed.test.js
```

Expected: FAIL — "run: `$NODE` tools/build-seed.js"

- [ ] **Step 3: Write the generator**

Create `tools/build-seed.js`:

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../assets/js/vendor/xlsx.full.min.js');
const SG = require('../assets/js/core/sheet-grid.js');
const P = require('../assets/js/core/parse-grid.js');

const src = path.join(__dirname, '..', 'data', 'source', 'crossfit-phase-1.xlsx');
const out = path.join(__dirname, '..', 'data', 'seed-program.js');

const wb = XLSX.read(fs.readFileSync(src), { type: 'buffer' });
const sheetName = wb.SheetNames[0];
const grid = SG.fromWorksheet(XLSX, wb.Sheets[sheetName]);

const program = P.gridToProgram(grid, {
  id: 'seed-crossfit-phase-1',
  name: sheetName.trim(),
  source: 'crossfit-phase-1.xlsx',
  importedAt: '2026-08-24T00:00:00.000Z'
});

if (!program) throw new Error('parser returned null for the seed workbook');

const body =
  '// Generated by tools/build-seed.js from data/source/crossfit-phase-1.xlsx\n' +
  '// Do not edit by hand.\n' +
  "'use strict';\n" +
  '(function (root) {\n' +
  '  var seed = ' + JSON.stringify(program, null, 1) + ';\n' +
  '  root.PTT = root.PTT || {};\n' +
  '  root.PTT.seed = seed;\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = seed;\n" +
  '})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';

fs.writeFileSync(out, body, 'utf8');
console.log('wrote', out, program.days.length, 'days', program.exerciseCount, 'exercises');
```

- [ ] **Step 4: Generate and run the tests**

```bash
"$NODE" tools/build-seed.js
"$NODE" --test tests/seed.test.js
```

Expected: generator prints `3 days 38 exercises`; all 4 tests PASS.

- [ ] **Step 5: Run the whole suite so far**

```bash
"$NODE" --test tests/
```

Expected: PASS — normalize, sheet-grid, parse-grid, seed.

- [ ] **Step 6: Commit**

```bash
git add tools/build-seed.js data/seed-program.js tests/seed.test.js
git commit -m "feat: generate seed program from the trainer's workbook"
```

---

### Task 5: Storage module

Owns every read and write to localStorage, plus JSON backup. Built around an injectable storage object so it is fully testable under Node.

**Files:**
- Create: `assets/js/core/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `PTT.store.create(backend) -> Store` and `PTT.store.memoryBackend() -> backend`, where `backend` implements `getItem/setItem/removeItem`. A `Store` has:
  - `getPrograms() -> Program[]`
  - `addProgram(program) -> Program` — appends and makes active
  - `deleteProgram(id) -> void` — sessions are kept
  - `getActiveProgram() -> Program|null`
  - `setActiveProgram(id) -> void`
  - `getSessions() -> Session[]`
  - `saveSession(session) -> Session` — upsert by id
  - `getDraft() -> Session|null`
  - `setDraft(session) -> void`
  - `clearDraft() -> void`
  - `finishDraft(completedAt) -> Session|null` — promotes draft into sessions
  - `exportAll() -> {schemaVersion, exportedAt, programs, sessions, settings}`
  - `importAll(payload) -> {programs:number, sessions:number}` — merges by id
  - `isHealthy() -> boolean`
  - `seedIfEmpty(program) -> boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/store.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../assets/js/core/store.js');

function makeProgram(id, name) {
  return {
    id: id, name: name, source: 's.xlsx', importedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1, exerciseCount: 1,
    days: [{ id: id + '-d0', name: 'Day 1', index: 0, blocks: [{
      id: id + '-d0-b0', name: 'Main', sets: 3, rest: '30 SEC', restSeconds: 30,
      exercises: [{ id: id + '-d0-e0', slug: 'squat', name: 'Squat', raw: 'SQUAT', sets: 3,
        target: { kind: 'reps', value: 12, perSide: false, text: '12' },
        tempo: '', rest: '30 SEC', restSeconds: 30, notes: '', videoUrl: null, videoId: 'abc' }]
    }] }]
  };
}

function makeSession(id, programId, startedAt) {
  return {
    id: id, programId: programId, dayId: programId + '-d0',
    startedAt: startedAt, completedAt: startedAt,
    entries: [{ exerciseId: programId + '-d0-e0', slug: 'squat', name: 'Squat',
      sets: [{ index: 0, done: true, reps: 12, seconds: null, note: '' }] }]
  };
}

test('starts empty and reports healthy', () => {
  const store = S.create(S.memoryBackend());
  assert.deepStrictEqual(store.getPrograms(), []);
  assert.deepStrictEqual(store.getSessions(), []);
  assert.strictEqual(store.getActiveProgram(), null);
  assert.strictEqual(store.isHealthy(), true);
});

test('adding a program makes it active', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  assert.strictEqual(store.getActiveProgram().id, 'p1');
  store.addProgram(makeProgram('p2', 'Phase 2'));
  assert.strictEqual(store.getActiveProgram().id, 'p2');
  assert.strictEqual(store.getPrograms().length, 2);
});

test('adding never overwrites existing programs or sessions', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  store.saveSession(makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z'));
  store.addProgram(makeProgram('p2', 'Phase 2'));
  assert.strictEqual(store.getPrograms().length, 2);
  assert.strictEqual(store.getSessions().length, 1);
});

test('deleting a program keeps its sessions and reassigns active', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  store.saveSession(makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z'));
  store.addProgram(makeProgram('p2', 'Phase 2'));
  store.deleteProgram('p2');
  assert.strictEqual(store.getPrograms().length, 1);
  assert.strictEqual(store.getActiveProgram().id, 'p1');
  assert.strictEqual(store.getSessions().length, 1);
});

test('deleting the last program leaves no active program', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  store.deleteProgram('p1');
  assert.strictEqual(store.getActiveProgram(), null);
});

test('saveSession upserts by id', () => {
  const store = S.create(S.memoryBackend());
  const s = makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z');
  store.saveSession(s);
  s.completedAt = '2026-01-02T11:00:00.000Z';
  store.saveSession(s);
  assert.strictEqual(store.getSessions().length, 1);
  assert.strictEqual(store.getSessions()[0].completedAt, '2026-01-02T11:00:00.000Z');
});

test('draft survives a reload and is promoted on finish', () => {
  const backend = S.memoryBackend();
  const store = S.create(backend);
  const draft = makeSession('d1', 'p1', '2026-01-02T10:00:00.000Z');
  draft.completedAt = null;
  store.setDraft(draft);

  const reloaded = S.create(backend);
  assert.strictEqual(reloaded.getDraft().id, 'd1');

  const finished = reloaded.finishDraft('2026-01-02T10:45:00.000Z');
  assert.strictEqual(finished.completedAt, '2026-01-02T10:45:00.000Z');
  assert.strictEqual(reloaded.getDraft(), null);
  assert.strictEqual(reloaded.getSessions().length, 1);
});

test('finishDraft with no draft returns null', () => {
  const store = S.create(S.memoryBackend());
  assert.strictEqual(store.finishDraft('2026-01-02T10:45:00.000Z'), null);
});

test('export then import round-trips through a fresh store', () => {
  const a = S.create(S.memoryBackend());
  a.addProgram(makeProgram('p1', 'Phase 1'));
  a.saveSession(makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z'));
  const payload = a.exportAll();

  const b = S.create(S.memoryBackend());
  const counts = b.importAll(payload);
  assert.deepStrictEqual(counts, { programs: 1, sessions: 1 });
  assert.strictEqual(b.getPrograms()[0].id, 'p1');
  assert.strictEqual(b.getSessions()[0].id, 's1');
  assert.strictEqual(b.getActiveProgram().id, 'p1');
});

test('import merges by id without duplicating', () => {
  const store = S.create(S.memoryBackend());
  store.addProgram(makeProgram('p1', 'Phase 1'));
  store.saveSession(makeSession('s1', 'p1', '2026-01-02T10:00:00.000Z'));
  const payload = store.exportAll();
  const counts = store.importAll(payload);
  assert.deepStrictEqual(counts, { programs: 0, sessions: 0 });
  assert.strictEqual(store.getPrograms().length, 1);
  assert.strictEqual(store.getSessions().length, 1);
});

test('import rejects a payload that is not an export', () => {
  const store = S.create(S.memoryBackend());
  assert.throws(() => store.importAll({ nonsense: true }), /not a valid backup/i);
  assert.throws(() => store.importAll(null), /not a valid backup/i);
});

test('corrupt stored data recovers instead of throwing', () => {
  const backend = S.memoryBackend();
  backend.setItem('ptt.v1.programs', '{not json');
  const store = S.create(backend);
  assert.deepStrictEqual(store.getPrograms(), []);
  assert.strictEqual(backend.getItem('ptt.v1.corrupt.programs'), '{not json');
});

test('a failing backend degrades to in-memory and reports unhealthy', () => {
  const failing = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {}
  };
  const store = S.create(failing);
  store.addProgram(makeProgram('p1', 'Phase 1'));
  assert.strictEqual(store.isHealthy(), false);
  assert.strictEqual(store.getPrograms().length, 1, 'still usable in memory');
});

test('seedIfEmpty only seeds once', () => {
  const store = S.create(S.memoryBackend());
  assert.strictEqual(store.seedIfEmpty(makeProgram('seed', 'Seed')), true);
  assert.strictEqual(store.seedIfEmpty(makeProgram('seed', 'Seed')), false);
  assert.strictEqual(store.getPrograms().length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
"$NODE" --test tests/store.test.js
```

Expected: FAIL — `Cannot find module '../assets/js/core/store.js'`

- [ ] **Step 3: Write minimal implementation**

Create `assets/js/core/store.js`:

```js
'use strict';
(function (root) {
  var PREFIX = 'ptt.v1.';
  var KEYS = { programs: PREFIX + 'programs', sessions: PREFIX + 'sessions',
               settings: PREFIX + 'settings', draft: PREFIX + 'draft' };

  function memoryBackend() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; }
    };
  }

  function create(backend) {
    var healthy = true;
    var cache = {};

    function readRaw(key) {
      try { return backend.getItem(key); } catch (e) { healthy = false; return null; }
    }

    function writeRaw(key, value) {
      try {
        if (value === null) backend.removeItem(key); else backend.setItem(key, value);
      } catch (e) { healthy = false; }
    }

    function read(key, fallback) {
      if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
      var raw = readRaw(key);
      var value = fallback;
      if (raw !== null && raw !== undefined) {
        try {
          value = JSON.parse(raw);
        } catch (e) {
          // Preserve the unreadable blob so the user can recover it by hand.
          writeRaw(key.replace(PREFIX, PREFIX + 'corrupt.'), raw);
          writeRaw(key, null);
          value = fallback;
        }
      }
      cache[key] = value;
      return value;
    }

    function write(key, value) {
      cache[key] = value;
      writeRaw(key, JSON.stringify(value));
    }

    function settings() { return read(KEYS.settings, { activeProgramId: null }); }
    function programs() { return read(KEYS.programs, []); }
    function sessions() { return read(KEYS.sessions, []); }

    function setActiveProgram(id) {
      var s = settings();
      s.activeProgramId = id;
      write(KEYS.settings, s);
    }

    function addProgram(program) {
      var list = programs().slice();
      list.push(program);
      write(KEYS.programs, list);
      setActiveProgram(program.id);
      return program;
    }

    function deleteProgram(id) {
      var list = programs().filter(function (p) { return p.id !== id; });
      write(KEYS.programs, list);
      if (settings().activeProgramId === id) {
        setActiveProgram(list.length ? list[list.length - 1].id : null);
      }
    }

    function getActiveProgram() {
      var list = programs();
      var id = settings().activeProgramId;
      var found = null;
      list.forEach(function (p) { if (p.id === id) found = p; });
      if (found) return found;
      return list.length ? list[list.length - 1] : null;
    }

    function saveSession(session) {
      var list = sessions().slice();
      var replaced = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === session.id) { list[i] = session; replaced = true; break; }
      }
      if (!replaced) list.push(session);
      write(KEYS.sessions, list);
      return session;
    }

    function getDraft() { return read(KEYS.draft, null); }

    function setDraft(session) { write(KEYS.draft, session); }

    function clearDraft() {
      cache[KEYS.draft] = null;
      writeRaw(KEYS.draft, null);
    }

    function finishDraft(completedAt) {
      var draft = getDraft();
      if (!draft) return null;
      draft.completedAt = completedAt;
      saveSession(draft);
      clearDraft();
      return draft;
    }

    function exportAll() {
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        programs: programs(),
        sessions: sessions(),
        settings: settings()
      };
    }

    function importAll(payload) {
      if (!payload || !Array.isArray(payload.programs) || !Array.isArray(payload.sessions)) {
        throw new Error('That file is not a valid backup.');
      }
      var existingPrograms = programs().slice();
      var programIds = {};
      existingPrograms.forEach(function (p) { programIds[p.id] = true; });
      var addedPrograms = 0;
      payload.programs.forEach(function (p) {
        if (!programIds[p.id]) { existingPrograms.push(p); programIds[p.id] = true; addedPrograms++; }
      });

      var existingSessions = sessions().slice();
      var sessionIds = {};
      existingSessions.forEach(function (s) { sessionIds[s.id] = true; });
      var addedSessions = 0;
      payload.sessions.forEach(function (s) {
        if (!sessionIds[s.id]) { existingSessions.push(s); sessionIds[s.id] = true; addedSessions++; }
      });

      write(KEYS.programs, existingPrograms);
      write(KEYS.sessions, existingSessions);
      if (!settings().activeProgramId && existingPrograms.length) {
        setActiveProgram(existingPrograms[existingPrograms.length - 1].id);
      }
      return { programs: addedPrograms, sessions: addedSessions };
    }

    function seedIfEmpty(program) {
      if (programs().length) return false;
      addProgram(program);
      return true;
    }

    return {
      getPrograms: programs, addProgram: addProgram, deleteProgram: deleteProgram,
      getActiveProgram: getActiveProgram, setActiveProgram: setActiveProgram,
      getSessions: sessions, saveSession: saveSession,
      getDraft: getDraft, setDraft: setDraft, clearDraft: clearDraft, finishDraft: finishDraft,
      exportAll: exportAll, importAll: importAll, seedIfEmpty: seedIfEmpty,
      isHealthy: function () { return healthy; },
      KEYS: KEYS
    };
  }

  function browserBackend() {
    try {
      var probe = PREFIX + 'probe';
      root.localStorage.setItem(probe, '1');
      root.localStorage.removeItem(probe);
      return root.localStorage;
    } catch (e) {
      return memoryBackend();
    }
  }

  var api = { create: create, memoryBackend: memoryBackend, browserBackend: browserBackend, KEYS: KEYS };
  root.PTT = root.PTT || {};
  root.PTT.store = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
"$NODE" --test tests/store.test.js
```

Expected: PASS — 14 tests.

- [ ] **Step 5: Commit**

```bash
git add assets/js/core/store.js tests/store.test.js
git commit -m "feat: add storage module with backup and draft handling"
```

---

### Task 6: Progress module

Derives every number the Week and Progress screens display. Pure functions over a session list; all dates handled in local time so "today" means the user's today.

**Files:**
- Create: `assets/js/core/progress.js`
- Test: `tests/progress.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PTT.progress.dayKey(dateish) -> 'YYYY-MM-DD'` (local time)
  - `PTT.progress.weekKey(dateish) -> 'YYYY-Www'` (ISO week, Monday start)
  - `PTT.progress.summary(sessions, program, now) -> {totalSessions, streakWeeks, longestStreakWeeks, weekCompleted, weekTarget, lastSessionAt, daysSince}`
  - `PTT.progress.heatmap(sessions, days, endDate) -> [{date, count}]` — oldest first, length `days`
  - `PTT.progress.dayCompletion(sessions, program) -> {[dayId]: {count, lastAt}}`
  - `PTT.progress.exerciseHistory(sessions, slug) -> [{date, kind, best, total, sets}]` — oldest first
  - `PTT.progress.lastPerformance(sessions, slug) -> {date, sets}|null`
  - `PTT.progress.estimateSeconds(day) -> number`

Only sessions with a non-null `completedAt` count toward progress. A session's date is its `completedAt`.

- [ ] **Step 1: Write the failing test**

Create `tests/progress.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../assets/js/core/progress.js');

const PROGRAM = {
  id: 'p1', name: 'Phase 1',
  days: [
    { id: 'd0', name: 'Day 1', index: 0, blocks: [{ id: 'b0', name: 'Circuit 1', sets: 4, restSeconds: 30,
      exercises: [
        { id: 'e0', slug: 'chair-squat', name: 'Chair Squat', sets: 4, target: { kind: 'reps', value: 12, perSide: false, text: '12' } },
        { id: 'e1', slug: 'wall-sit', name: 'Wall Sit', sets: 4, target: { kind: 'time', value: 30, perSide: false, text: '30 SEC' } }
      ] }] },
    { id: 'd1', name: 'Day 2', index: 1, blocks: [] },
    { id: 'd2', name: 'Day 3', index: 2, blocks: [] }
  ]
};

function session(id, dayId, completedAt, entries) {
  return { id, programId: 'p1', dayId, startedAt: completedAt, completedAt, entries: entries || [] };
}

function reps(slug, values) {
  return { exerciseId: 'e', slug, name: slug,
    sets: values.map((v, i) => ({ index: i, done: true, reps: v, seconds: null, note: '' })) };
}

function holds(slug, values) {
  return { exerciseId: 'e', slug, name: slug,
    sets: values.map((v, i) => ({ index: i, done: true, reps: null, seconds: v, note: '' })) };
}

test('dayKey and weekKey use local time', () => {
  assert.strictEqual(G.dayKey('2026-08-24T10:30:00'), '2026-08-24');
  assert.strictEqual(G.weekKey('2026-08-24T10:30:00'), '2026-W35'); // Monday
  assert.strictEqual(G.weekKey('2026-08-30T23:00:00'), '2026-W35'); // Sunday, same week
  assert.strictEqual(G.weekKey('2026-08-31T00:30:00'), '2026-W36'); // next Monday
});

test('summary counts only completed sessions', () => {
  const sessions = [
    session('s1', 'd0', '2026-08-24T10:00:00'),
    { id: 's2', programId: 'p1', dayId: 'd1', startedAt: '2026-08-25T10:00:00', completedAt: null, entries: [] }
  ];
  const s = G.summary(sessions, PROGRAM, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s.totalSessions, 1);
  assert.strictEqual(s.weekCompleted, 1);
  assert.strictEqual(s.weekTarget, 3);
});

test('streak counts consecutive weeks with at least one session', () => {
  const sessions = [
    session('a', 'd0', '2026-08-10T10:00:00'), // W33
    session('b', 'd0', '2026-08-17T10:00:00'), // W34
    session('c', 'd0', '2026-08-24T10:00:00')  // W35, current
  ];
  const s = G.summary(sessions, PROGRAM, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s.streakWeeks, 3);
  assert.strictEqual(s.longestStreakWeeks, 3);
});

test('the current week never breaks the streak before it is over', () => {
  const sessions = [
    session('a', 'd0', '2026-08-10T10:00:00'), // W33
    session('b', 'd0', '2026-08-17T10:00:00')  // W34
  ];
  // Now is Tuesday of W35 with nothing logged yet: streak holds at 2.
  const s = G.summary(sessions, PROGRAM, new Date('2026-08-25T12:00:00'));
  assert.strictEqual(s.streakWeeks, 2);
});

test('a fully skipped week breaks the streak', () => {
  const sessions = [
    session('a', 'd0', '2026-08-03T10:00:00'), // W32
    session('b', 'd0', '2026-08-24T10:00:00')  // W35, gap at W33/W34
  ];
  const s = G.summary(sessions, PROGRAM, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s.streakWeeks, 1);
  assert.strictEqual(s.longestStreakWeeks, 1);
});

test('empty history is safe', () => {
  const s = G.summary([], PROGRAM, new Date('2026-08-26T12:00:00'));
  assert.deepStrictEqual(
    { t: s.totalSessions, st: s.streakWeeks, w: s.weekCompleted, last: s.lastSessionAt, d: s.daysSince },
    { t: 0, st: 0, w: 0, last: null, d: null }
  );
});

test('daysSince reflects the most recent completed session', () => {
  const sessions = [session('a', 'd0', '2026-08-24T10:00:00')];
  const s = G.summary(sessions, PROGRAM, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(s.daysSince, 2);
});

test('heatmap returns one bucket per day, oldest first', () => {
  const sessions = [
    session('a', 'd0', '2026-08-24T10:00:00'),
    session('b', 'd1', '2026-08-24T18:00:00'),
    session('c', 'd2', '2026-08-26T10:00:00')
  ];
  const cells = G.heatmap(sessions, 7, new Date('2026-08-26T12:00:00'));
  assert.strictEqual(cells.length, 7);
  assert.strictEqual(cells[0].date, '2026-08-20');
  assert.strictEqual(cells[6].date, '2026-08-26');
  assert.strictEqual(cells.find((c) => c.date === '2026-08-24').count, 2);
  assert.strictEqual(cells.find((c) => c.date === '2026-08-26').count, 1);
  assert.strictEqual(cells.find((c) => c.date === '2026-08-25').count, 0);
});

test('dayCompletion reports counts per program day', () => {
  const sessions = [
    session('a', 'd0', '2026-08-24T10:00:00'),
    session('b', 'd0', '2026-08-17T10:00:00'),
    session('c', 'd1', '2026-08-25T10:00:00')
  ];
  const map = G.dayCompletion(sessions, PROGRAM);
  assert.strictEqual(map.d0.count, 2);
  assert.strictEqual(map.d0.lastAt, '2026-08-24T10:00:00');
  assert.strictEqual(map.d1.count, 1);
  assert.strictEqual(map.d2.count, 0);
  assert.strictEqual(map.d2.lastAt, null);
});

test('exerciseHistory tracks best and total per session, oldest first', () => {
  const sessions = [
    session('b', 'd0', '2026-08-24T10:00:00', [holds('wall-sit', [30, 35, 40])]),
    session('a', 'd0', '2026-08-17T10:00:00', [holds('wall-sit', [20, 20, 25])])
  ];
  const h = G.exerciseHistory(sessions, 'wall-sit');
  assert.strictEqual(h.length, 2);
  assert.strictEqual(h[0].date, '2026-08-17');
  assert.strictEqual(h[0].best, 25);
  assert.strictEqual(h[0].total, 65);
  assert.strictEqual(h[0].kind, 'time');
  assert.strictEqual(h[1].best, 40);
  assert.strictEqual(h[1].total, 105);
});

test('exerciseHistory ignores sets that were not done', () => {
  const entry = reps('chair-squat', [12, 12]);
  entry.sets.push({ index: 2, done: false, reps: null, seconds: null, note: '' });
  const h = G.exerciseHistory([session('a', 'd0', '2026-08-24T10:00:00', [entry])], 'chair-squat');
  assert.strictEqual(h[0].sets, 2);
  assert.strictEqual(h[0].total, 24);
  assert.strictEqual(h[0].kind, 'reps');
});

test('exerciseHistory for an unknown slug is empty', () => {
  assert.deepStrictEqual(G.exerciseHistory([], 'nope'), []);
});

test('lastPerformance returns the most recent completed sets', () => {
  const sessions = [
    session('a', 'd0', '2026-08-17T10:00:00', [reps('chair-squat', [10, 10, 10])]),
    session('b', 'd0', '2026-08-24T10:00:00', [reps('chair-squat', [12, 12, 11])])
  ];
  const last = G.lastPerformance(sessions, 'chair-squat');
  assert.strictEqual(last.date, '2026-08-24');
  assert.deepStrictEqual(last.sets.map((s) => s.reps), [12, 12, 11]);
  assert.strictEqual(G.lastPerformance(sessions, 'wall-sit'), null);
});

test('estimateSeconds sums work and rest across a day', () => {
  // Block: 4 sets x (12 reps x 3s + 30s hold) + 4 x 30s rest
  const seconds = G.estimateSeconds(PROGRAM.days[0]);
  assert.strictEqual(seconds, 4 * (36 + 30) + 4 * 30);
  assert.strictEqual(G.estimateSeconds(PROGRAM.days[1]), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
"$NODE" --test tests/progress.test.js
```

Expected: FAIL — `Cannot find module '../assets/js/core/progress.js'`

- [ ] **Step 3: Write minimal implementation**

Create `assets/js/core/progress.js`:

```js
'use strict';
(function (root) {
  var SECONDS_PER_REP = 3;
  var DAY_MS = 86400000;

  function toDate(v) { return v instanceof Date ? v : new Date(v); }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function dayKey(v) {
    var d = toDate(v);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // ISO-8601 week: Monday starts the week; week 1 contains the first Thursday.
  function weekKey(v) {
    var d = toDate(v);
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (t.getDay() + 6) % 7;           // Monday = 0
    t.setDate(t.getDate() - dow + 3);         // move to Thursday of this week
    var isoYear = t.getFullYear();
    var firstThursday = new Date(isoYear, 0, 4);
    var firstDow = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstDow + 3);
    var week = 1 + Math.round((t - firstThursday) / (7 * DAY_MS));
    return isoYear + '-W' + pad(week);
  }

  function weekStart(v) {
    var d = toDate(v);
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return t;
  }

  function completed(sessions) {
    return (sessions || []).filter(function (s) { return s && s.completedAt; });
  }

  function byDateAsc(a, b) { return new Date(a.completedAt) - new Date(b.completedAt); }

  function summary(sessions, program, now) {
    var reference = now ? toDate(now) : new Date();
    var done = completed(sessions).slice().sort(byDateAsc);
    var weekTarget = program && program.days ? program.days.length : 0;

    if (!done.length) {
      return { totalSessions: 0, streakWeeks: 0, longestStreakWeeks: 0,
               weekCompleted: 0, weekTarget: weekTarget, lastSessionAt: null, daysSince: null };
    }

    var weeks = {};
    done.forEach(function (s) { weeks[weekKey(s.completedAt)] = true; });

    var currentWeek = weekStart(reference);
    var streak = 0;
    var cursor = new Date(currentWeek);
    // The in-progress week only extends the streak; it never breaks it.
    if (!weeks[weekKey(cursor)]) cursor.setDate(cursor.getDate() - 7);
    while (weeks[weekKey(cursor)]) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
    }

    var sortedWeeks = Object.keys(weeks).sort();
    var longest = 0;
    var run = 0;
    var prev = null;
    sortedWeeks.forEach(function (key) {
      if (prev === null) { run = 1; } else {
        var expected = new Date(prev.getTime());
        expected.setDate(expected.getDate() + 7);
        run = weekKey(expected) === key ? run + 1 : 1;
      }
      prev = weekStart(firstDateOfWeek(key));
      if (run > longest) longest = run;
    });

    var thisWeekKey = weekKey(reference);
    var weekCompleted = done.filter(function (s) { return weekKey(s.completedAt) === thisWeekKey; }).length;
    var last = done[done.length - 1].completedAt;
    var daysSince = Math.floor(
      (new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()) -
       new Date(dayKey(last) + 'T00:00:00')) / DAY_MS
    );

    return {
      totalSessions: done.length,
      streakWeeks: streak,
      longestStreakWeeks: Math.max(longest, streak),
      weekCompleted: weekCompleted,
      weekTarget: weekTarget,
      lastSessionAt: last,
      daysSince: daysSince
    };
  }

  // '2026-W35' -> a Date inside that week, used only for streak arithmetic.
  function firstDateOfWeek(key) {
    var parts = key.split('-W');
    var year = parseInt(parts[0], 10);
    var week = parseInt(parts[1], 10);
    var jan4 = new Date(year, 0, 4);
    var start = weekStart(jan4);
    start.setDate(start.getDate() + (week - 1) * 7);
    return start;
  }

  function heatmap(sessions, days, endDate) {
    var end = endDate ? toDate(endDate) : new Date();
    var counts = {};
    completed(sessions).forEach(function (s) {
      var k = dayKey(s.completedAt);
      counts[k] = (counts[k] || 0) + 1;
    });
    var cells = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      d.setDate(d.getDate() - i);
      var key = dayKey(d);
      cells.push({ date: key, count: counts[key] || 0 });
    }
    return cells;
  }

  function dayCompletion(sessions, program) {
    var map = {};
    ((program && program.days) || []).forEach(function (d) { map[d.id] = { count: 0, lastAt: null }; });
    completed(sessions).slice().sort(byDateAsc).forEach(function (s) {
      if (!map[s.dayId]) map[s.dayId] = { count: 0, lastAt: null };
      map[s.dayId].count++;
      map[s.dayId].lastAt = s.completedAt;
    });
    return map;
  }

  function exerciseHistory(sessions, slug) {
    var out = [];
    completed(sessions).slice().sort(byDateAsc).forEach(function (s) {
      (s.entries || []).forEach(function (entry) {
        if (entry.slug !== slug) return;
        var doneSets = (entry.sets || []).filter(function (set) { return set.done; });
        if (!doneSets.length) return;
        var isTime = doneSets.some(function (set) { return set.seconds !== null && set.seconds !== undefined; });
        var values = doneSets.map(function (set) {
          var v = isTime ? set.seconds : set.reps;
          return typeof v === 'number' ? v : 0;
        });
        out.push({
          date: dayKey(s.completedAt),
          kind: isTime ? 'time' : 'reps',
          best: Math.max.apply(null, values),
          total: values.reduce(function (a, b) { return a + b; }, 0),
          sets: doneSets.length
        });
      });
    });
    return out;
  }

  function lastPerformance(sessions, slug) {
    var found = null;
    completed(sessions).slice().sort(byDateAsc).forEach(function (s) {
      (s.entries || []).forEach(function (entry) {
        if (entry.slug !== slug) return;
        var doneSets = (entry.sets || []).filter(function (set) { return set.done; });
        if (doneSets.length) found = { date: dayKey(s.completedAt), sets: doneSets };
      });
    });
    return found;
  }

  function estimateSeconds(day) {
    var total = 0;
    ((day && day.blocks) || []).forEach(function (block) {
      var perRound = 0;
      block.exercises.forEach(function (ex) {
        var t = ex.target || {};
        var one = t.kind === 'time'
          ? (t.value || 0) * (t.perSide ? 2 : 1)
          : (t.value || 0) * SECONDS_PER_REP * (t.perSide ? 2 : 1);
        perRound += one;
      });
      var sets = block.sets || 1;
      total += sets * perRound + sets * (block.restSeconds || 0);
    });
    return total;
  }

  var api = { dayKey: dayKey, weekKey: weekKey, summary: summary, heatmap: heatmap,
              dayCompletion: dayCompletion, exerciseHistory: exerciseHistory,
              lastPerformance: lastPerformance, estimateSeconds: estimateSeconds };
  root.PTT = root.PTT || {};
  root.PTT.progress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
"$NODE" --test tests/progress.test.js
```

Expected: PASS — 14 tests. The `2026-W35` expectations were computed for Monday 2026-08-24; if they fail, verify with
`"$NODE" -e "const G=require('./assets/js/core/progress.js');console.log(G.weekKey('2026-08-24T10:00:00'))"`
and correct the implementation's ISO-week arithmetic rather than loosening the test.

- [ ] **Step 5: Run the full suite**

```bash
"$NODE" --test tests/
```

Expected: PASS — all five core suites.

- [ ] **Step 6: Commit**

```bash
git add assets/js/core/progress.js tests/progress.test.js
git commit -m "feat: add progress module for streaks, heatmap and exercise history"
```

---

### Task 7: App shell, styling, router and Week screen

First runnable milestone. After this task, opening `index.html` shows the real Phase 1 program.

**Files:**
- Create: `index.html`
- Create: `assets/css/app.css`
- Create: `assets/js/ui/components.js`
- Create: `assets/js/ui/router.js`
- Create: `assets/js/ui/view-week.js`
- Create: `assets/js/app.js`

**Interfaces:**
- Consumes: `PTT.normalize`, `PTT.parse`, `PTT.store`, `PTT.progress`, `PTT.seed`
- Produces:
  - `PTT.ui.el(tag, attrs, children) -> HTMLElement` — `attrs.class`, `attrs.text`, `attrs.html`, `on*` handlers
  - `PTT.ui.clear(node) -> void`
  - `PTT.ui.fmtDuration(seconds) -> string` — `'25 min'`, `'1h 05m'`
  - `PTT.ui.fmtTarget(target) -> string` — `'12 reps'`, `'30s'`, `'20s each side'`
  - `PTT.ui.video(videoId, opts) -> HTMLElement` — thumbnail facade, swaps to iframe on click
  - `PTT.ui.banner(message, tone) -> HTMLElement`
  - `PTT.router.register(pattern, handler)`, `PTT.router.start()`, `PTT.router.go(hash)`
  - `PTT.views.week.render(context) -> HTMLElement`
  - `PTT.app.context() -> {store, program, sessions}`

Route patterns use `:name` placeholders: `#/day/:dayId` matches `#/day/p1-d0` and yields `{dayId:'p1-d0'}`.

- [ ] **Step 1: Write `index.html`**

Script order matters — `normalize` before `parse`, all core before `ui`, `app.js` last.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d1117">
<title>Training Tracker</title>
<link rel="stylesheet" href="assets/css/app.css">
</head>
<body>
<div id="app" class="app"><p class="loading">Loading…</p></div>
<nav class="tabbar" id="tabbar">
  <a href="#/week" data-tab="week"><span class="tab-icon">▦</span>Week</a>
  <a href="#/progress" data-tab="progress"><span class="tab-icon">▲</span>Progress</a>
  <a href="#/programs" data-tab="programs"><span class="tab-icon">⇪</span>Plans</a>
</nav>

<script src="assets/js/vendor/xlsx.full.min.js"></script>
<script src="assets/js/core/normalize.js"></script>
<script src="assets/js/core/sheet-grid.js"></script>
<script src="assets/js/core/parse-grid.js"></script>
<script src="assets/js/core/store.js"></script>
<script src="assets/js/core/progress.js"></script>
<script src="data/seed-program.js"></script>
<script src="assets/js/ui/components.js"></script>
<script src="assets/js/ui/router.js"></script>
<script src="assets/js/ui/view-week.js"></script>
<script src="assets/js/ui/view-day.js"></script>
<script src="assets/js/ui/view-session.js"></script>
<script src="assets/js/ui/view-progress.js"></script>
<script src="assets/js/ui/view-programs.js"></script>
<script src="assets/js/app.js"></script>
</body>
</html>
```

Views for later tasks are already referenced. Create each `assets/js/ui/view-*.js` now as a stub so the page does not 404:

```js
'use strict';
(function (root) {
  root.PTT = root.PTT || {};
  root.PTT.views = root.PTT.views || {};
  root.PTT.views.NAME = {
    render: function () {
      return root.PTT.ui.el('p', { class: 'empty', text: 'Not built yet.' });
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Replace `NAME` with `day`, `session`, `progress`, `programs` respectively.

- [ ] **Step 2: Write `assets/js/ui/components.js`**

```js
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
      else if (key === 'html') node.innerHTML = value;
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
```

- [ ] **Step 3: Write `assets/js/ui/router.js`**

```js
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
```

- [ ] **Step 4: Write `assets/js/ui/view-week.js`**

```js
'use strict';
(function (root) {
  var UI = root.PTT.ui;
  var G = root.PTT.progress;

  function dayCard(day, completion, hasDraft) {
    var el = UI.el;
    var exercises = day.blocks.reduce(function (n, b) { return n + b.exercises.length; }, 0);
    var blockNames = day.blocks.map(function (b) { return b.name; }).join(' · ');
    var estimate = G.estimateSeconds(day);

    return el('article', { class: 'card day-card' + (completion.count ? ' is-done' : '') }, [
      el('a', { class: 'day-card-main', href: '#/day/' + day.id }, [
        el('div', { class: 'day-card-title' }, [
          el('h3', { text: day.name }),
          completion.count
            ? el('span', { class: 'pill pill--done', text: '✓ ' + completion.count + '×' })
            : el('span', { class: 'pill', text: 'Not yet' })
        ]),
        el('p', { class: 'day-card-blocks', text: blockNames }),
        el('p', { class: 'day-card-meta',
                  text: exercises + ' exercises · ~' + UI.fmtDuration(estimate) })
      ]),
      el('a', {
        class: 'btn btn--primary day-card-start',
        href: '#/session/' + day.id,
        text: hasDraft ? 'Resume' : 'Start'
      })
    ]);
  }

  function render(ctx) {
    var el = UI.el;
    var program = ctx.program;
    if (!program) {
      return el('div', { class: 'view' }, [
        el('h1', { text: 'No plan loaded' }),
        el('p', { class: 'empty', text: 'Upload your trainer\u2019s spreadsheet to get started.' }),
        el('a', { class: 'btn btn--primary', href: '#/programs', text: 'Add a plan' })
      ]);
    }

    var summary = G.summary(ctx.sessions, program, new Date());
    var completion = G.dayCompletion(ctx.sessions, program);
    var draft = ctx.store.getDraft();
    var cells = G.heatmap(ctx.sessions, 7, new Date());

    return el('div', { class: 'view' }, [
      el('header', { class: 'view-head' }, [
        el('p', { class: 'eyebrow', text: program.name }),
        el('h1', { text: 'This week' })
      ]),

      el('div', { class: 'stat-row' }, [
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value', text: summary.weekCompleted + '/' + summary.weekTarget }),
          el('span', { class: 'stat-label', text: 'sessions' })
        ]),
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value', text: String(summary.streakWeeks) }),
          el('span', { class: 'stat-label', text: summary.streakWeeks === 1 ? 'week streak' : 'weeks streak' })
        ]),
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value',
                       text: summary.daysSince === null ? '—'
                           : summary.daysSince === 0 ? 'Today' : summary.daysSince + 'd' }),
          el('span', { class: 'stat-label', text: 'since last' })
        ])
      ]),

      el('div', { class: 'weekstrip' }, cells.map(function (cell) {
        var d = new Date(cell.date + 'T00:00:00');
        return el('div', { class: 'weekstrip-day' + (cell.count ? ' is-on' : '') }, [
          el('span', { class: 'weekstrip-dow', text: 'MTWTFSS'.charAt((d.getDay() + 6) % 7) }),
          el('span', { class: 'weekstrip-dot' })
        ]);
      })),

      draft ? el('a', { class: 'banner banner--warn banner--link',
                        href: '#/session/' + draft.dayId,
                        text: 'You have a workout in progress — tap to resume' }) : null,

      el('div', { class: 'cards' }, program.days.map(function (day) {
        return dayCard(day, completion[day.id] || { count: 0, lastAt: null },
                       !!draft && draft.dayId === day.id);
      }))
    ]);
  }

  root.PTT.views = root.PTT.views || {};
  root.PTT.views.week = { render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 5: Write `assets/js/app.js`**

```js
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
```

- [ ] **Step 6: Write `assets/css/app.css`**

```css
:root {
  --bg: #0d1117;
  --surface: #161b22;
  --surface-2: #1c2430;
  --line: #262d38;
  --text: #e6edf3;
  --muted: #8b949e;
  --accent: #4ec9a5;
  --accent-ink: #06231b;
  --warn: #e3b341;
  --danger: #f85149;
  --radius: 14px;
  --pad: 16px;
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
}

.app { max-width: 720px; margin: 0 auto; padding: var(--pad); }
.view { display: flex; flex-direction: column; gap: 20px; }
.view-head h1 { margin: 4px 0 0; font-size: 28px; letter-spacing: -0.02em; }
.eyebrow { margin: 0; color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }
h2 { font-size: 18px; margin: 0; }
h3 { font-size: 17px; margin: 0; }
.loading, .empty { color: var(--muted); }

/* buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 48px; padding: 0 20px; border: 1px solid var(--line);
  border-radius: 999px; background: var(--surface-2); color: var(--text);
  font-size: 16px; font-weight: 600; text-decoration: none; cursor: pointer;
}
.btn--primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
.btn--ghost { background: transparent; }
.btn--danger { color: var(--danger); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn--block { width: 100%; }

/* cards */
.cards { display: flex; flex-direction: column; gap: 12px; }
.card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); overflow: hidden;
}
.day-card { display: flex; align-items: stretch; gap: 12px; padding: 14px; }
.day-card-main { flex: 1; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 6px; }
.day-card-title { display: flex; align-items: center; gap: 10px; }
.day-card-blocks, .day-card-meta { margin: 0; color: var(--muted); font-size: 13px; }
.day-card-start { align-self: center; }
.day-card.is-done { border-color: rgba(78, 201, 165, 0.4); }

.pill {
  font-size: 12px; padding: 3px 10px; border-radius: 999px;
  background: var(--surface-2); color: var(--muted); white-space: nowrap;
}
.pill--done { background: rgba(78, 201, 165, 0.15); color: var(--accent); }

/* stats */
.stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.stat {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 14px 10px; text-align: center; display: flex; flex-direction: column; gap: 2px;
}
.stat-value { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
.stat-label { font-size: 12px; color: var(--muted); }

/* week strip */
.weekstrip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.weekstrip-day { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.weekstrip-dow { font-size: 11px; color: var(--muted); }
.weekstrip-dot { width: 100%; height: 6px; border-radius: 3px; background: var(--surface-2); }
.weekstrip-day.is-on .weekstrip-dot { background: var(--accent); }

/* banners */
.banner { padding: 12px 14px; border-radius: var(--radius); font-size: 14px; }
.banner--info { background: var(--surface-2); color: var(--text); }
.banner--warn { background: rgba(227, 179, 65, 0.15); color: var(--warn); }
.banner--error { background: rgba(248, 81, 73, 0.15); color: var(--danger); }
.banner--link { display: block; text-decoration: none; }

/* video facade */
.video { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 10px; overflow: hidden; }
.video-thumb { all: unset; display: block; width: 100%; height: 100%; cursor: pointer; position: relative; }
.video-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.video-thumb img.is-broken { visibility: hidden; }
.video-play {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 34px; color: #fff; text-shadow: 0 2px 12px rgba(0,0,0,0.7);
}
.video iframe { width: 100%; height: 100%; border: 0; display: block; }
.video-missing { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted); font-size: 13px; }

/* tab bar */
.tabbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  display: grid; grid-template-columns: repeat(3, 1fr);
  background: rgba(13, 17, 23, 0.94); backdrop-filter: blur(10px);
  border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom);
}
.tabbar a {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 10px 0 8px; color: var(--muted); text-decoration: none; font-size: 11px;
}
.tabbar a.is-active { color: var(--accent); }
.tab-icon { font-size: 17px; line-height: 1; }

.section { display: flex; flex-direction: column; gap: 12px; }
.section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
```

- [ ] **Step 7: Verify the shell loads with real data**

Open `index.html` in a browser (double-click, or `start index.html` from PowerShell). Confirm:

1. The header reads `CrossFit phase 1 program`.
2. Three day cards appear: Day 1, Day 2, Day 3.
3. Day 1 reads `12 exercises`; Days 2 and 3 read `13 exercises`.
4. Block names appear under each day, e.g. `Warm Up · Mobility · Circuit 1 · Circuit 2`.
5. Stats read `0/3 sessions`, `0 weeks streak`, `— since last`.
6. The tab bar highlights Week.
7. **The browser console shows zero errors.** A `PTT is not defined` error means a script tag is out of order.

- [ ] **Step 8: Commit**

```bash
git add index.html assets/css/app.css assets/js/ui/ assets/js/app.js
git commit -m "feat: add app shell, router and week screen"
```

---

### Task 8: Day screen

**Files:**
- Create (replacing the stub): `assets/js/ui/view-day.js`
- Modify: `assets/css/app.css` (append the Day screen block)

**Interfaces:**
- Consumes: `PTT.ui` (Task 7), `PTT.progress.lastPerformance`, `PTT.progress.estimateSeconds`
- Produces: `PTT.views.day.render(ctx) -> HTMLElement` where `ctx = {store, program, sessions, day}`

- [ ] **Step 1: Write `assets/js/ui/view-day.js`**

```js
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
    var body = el('div', { class: 'ex-body', hidden: 'hidden' });
    var expanded = false;

    var toggle = el('button', {
      class: 'ex-head', type: 'button', 'aria-expanded': 'false',
      onclick: function () {
        expanded = !expanded;
        this.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        if (expanded) {
          body.removeAttribute('hidden');
          if (!body.childNodes.length) {
            body.appendChild(UI.video(ex.videoId));
            var meta = [];
            if (ex.tempo) meta.push(el('p', { class: 'ex-note', text: 'Tempo: ' + ex.tempo }));
            if (ex.notes) meta.push(el('p', { class: 'ex-note', text: ex.notes }));
            var line = lastLine(sessions, ex);
            if (line) meta.push(el('p', { class: 'ex-note ex-note--last', text: line }));
            if (!ex.videoId) meta.push(el('p', { class: 'ex-note', text: 'No video was linked for this exercise.' }));
            meta.forEach(function (m) { body.appendChild(m); });
          }
        } else {
          body.setAttribute('hidden', 'hidden');
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
```

- [ ] **Step 2: Append Day screen styles to `assets/css/app.css`**

```css
/* day screen */
.backlink { color: var(--muted); text-decoration: none; font-size: 14px; }
.blocks { display: flex; flex-direction: column; gap: 22px; }
.block-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.ex-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ex { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.ex-head {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 12px;
  width: 100%; padding: 10px 12px; cursor: pointer; min-height: 64px;
}
.ex-thumb { width: 72px; height: 44px; border-radius: 8px; object-fit: cover; background: var(--surface-2); flex: none; }
.ex-thumb--empty { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; }
.ex-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ex-name { font-weight: 600; }
.ex-target { font-size: 13px; color: var(--muted); }
.ex-chevron { color: var(--muted); transition: transform 0.15s ease; }
.ex-head[aria-expanded="true"] .ex-chevron { transform: rotate(180deg); }
.ex-body { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.ex-note { margin: 0; font-size: 13px; color: var(--muted); }
.ex-note--last { color: var(--accent); }
```

- [ ] **Step 3: Verify in the browser**

Reload `index.html`, tap Day 1. Confirm:

1. Four blocks appear with correct set counts: Warm Up `2 sets`, Mobility `2 sets`, Circuit 1 `4 sets · 30s rest`, Circuit 2 `4 sets · 30s rest`.
2. `Running In Place` shows `2 × 30s` — the inherited duration from `Step Jacks`.
3. `Knee Side Plank` on Day 2 shows `20s each side`.
4. Tapping a row expands a thumbnail; tapping the thumbnail loads the YouTube player and it plays.
5. Collapsing and re-expanding does not create a second iframe.
6. Console shows zero errors.

- [ ] **Step 4: Commit**

```bash
git add assets/js/ui/view-day.js assets/css/app.css
git commit -m "feat: add day screen with lazy video facade"
```

---

### Task 9: Session screen

The guided workout: one exercise at a time, countdown timers, rest timers, and a draft written on every set.

**Files:**
- Create (replacing the stub): `assets/js/ui/view-session.js`
- Modify: `assets/css/app.css` (append the Session screen block)

**Interfaces:**
- Consumes: `PTT.ui`, `PTT.store` draft API (Task 5), `PTT.app.reload`
- Produces: `PTT.views.session.render(ctx) -> HTMLElement`

**Session flow.** The day is flattened into an ordered list of *steps*, one per (exercise × set):
`[{exercise, block, setIndex, totalSets}]`. Circuit ordering follows the sheet: all exercises in a block are performed in order, then the block repeats for the next set. So Circuit 1 with 4 exercises × 4 sets produces 16 steps ordered `set 0: e0,e1,e2,e3 · set 1: e0,e1,e2,e3 · …`. Rest runs after the last exercise of each round, not between exercises within a round.

- [ ] **Step 1: Write `assets/js/ui/view-session.js`**

```js
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
    var timer = null;          // active interval id
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
      var logged = { value: isTime ? (set.seconds !== null ? set.seconds : ex.target.value)
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
        var sideNote = ex.target.perSide ? ' (each side)' : '';
        var cd = countdown(ex.target.value, 'Hold' + sideNote, function () {
          completeSet(ex.target.value * (ex.target.perSide ? 2 : 1), step.restAfter);
        });
        control = cd.node;
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
```

- [ ] **Step 2: Append Session screen styles to `assets/css/app.css`**

```css
/* session screen */
.view--session { gap: 14px; }
.session { display: flex; flex-direction: column; gap: 14px; }
.session-head { display: flex; align-items: center; justify-content: space-between; }
.session-count { color: var(--muted); font-size: 14px; font-variant-numeric: tabular-nums; }
.session-title { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
.session-target { margin: 0; color: var(--muted); font-size: 14px; }
.progressbar { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
.progressbar-fill { height: 100%; background: var(--accent); transition: width 0.2s ease; }

.set-dots { display: flex; gap: 8px; }
.set-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--line); }
.set-dot.is-done { background: var(--accent); border-color: transparent; }
.set-dot.is-current { box-shadow: 0 0 0 3px rgba(78, 201, 165, 0.25); }

.timer { display: flex; flex-direction: column; align-items: center; gap: 8px;
         background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; }
.timer-value { font-size: 52px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; }
.timer-label { margin: 0; color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }

.stepper { display: flex; align-items: center; justify-content: center; gap: 20px;
           background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; }
.stepper-btn { min-width: 56px; font-size: 24px; }
.stepper-value { font-size: 44px; font-weight: 700; font-variant-numeric: tabular-nums; min-width: 110px; text-align: center; }

.note-input {
  width: 100%; min-height: 48px; padding: 0 14px; border-radius: var(--radius);
  border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 15px;
}
.session-actions { display: grid; grid-template-columns: 1fr 1.4fr 1fr; gap: 10px; }
.session-rest, .session-finish { display: flex; flex-direction: column; gap: 16px; align-items: stretch; text-align: center; }
.rest-next { margin: 0; color: var(--muted); }
```

- [ ] **Step 3: Verify in the browser**

Reload, start Day 1. Confirm:

1. Step counter reads `1 / 41` — Day 1 is `2×2 + 2×3 + 4×4 + 4×3 = 38` steps. **Compute the real number first** with
   `"$NODE" -e "const P=require('./assets/js/core/parse-grid.js'),f=require('./tests/fixtures/phase1-grid.js');const d=P.gridToProgram(f.grid,{id:'p1'}).days[0];console.log(d.blocks.reduce((n,b)=>n+b.sets*b.exercises.length,0))"`
   and check the screen matches that number.
2. First step is `Warm Up · set 1 of 2 — Step Jacks` with a 30-second countdown.
3. Starting the countdown counts down and auto-advances at zero.
4. A reps exercise (Chair Squat) shows a stepper pre-filled at `12`; `+`/`−` adjust it.
5. After the last exercise of Circuit 1's first round, a 30-second rest screen appears and starts on its own.
6. Set dots fill in as sets complete.
7. Reload the page mid-workout, then tap Resume on the Week screen: the session returns at the same step with prior sets still marked done.
8. Finishing shows the summary; saving returns to Week with `1/3 sessions` and the day card marked `✓ 1×`.
9. Console shows zero errors.

- [ ] **Step 4: Commit**

```bash
git add assets/js/ui/view-session.js assets/css/app.css
git commit -m "feat: add guided session screen with timers and draft persistence"
```

---

### Task 10: Programs screen — upload, preview, backup

**Files:**
- Create (replacing the stub): `assets/js/ui/view-programs.js`
- Modify: `assets/css/app.css` (append the Programs screen block)

**Interfaces:**
- Consumes: `XLSX` global, `PTT.sheetGrid.fromWorksheet`, `PTT.parse.gridToProgram`, `PTT.store`
- Produces: `PTT.views.programs.render(ctx) -> HTMLElement`

- [ ] **Step 1: Write `assets/js/ui/view-programs.js`**

```js
'use strict';
(function (root) {
  var UI = root.PTT.ui;

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
            root.PTT.app.reload();
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
      el('span', { text: 'Drop your trainer\u2019s .xlsx here, or tap to choose' })
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
            say('Restored ' + counts.programs + ' program(s) and ' + counts.sessions + ' session(s).');
            root.PTT.app.reload();
          } catch (err) {
            say(err.message || 'That backup could not be restored.', 'error');
          }
        };
        reader.readAsText(file);
      }
    });

    var activeId = ctx.program ? ctx.program.id : null;

    return el('div', { class: 'view' }, [
      el('header', { class: 'view-head' }, [el('h1', { text: 'Plans' })]),

      messages,
      dropzone,
      fileInput,
      previews,

      UI.section('Your plans', [
        el('div', { class: 'cards' }, (store.getPrograms().length
          ? store.getPrograms().slice().reverse().map(function (p) {
              var used = store.getSessions().filter(function (s) { return s.programId === p.id; }).length;
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
```

- [ ] **Step 2: Append Programs screen styles to `assets/css/app.css`**

```css
/* programs screen */
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.dropzone {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  padding: 32px 20px; border: 2px dashed var(--line); border-radius: var(--radius);
  color: var(--muted); text-align: center; cursor: pointer;
}
.dropzone.is-over { border-color: var(--accent); color: var(--accent); }
.dropzone-icon { font-size: 28px; }
.previews { display: flex; flex-direction: column; gap: 12px; }
.preview { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.preview-facts { margin: 0; padding-left: 18px; color: var(--muted); font-size: 14px; }
.preview-facts .is-warn { color: var(--warn); }
.program { display: flex; align-items: center; gap: 12px; padding: 14px; }
.program.is-active { border-color: rgba(78, 201, 165, 0.4); }
.program-main { flex: 1; min-width: 0; }
.program-actions { display: flex; gap: 8px; align-items: center; }
.program-actions .btn { min-height: 40px; padding: 0 14px; font-size: 14px; }
.button-row { display: flex; gap: 10px; flex-wrap: wrap; }
.messages:empty { display: none; }
```

- [ ] **Step 3: Verify in the browser**

Reload, open Plans. Confirm:

1. `CrossFit phase 1 program` is listed and marked Active, `3 days · 38 exercises`.
2. Drop `data/source/crossfit-phase-1.xlsx` on the dropzone. A preview appears reading `3 days`, `38 exercises`, `38 of 38 have a video`.
3. Confirming adds a **second** program; the first still exists with its sessions intact.
4. Switching Active with **Use** changes the Week screen's program name.
5. Deleting the duplicate asks for confirmation and keeps logged sessions.
6. Export downloads a JSON file. Open it and confirm it contains `programs` and `sessions` arrays.
7. Restoring that file reports `Restored 0 program(s) and 0 session(s)` — merge by id, no duplicates.
8. Dropping a non-spreadsheet file (any `.txt`) shows a red error and saves nothing.
9. Console shows zero errors.

- [ ] **Step 4: Commit**

```bash
git add assets/js/ui/view-programs.js assets/css/app.css
git commit -m "feat: add plans screen with xlsx import preview and JSON backup"
```

---

### Task 11: Progress screen and charts

**Files:**
- Create (replacing the stub): `assets/js/ui/view-progress.js`
- Modify: `assets/css/app.css` (append the Progress screen block)

**Interfaces:**
- Consumes: `PTT.progress` (Task 6), `PTT.ui`
- Produces: `PTT.views.progress.render(ctx) -> HTMLElement`

**Before writing this task, invoke the `dataviz` skill** and follow its palette, axis, and contrast guidance. Charts are hand-rolled inline SVG — no charting library, per the no-build constraint. The three visualizations are: a 12-week heatmap grid, a per-day completion bar row, and a per-exercise line chart.

- [ ] **Step 1: Invoke the dataviz skill**

Run the `dataviz` skill and read its palette and mark-spec guidance. Apply its colour values in place of the placeholders below (`--chart-1` etc.), keeping the dark-theme contrast requirements.

- [ ] **Step 2: Write `assets/js/ui/view-progress.js`**

```js
'use strict';
(function (root) {
  var UI = root.PTT.ui;
  var G = root.PTT.progress;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  function heatmapGrid(sessions) {
    var weeks = 12;
    var cells = G.heatmap(sessions, weeks * 7, new Date());
    // Align so the first column starts on a Monday.
    var firstDow = (new Date(cells[0].date + 'T00:00:00').getDay() + 6) % 7;
    var padded = [];
    for (var i = 0; i < firstDow; i++) padded.push(null);
    var grid = padded.concat(cells);

    var size = 12, gap = 3;
    var cols = Math.ceil(grid.length / 7);
    var chart = svg('svg', {
      class: 'heatmap', viewBox: '0 0 ' + (cols * (size + gap)) + ' ' + (7 * (size + gap)),
      role: 'img', 'aria-label': 'Workout days over the last 12 weeks'
    });

    grid.forEach(function (cell, idx) {
      if (!cell) return;
      var col = Math.floor(idx / 7);
      var row = idx % 7;
      chart.appendChild(svg('rect', {
        x: col * (size + gap), y: row * (size + gap), width: size, height: size, rx: 3,
        class: 'heatcell heatcell--' + Math.min(cell.count, 3)
      })).appendChild(svg('title', {})).textContent = cell.date + ': ' + cell.count + ' session(s)';
    });

    return chart;
  }

  function dayBars(sessions, program) {
    var el = UI.el;
    var map = G.dayCompletion(sessions, program);
    var max = 1;
    program.days.forEach(function (d) { max = Math.max(max, map[d.id].count); });
    return el('div', { class: 'daybars' }, program.days.map(function (d) {
      var count = map[d.id].count;
      return el('div', { class: 'daybar' }, [
        el('span', { class: 'daybar-label', text: d.name }),
        el('div', { class: 'daybar-track' }, [
          el('div', { class: 'daybar-fill', style: 'width:' + Math.round((count / max) * 100) + '%' })
        ]),
        el('span', { class: 'daybar-count', text: String(count) })
      ]);
    }));
  }

  function lineChart(history, kind) {
    var w = 320, h = 96, pad = 8;
    var chart = svg('svg', {
      class: 'linechart', viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none',
      role: 'img', 'aria-label': 'Best ' + (kind === 'time' ? 'hold' : 'reps') + ' per session'
    });
    var values = history.map(function (p) { return p.best; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = max - min || 1;
    var stepX = history.length > 1 ? (w - pad * 2) / (history.length - 1) : 0;

    var points = history.map(function (p, i) {
      return {
        x: pad + i * stepX,
        y: pad + (h - pad * 2) * (1 - (p.best - min) / span)
      };
    });

    chart.appendChild(svg('polyline', {
      class: 'linechart-line', fill: 'none',
      points: points.map(function (p) { return p.x + ',' + p.y; }).join(' ')
    }));
    points.forEach(function (p, i) {
      var dot = svg('circle', { class: 'linechart-dot', cx: p.x, cy: p.y, r: 3 });
      var t = svg('title', {});
      t.textContent = history[i].date + ': ' + history[i].best + (kind === 'time' ? 's' : ' reps');
      dot.appendChild(t);
      chart.appendChild(dot);
    });
    return chart;
  }

  function exerciseList(sessions, program) {
    var el = UI.el;
    var seen = {};
    var rows = [];
    program.days.forEach(function (d) {
      d.blocks.forEach(function (b) {
        b.exercises.forEach(function (ex) {
          if (seen[ex.slug]) return;
          seen[ex.slug] = true;
          var history = G.exerciseHistory(sessions, ex.slug);
          if (history.length < 1) return;
          var first = history[0].best;
          var last = history[history.length - 1].best;
          var delta = last - first;
          rows.push(el('article', { class: 'card exrow' }, [
            el('div', { class: 'exrow-head' }, [
              el('h3', { text: ex.name }),
              el('span', {
                class: 'pill' + (delta > 0 ? ' pill--done' : ''),
                text: (delta > 0 ? '+' : '') + delta + (history[0].kind === 'time' ? 's' : ' reps')
              })
            ]),
            el('p', { class: 'ex-note',
                      text: history.length + ' session' + (history.length === 1 ? '' : 's') +
                            ' · best ' + Math.max.apply(null, history.map(function (p) { return p.best; })) +
                            (history[0].kind === 'time' ? 's' : ' reps') }),
            history.length > 1 ? lineChart(history, history[0].kind) : null
          ]));
        });
      });
    });
    return rows;
  }

  function render(ctx) {
    var el = UI.el;
    var program = ctx.program;
    if (!program) {
      return el('div', { class: 'view' }, [
        el('h1', { text: 'Progress' }),
        el('p', { class: 'empty', text: 'Add a plan first.' })
      ]);
    }

    var s = G.summary(ctx.sessions, program, new Date());
    var rows = exerciseList(ctx.sessions, program);

    return el('div', { class: 'view' }, [
      el('header', { class: 'view-head' }, [el('h1', { text: 'Progress' })]),

      el('div', { class: 'stat-row' }, [
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value', text: String(s.totalSessions) }),
          el('span', { class: 'stat-label', text: 'sessions' })
        ]),
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value', text: String(s.streakWeeks) }),
          el('span', { class: 'stat-label', text: 'week streak' })
        ]),
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat-value', text: String(s.longestStreakWeeks) }),
          el('span', { class: 'stat-label', text: 'best streak' })
        ])
      ]),

      UI.section('Last 12 weeks', [heatmapGrid(ctx.sessions)]),
      UI.section('Days completed', [dayBars(ctx.sessions, program)]),
      UI.section('Exercise progression',
        rows.length ? rows : [el('p', { class: 'empty', text: 'Complete a workout to start tracking exercises.' })])
    ]);
  }

  root.PTT.views = root.PTT.views || {};
  root.PTT.views.progress = { render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 3: Append Progress screen styles to `assets/css/app.css`**

Replace the `--chart-*` values with the palette from the `dataviz` skill.

```css
/* progress screen */
.heatmap { width: 100%; height: auto; }
.heatcell { fill: var(--surface-2); }
.heatcell--1 { fill: rgba(78, 201, 165, 0.45); }
.heatcell--2 { fill: rgba(78, 201, 165, 0.72); }
.heatcell--3 { fill: var(--accent); }

.daybars { display: flex; flex-direction: column; gap: 10px; }
.daybar { display: grid; grid-template-columns: 72px 1fr 28px; align-items: center; gap: 10px; }
.daybar-label { font-size: 14px; color: var(--muted); }
.daybar-track { height: 10px; background: var(--surface-2); border-radius: 5px; overflow: hidden; }
.daybar-fill { height: 100%; background: var(--accent); border-radius: 5px; }
.daybar-count { text-align: right; font-variant-numeric: tabular-nums; font-size: 14px; }

.exrow { padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.exrow-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.linechart { width: 100%; height: 96px; }
.linechart-line { stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.linechart-dot { fill: var(--accent); }
```

- [ ] **Step 4: Verify in the browser**

Complete two workouts on different days (the fastest route: start a session, tap Skip through it, Finish, Save; repeat). Confirm:

1. Stat row shows the right session count and streak.
2. The heatmap shows filled squares on the days you logged; hovering a square shows the date and count.
3. Day bars show one filled bar per completed day.
4. After logging the **same** exercise twice, an exercise row appears with a line chart and a delta pill.
5. With one session only, the exercise row shows text but no chart.
6. Console shows zero errors.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ui/view-progress.js assets/css/app.css
git commit -m "feat: add progress screen with heatmap and exercise charts"
```

---

### Task 12: End-to-end verification and README

Final pass across the whole app, plus the documentation needed to run and maintain it.

**Files:**
- Create: `README.md`
- Modify: any file where the verification pass finds a defect

- [ ] **Step 1: Run the full test suite**

```bash
export NODE="C:/Users/PC/AppData/Roaming/fnm/node-versions/v20.17.0/installation/node.exe"
"$NODE" --test tests/
```

Expected: all suites PASS. Record the actual pass/fail counts — do not claim success without reading the output.

- [ ] **Step 2: Confirm no ES module syntax leaked into browser code**

```bash
grep -rnE "^\s*(import|export)\s" assets/js/core assets/js/ui assets/js/app.js data/seed-program.js || echo "clean: no ES module syntax"
```

Expected: `clean: no ES module syntax`.

- [ ] **Step 3: Confirm no local fetch calls**

```bash
grep -rn "fetch(\|XMLHttpRequest" assets/js/core assets/js/ui assets/js/app.js || echo "clean: no local fetches"
```

Expected: `clean: no local fetches`.

- [ ] **Step 4: Full manual pass from a clean slate**

In the browser, open DevTools → Application → Local Storage → clear everything under the `file://` origin, then reload `index.html` and walk the whole flow:

1. Seed loads automatically; Week shows Day 1/2/3 with 12/13/13 exercises.
2. Day 1 → expand `Proned Towell Pulldown` → video plays inline.
3. Start Day 2 → complete `Step Jacks` via the countdown → rest appears where the sheet specifies it.
4. Mid-session, reload the page → Week offers Resume → resuming lands on the same step.
5. Finish and save → Week shows `1/3 sessions`.
6. Progress shows one heatmap square on today and one filled day bar.
7. Plans → import `data/source/crossfit-phase-1.xlsx` → preview → add → two programs listed, the session preserved.
8. Plans → Export backup → clear localStorage → reload → Restore backup → programs and sessions return.
9. Resize the window to 390 × 844 (phone) and repeat steps 1–5: nothing overflows horizontally, all tap targets are reachable, the tab bar does not cover content.
10. Console shows zero errors across the entire pass.

Fix any defect found, then re-run steps 1 and 4.

- [ ] **Step 5: Write `README.md`**

```markdown
# Training Tracker

A phone-first web app for the home workout plan from my trainer. Every exercise
plays its video inline, workouts are guided with timers, and progress is tracked
across uploaded programs.

## Running it

Open `index.html` in a browser. That is the whole setup — no install, no server,
no build step.

To use it on a phone, push this folder to a GitHub repository and enable GitHub
Pages. Nothing in the code changes; hosting just gives the app a real origin, so
its saved progress gets a private, durable storage bucket.

## Adding a new week

Plans → drop the trainer's `.xlsx` → review the preview → Add. The new plan is
added alongside the old ones; nothing is overwritten and all logged sessions are
kept. Switch between plans with **Use**.

The importer expects the trainer's usual layout:

| Column | Meaning |
|---|---|
| A | Day name |
| B | Block name — inherited down until the next one |
| C | Exercise name, with the video as a cell hyperlink |
| D | Sets |
| E | Reps or duration — inherited down within a block |
| F | Tempo |
| G | Rest |
| M | Notes |

Day tables are found by their `Exercise` header row, so they can sit anywhere in
the sheet. A workbook with several sheets becomes several plans.

## Backing up

Progress is stored in the browser and a browser clean-up can wipe it. Plans →
**Export backup** downloads a JSON file with every plan and session; **Restore
backup** merges it back, skipping anything already present.

## Development

Tests need Node, which is installed via `fnm` but not on `PATH`:

```bash
export NODE="C:/Users/PC/AppData/Roaming/fnm/node-versions/v20.17.0/installation/node.exe"
"$NODE" --test tests/
```

Regenerate the bundled Phase 1 plan or the test fixture after changing the parser:

```bash
"$NODE" tools/build-seed.js
"$NODE" tools/build-fixture.js
```

### Layout

- `assets/js/core/` — pure logic, no DOM, unit-tested under Node
- `assets/js/ui/` — one file per screen
- `assets/js/vendor/` — SheetJS, vendored so imports work offline
- `data/` — the source workbook and the generated seed plan
- `docs/superpowers/` — design spec and this implementation plan

Two constraints keep the no-build promise and must not be broken: app scripts
are **classic scripts**, never ES modules (browsers block `import` on `file://`),
and local data ships as `.js`, never `.json` (`fetch` is blocked on `file://`).
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage, import format and dev commands"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| §1 Success criteria 1 (opens with plan loaded) | Task 4 seed, Task 7 bootstrap, Task 12 step 4.1 |
| §1 Success criteria 2 (videos play inline) | Task 7 `UI.video`, Task 8, Task 12 step 4.2 |
| §1 Success criteria 3 (complete a workout on the phone) | Task 9, Task 12 step 4.9 |
| §1 Success criteria 4 (upload adds, never destroys) | Task 5 `addProgram`, Task 10, Task 12 step 4.7 |
| §1 Success criteria 5 (progress per day/week/exercise) | Task 6, Task 11 |
| §2 Source data columns and inheritance | Task 3 rules 1–9 |
| §3 Architecture, no ES modules, dual-export footer | Global Constraints, Task 1 step 3, Task 12 step 2 |
| §3 Seed as `.js` not `.json` | Task 4, Task 12 step 3 |
| §3 SheetJS confined to one adapter | Task 2 `sheet-grid.js` |
| §4 Data model, per-side semantics, uniform set shape | Task 1, Task 3, Task 9 `blankDraft` |
| §4 Storage keys, draft, backup | Task 5 |
| §5 Import flow with preview before save | Task 10 `previewCard` |
| §6 Week/Day/Session/Progress/Programs screens | Tasks 7–11 |
| §6 Streak, week completion, estimated duration definitions | Task 6 `summary`, `estimateSeconds` |
| §6 Video facade | Task 7 `UI.video`, Task 8 |
| §7 Error handling — all seven rows | Task 10 (unreadable file, no day tables), Task 8 (no video), Task 1+3 (unparseable target), Task 7 (storage unavailable banner), Task 5 (corrupt blob), Task 7 CSS (offline thumbnail) |
| §8 Testing | Tasks 1–6, Task 12 step 1 |
| §9 Build order | Task order 1–12 |

**Placeholder scan:** no `TBD`/`TODO` entries; every code step contains complete, runnable code. Task 11 step 1 defers palette *values* to the `dataviz` skill but ships working defaults, so the task is executable either way.

**Type consistency:** `Cell = {v, link}` is produced by Task 2 and consumed by Task 3. `Program`/`Day`/`Block`/`Exercise` shapes from Task 3 are consumed unchanged by Tasks 5–11. `Session.entries[].sets[] = {index, done, reps, seconds, note}` is created by Task 9 `blankDraft`, read by Task 6 `exerciseHistory`, and asserted in Task 5's tests. `PTT.progress.dayKey` is used by Task 10's export filename. `PTT.app.reload` is defined in Task 7 and called by Tasks 10 and 11.

**Gap found and fixed during review:** the spec's build order listed 11 steps, but the plan needs a 12th for end-to-end verification and the README — otherwise the "verify in a browser" pass has no home and the no-build constraints have no automated guard. Task 12 covers both.
