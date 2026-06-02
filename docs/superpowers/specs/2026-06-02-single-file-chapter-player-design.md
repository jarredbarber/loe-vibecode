# Single-file chapter player — design

**Date:** 2026-06-02
**Status:** Approved (design), pending implementation plan
**Related:** chapter-demo prototype (`content/chapter-demo.njk`), #118 (chapter-by-segment), #154 (player analytics)

## Problem

Today every show's player is built from N separate Megaphone enclosure mp3s — one
per segment (`show.njk` builds `_audioTracks` from each segment's `megaphone_id`).
That means producing a separate audio file per segment, with its own QC pass.

Going forward we want to **stop making per-segment files**: a show is one
full-episode mp3 (already exists as the show's own `megaphone_id`), and the
player chapters into it using timestamps. Those timestamps are known at show
assembly time, so capturing them in metadata is cheap *going forward*.

We explicitly do **not** want to backfill the ~1.6k existing shows — digging up
timestamps for old episodes is not worth it. So the system must support both
models simultaneously and pick per-show/per-segment based on available data.

### Key finding: no dynamic ad insertion

The Megaphone enclosure is byte-identical across requests (3 fresh fetches all
returned 49,814,911 bytes; only the per-request `session_id`/`request_event_id`
measurement tokens differ). So **fixed timestamps address the file reliably** —
there is no ad-insertion drift to account for — while download counting (the #154
metric) is preserved. The ~5½-min gap between the full file (51:53) and the sum
of segment content (46:24) is fixed intro/transition/music, which is why we store
an absolute `start` per segment rather than deriving position from durations.

## Approach (A): field-presence drives the mode

No mode flags. Behavior is a pure function of which fields are present, so old
content is untouched and a partially-converted show degrades sensibly.

- A **segment** with `start` → windowed (a slice of the show's full file).
  Otherwise → legacy (plays its own `megaphone_id`).
- A **show**'s chapter player: if *all* its segments have `start` → one
  full-file player with chapter seeks; otherwise → today's N-file sequential
  player.

## Data model

Two optional fields on **segment** frontmatter, stored as human timecodes:

```yaml
start: "12:09"      # offset of this segment in the full-show file
duration: "8:32"    # segment content length
```

- Accepted formats: `MM:SS`, `H:MM:SS`, or a bare integer (seconds).
- A new `tcToSeconds` Nunjucks filter parses these to integer seconds **at build
  time**, so the player only ever consumes ints in `data-*` attributes.
- The full-file audio source is the **show's existing `megaphone_id`** — the
  full episode. New segments carry `start`+`duration` and **no** `megaphone_id`.
- Legacy segments are unchanged: own `megaphone_id`, no `start`.

A new `showForDate` filter (mirror of `segmentsForShow`, O(1) date index) lets a
segment page resolve its parent show's `megaphone_id` for windowing.

## Components & data flow

### `eleventy/plugins/filters.js`
- Add `tcToSeconds(tc)` → integer seconds (parses `MM:SS` / `H:MM:SS` / int).
- Add `showForDate(date, shows)` → the show entry for a date (indexed lookup).

### `eleventy/_includes/layouts/show.njk`
Build `_audioTracks` per segment:
- windowed: `{ title, art, full: <show megaphone_id>, start, dur }`
- legacy: `{ id: <segment megaphone_id>, title, art }`

The macro/player infers single-file-chaptered mode when every track has `full`+`start`.

### `eleventy/_includes/modules/audio-player.njk`
- Per `.ep-chap`: emit either `data-id` (legacy) or `data-full` + `data-start`
  + `data-dur` (windowed).
- `<noscript>` Megaphone iframe fallback (uses `fallbackId` = show id) unchanged.

### `eleventy/_includes/modules/_article_header.njk` (standalone segment-page player)
Standalone segments render via `layouts/article.njk` → `_article_header.njk`,
which today builds the single player from `entry.megaphone_id` (lines 71–78).
- If the segment (`entry`) has `start`: render a windowed `--single` player
  against the show's full id (resolved via `showForDate(entry.date, …)`), passing
  `start`/`dur`. The `<noscript>` fallback can still use the show id.
- Else: today's per-segment own-file player (unchanged).

`show-segment.njk` is only the in-show segment *listing* (no player) and needs no
change.

### `static/js/episode-player.js`
Generalize each track to either `{id}` (legacy) or `{full, start, dur}` (windowed).
Two playback behaviors, keyed off the existing `episode-player--single` class:

- **Show, multi-chapter, single-file** (multi, tracks share `full`): load the
  full file once; a chapter tap **seeks** to `start`; the scrubber reflects
  whole-episode time; current chapter highlights by which `[start, nextStart)`
  the playhead is in; playback flows continuously across chapters (no src
  reload, no stop). *(demo player 1)*
- **Segment page, `--single`, windowed** (one windowed track): play only
  `[start, start+dur]`; display `0:00–duration`; pause at the window end.
  *(demo player 2)*

The legacy multi-file path (`audio.src = mp3(all[i].id)` per chapter) is kept
exactly as-is. Range requests (`accept-ranges: bytes`, confirmed) let a mid-file
segment seek without downloading the whole ~50 MB file.

### CMS (`content/admin/`)
Add optional `start` and `duration` string fields to the segments collection,
with a `MM:SS` pattern hint. Editors enter them at show assembly time.

## Error handling & validation

- `scripts/check-show.mjs`:
  - If a segment has `start`, require its show to have a `megaphone_id`.
  - Where the full-file duration is determinable, warn if `start+duration`
    exceeds it.
  - Warn on a partially-converted show (some segments have `start`, some don't) —
    it falls back to multi-file mode, which the editor may not intend.
- Player: a windowed track with no resolvable `full` id renders nothing for that
  chapter rather than throwing (defensive; validation should prevent it).

## Testing

`tests/test_render.mjs` golden tests:
- A show whose segments all have `start`/`duration` renders single-file markup:
  one full-id source, `data-start`/`data-dur` per chapter, no per-segment ids.
- A legacy show renders multi-id markup (regression guard for 1.6k shows).
- A segment page renders a windowed `--single` player when `start` is present,
  and a legacy own-file player when not.
- `tcToSeconds` parses `MM:SS`, `H:MM:SS`, and bare seconds correctly.

## Out of scope

- Backfilling timestamps for pre-conversion shows.
- Any automated timestamp ingest/pipeline — timestamps are hand-entered at
  assembly time (durations are known then).
- Changing app/RSS behavior — the feed is untouched; this is web-player only.

## Alternatives considered

### B — Explicit show-level chapter list + `single_file: true`
`show.md` carries `chapters: [{title, start, duration}]` and an explicit flag.
More explicit and keeps all timing in one place, but duplicates segment
titles/order into a second list the editor must keep in sync, and adds a new
authoring surface.

**Revisit trigger:** if the editor workflow turns out to favor maintaining a
single chapter list on the show (e.g. timestamps are produced as one timeline
artifact, not per-segment), B may be the better authoring model. Re-evaluate
once we see how producers actually capture the data.

### C — Unify everything into one "windowed" player
Treat every track as a window into some file: legacy = `[0, fullLen]` of its own
file, new = `[start, start+dur]` of the show file — one code path. Elegant, but
it rewrites the working production multi-file player and risks regressing the
1.6k existing shows for no user-visible gain. Rejected in favor of keeping the
legacy path intact and adding the windowed mode alongside it.
