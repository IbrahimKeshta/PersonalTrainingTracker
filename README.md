# Training Tracker

A phone-first web app for the home workout plan from my trainer. Every exercise
has its video one tap away (inline once hosted — see the caveat below), workouts
are guided with timers, and progress is tracked across uploaded programs.

## Running it

Open `index.html` in a browser. That is the whole setup — no install, no server,
no build step. The app, its data, and progress storage all work exactly as built
from a plain `file://` URL.

**One thing does not work from `file://`: inline video playback.** YouTube's
embedded player requires the page to send an HTTP `Referer` header, and pages
opened directly from disk never send one — YouTube rejects the embed with
"Error 153" every time, for every video. The app detects this (checking
`location.protocol === 'file:'`) and swaps the inline player for a plain "Watch
on YouTube ↗" link instead, so nothing breaks — you just leave the app to watch
the clip. Once the app is hosted (see below), the real page has an HTTP origin,
the referer header exists, and every video plays inline as designed.

To use it on a phone, and to get inline video back, push this folder to a
GitHub repository and enable GitHub Pages. Nothing in the code changes; hosting
just gives the app a real HTTP origin, which both satisfies YouTube's embed
requirement and gives the app's saved progress a private, durable storage
bucket (a `file://` origin's local storage is tied to the browser profile and
can be cleared by routine browser clean-up).

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
Both are guarded by grep checks (`^\s*(import|export)\s` and `fetch(|XMLHttpRequest`
over `assets/js/core`, `assets/js/ui`, `assets/js/app.js`, `data/seed-program.js`)
and were re-verified on a literal `file://` load, not just an HTTP substitute —
see `.superpowers/sdd/2026-08-24-personal-training-tracker/task-12-report.md`
for the full verification record, including the video-embedding caveat above.
