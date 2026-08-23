# Personal Training Tracker — Design

**Date:** 2026-08-24
**Status:** Approved for planning
**Source data:** `home workout _ ibrahim keshta _.xlsx` — sheet `CrossFit phase 1 program`

## 1. Purpose

A phone-first web app that turns the weekly workout spreadsheet from a personal
trainer into a guided training experience: every exercise explained with an
embedded video, sets and reps tracked as they are performed, progress visible
over time, and new weeks added by uploading the next spreadsheet.

### Success criteria

1. Opening `index.html` shows the Phase 1 program with no setup step.
2. Every exercise plays its trainer-supplied video inside the app.
3. A full workout can be completed from the phone without touching the sheet.
4. Uploading a new `.xlsx` adds a new program without destroying old ones or
   their logged history.
5. Progress across weeks is visible per day, per week, and per exercise.

### Non-goals

- Multi-user accounts, sync, or any server-side component.
- Editing the plan by hand in the app. Plans come from the trainer's sheet.
- Nutrition, body-weight, or measurement tracking.
- Offline video. Videos are YouTube embeds and require a connection.

## 2. Source data

The workbook holds one sheet with three day-tables stacked vertically. Each
table starts with a header row containing `Exercise` in column C.

| Column | Meaning | Applies to |
|---|---|---|
| A | Day name (`day 1`, `DAY 2`, `DAY 3`) | first row of the day table |
| B | Block name (`WARM UP`, `MOBILITY`, `CORE`, `CIRCUIT 1`, `CIRCUIT 2`) | inherited down until the next non-empty B |
| C | Exercise name — carries the video as a cell hyperlink | the row |
| D | Sets | inherited down within the block |
| E | Reps / Duration | the row |
| F | Tempo | the row (unused in the source file) |
| G | Rest | inherited down within the block |
| H–L | Per-set logging columns `1`–`5` | ignored on import; the app logs these |
| M | Notes | the row |

Parsed result: 3 days, 38 exercise rows, 38 hyperlinks, ~25 unique videos.
Both `youtube.com/watch?v=ID` and `youtube.com/shorts/ID` forms appear.

Observed `Reps / Duration` values requiring normalization: `12`, `8`,
`12 REPS`, `30 SEC`, `30SEC`, `20 SEC`, `1 MIN`, `1 min`, `20 SEC EACH`.

## 3. Architecture

A zero-build static site. No package manager, no bundler, no server: opening
`index.html` from the filesystem is the supported way to run it.

**Constraint that drives the file layout:** browsers block ES modules on
`file://`. All application scripts are therefore classic scripts loaded by
`<script>` tags, each attaching a single namespace object to `window`.

```
index.html
assets/css/app.css
assets/js/
  vendor/xlsx.full.min.js   vendored SheetJS build
  core/normalize.js         PTT.normalize
  core/parse-grid.js        PTT.parse
  core/store.js             PTT.store
  core/progress.js          PTT.progress
  ui/components.js          PTT.ui
  ui/router.js              PTT.router
  ui/view-week.js           PTT.views.week
  ui/view-day.js            PTT.views.day
  ui/view-session.js        PTT.views.session
  ui/view-progress.js       PTT.views.progress
  ui/view-programs.js       PTT.views.programs
  app.js                    bootstrap
data/seed-program.js        Phase 1, pre-parsed
tests/*.test.js             node:test
```

The seed is a `.js` file that assigns `PTT.seed`, not a `.json` file. `fetch()`
and `XMLHttpRequest` are blocked against `file://` URLs, so the seed data has to
arrive through a `<script>` tag. The build step in section 9 emits it in that
shape.

### Module boundaries

Each core module is a pure-function namespace with no DOM and no storage
access except `store`, so all of them run unchanged under Node for testing.

- **`normalize`** — string to structured value. Parses reps/duration into
  `{kind:'reps'|'time', value, perSide}`, extracts a YouTube video id from any
  URL form, slugifies exercise names, title-cases the shouting in the sheet.
  Depends on nothing.
- **`parse`** — `gridToProgram(grid, meta)` where `grid` is a 2D array of
  `{v, link}` cells. Splits day tables, applies column inheritance, builds the
  program object. Depends on `normalize`.
- **`store`** — reads and writes localStorage; owns the schema version, the
  migration hook, and JSON export/import. Depends on nothing.
- **`progress`** — derives completion, streaks, calendar data, and
  per-exercise history from a list of sessions. Pure. Depends on nothing.

SheetJS is confined to one function in `view-programs.js` that converts a
worksheet into the `grid` shape. Nothing else in the app knows SheetJS exists.

**Fallback:** if the SheetJS build cannot be vendored, replace that one
function with an in-house reader (unzip via `DecompressionStream('deflate-raw')`,
read `sheet1.xml`, `sharedStrings.xml`, and the `_rels` hyperlink map with
`DOMParser`). The `grid` interface is unchanged, so nothing else moves.

## 4. Data model

```js
Program {
  id, name, source, importedAt, schemaVersion,
  days: [ Day ]
}
Day { id, name, index, blocks: [ Block ] }
Block { id, name, sets, rest, restSeconds, exercises: [ Exercise ] }
Exercise {
  id,            // stable within a program
  slug,          // cross-program identity, e.g. "wall-sit"
  name,          // display name
  raw,           // original cell text
  sets,          // number, inherited from block
  target: { kind: 'reps'|'time', value, perSide, text },
  tempo, rest, restSeconds, notes,
  videoUrl, videoId
}
```

`target.value` is always the amount **for one side**: `20 SEC EACH` is
`{kind:'time', value:20, perSide:true}`, meaning two 20-second holds, not one
10-second hold per side. `target.text` always holds the original cell text and
is the only field populated when a value cannot be parsed.

```js
Session {
  id, programId, dayId, startedAt, completedAt|null,
  entries: [ {
    exerciseId, slug, name,
    sets: [ { index, done, reps, seconds, note } ]
  } ]
}
```

A logged set carries both `reps` and `seconds`; the one matching the exercise's
`target.kind` is filled and the other is `null`. Keeping the shape uniform means
`progress` never branches on kind when reading, only when charting.

`slug` is the cross-program key: `WALL SIT` in Phase 1 and Phase 3 produce the
same slug, so per-exercise history spans programs.

### Storage

localStorage under a single versioned root:

- `ptt.v1.programs` — array of `Program`
- `ptt.v1.sessions` — array of `Session`
- `ptt.v1.settings` — `{ activeProgramId, theme }`
- `ptt.v1.draft` — the in-flight session, written on every set so a mid-workout
  reload or app switch loses nothing

An in-progress session is a `draft`; it is promoted into `sessions` on finish.

Chrome and Firefox both provide localStorage to `file://` pages, but all
`file://` pages share one bucket and some privacy settings clear it on exit.
This is survivable for a single-user personal tracker, and the Export backup
below is the answer to it. Hosting the folder on GitHub Pages later gives it a
real origin and a private, durable bucket; nothing in the app changes.

**Backup.** localStorage is not durable — a browser clean-up wipes it. The app
provides Export (downloads a single JSON of programs, sessions, and settings)
and Import (restores it, merging by id). This is the only protection for logged
history and is therefore part of the first release, not a later addition.

## 5. Import flow

1. User drops or picks an `.xlsx` on the Programs screen.
2. SheetJS reads it; every sheet in the workbook is converted to a `grid`.
3. `parse.gridToProgram` builds a `Program` per sheet.
4. A preview is shown before anything is saved: day count, exercise count,
   how many exercises got a video, and any rows the parser could not interpret.
5. On confirm, the program is appended and becomes active. Existing programs
   and all sessions are untouched.

Import never overwrites. If parsing yields zero days, the app reports what it
saw and saves nothing.

## 6. Screens

Single page, hash-routed: `#/week`, `#/day/:dayId`, `#/session/:dayId`,
`#/progress`, `#/programs`.

### Week (`#/week`)

Active program name, one card per training day showing block summary, exercise
count, estimated duration, and completion state. Current streak and a
last-7-days strip. Primary action per card: Start.

The three days are not pinned to calendar weekdays. Sessions are recorded by
date; the week view reports how many of the program's days were completed in
the current week.

Two derived numbers need explicit definitions, since a three-day program makes
a naive daily streak break every single week:

- **Streak** — the number of consecutive Monday-to-Sunday weeks, counting back
  from the current week, in which at least one session was completed. The
  current week counts as long as it is still in progress and already has a
  session; it never breaks the streak before Sunday.
- **Week completion** — sessions completed this week over the program's day
  count, for example 2/3.
- **Estimated duration** — a day's blocks summed as
  `sets × (exercises × (target seconds or 3 s per rep) + rest)`, rounded to
  five minutes. It is a rough label on the card, never used in progress figures.

### Day (`#/day/:dayId`)

Exercises grouped by block, showing block sets and rest. Each row: YouTube
thumbnail, name, `4 × 12` or `3 × 30s`, and a "last time" line drawn from
history. Tapping a row expands an inline player.

**Video facade:** rows render `img.youtube.com/vi/{id}/mqdefault.jpg`; the
`youtube-nocookie.com/embed/{id}` iframe is created only on tap. A page of 13
exercises therefore loads 13 images, not 13 iframes.

### Session (`#/session/:dayId`)

Full-screen, one exercise at a time, in sheet order.

- Video at the top, tap to play.
- Set dots showing position within the block's set count.
- `kind:'time'` targets get a countdown; `perSide` runs the countdown twice
  with a side label.
- `kind:'reps'` targets show the target with a stepper to log what was actually
  done.
- Completing a set auto-starts the block's rest countdown (30s in this program),
  skippable.
- Per-set note field.
- Every set write updates `ptt.v1.draft`.
- Finish produces a summary: duration, sets completed, exercises completed.

### Progress (`#/progress`)

Total sessions, current and longest streak, calendar heatmap of session days,
completion rate per day of the program, and per-exercise progression charts
(target vs. actual over time — for example wall sit 20s to 45s).

Charts follow the `dataviz` skill: consistent palette, readable in the dark
theme, accessible contrast.

### Programs (`#/programs`)

Program list with import date and exercise count, set-active control, delete
(with a warning naming how many sessions reference it — sessions are kept),
the upload dropzone, and Export/Import backup.

## 7. Error handling

| Failure | Behaviour |
|---|---|
| Uploaded file is not a readable workbook | Message on the Programs screen; nothing saved |
| Sheet has no recognizable day tables | Preview reports "0 days found" and lists the first rows seen; save is disabled |
| Exercise row has no video hyperlink | Exercise is kept; a neutral placeholder replaces the thumbnail |
| Reps/duration cell is unparseable | Kept verbatim as `target.text` with `kind:'reps'`, `value:null`; the UI shows the raw text and offers a free-text log field |
| localStorage unavailable or full | Banner warns that progress will not persist; app stays usable in memory |
| Stored data fails to parse | App loads seed data, keeps the corrupt blob under `ptt.v1.corrupt`, and tells the user how to recover via Import |
| No network | App and logging work fully; video thumbnails and players show an offline placeholder |

## 8. Testing

`node --test tests/` using the local Node 20 installed via `fnm`. Core modules
are written to attach to `globalThis`, so Node loads the same files the browser
does.

TDD covers:

- **normalize** — `12`, `8`, `12 REPS`, `30 SEC`, `30SEC`, `20 SEC`, `1 MIN`,
  `1 min`, `20 SEC EACH` produce the correct `{kind, value, perSide}`;
  unparseable input falls back to raw text; `watch?v=`, `/shorts/`, and
  `youtu.be/` produce the video id; slug stability across casing and trailing
  whitespace.
- **parse** — a fixture grid captured from the real workbook yields 3 days;
  Day 1 has 12 exercises in 4 blocks, Days 2 and 3 have 13 each; sets and rest
  inherit correctly down each block; all 38 exercises carry a video id; a day
  table terminates at the blank row before the next header.
- **progress** — streak across consecutive and gapped dates, week completion
  counting, per-exercise series ordering, empty-history edge cases.
- **store** — round-trip save/load against a localStorage stub, export/import
  fidelity, corrupt-blob recovery, draft promotion on finish.

UI views are verified by driving the app in a browser, not by unit tests.

## 9. Build order

1. `normalize` plus tests
2. `parse` plus tests, with the real-workbook fixture
3. Generate `data/seed-program.js` from the actual `.xlsx` via the tested parser
4. `store` plus tests
5. `progress` plus tests
6. Shell: `index.html`, CSS, router, Week screen
7. Day screen with the video facade
8. Session screen with timers and draft persistence
9. Programs screen: upload, preview, backup
10. Progress screen and charts
11. End-to-end pass in a browser against the real file

## 10. Assumptions

- The trainer's future sheets keep this layout: day in A, block in B, exercise
  with hyperlink in C, sets in D, reps/duration in E, rest in G. The importer
  locates tables by the `Exercise` header rather than by fixed row numbers, so
  vertical position may change freely; a change to the column meanings would
  need a parser update.
- One workbook may contain several sheets; each becomes its own program.
- A "week" is however many days the uploaded program contains — three here.
