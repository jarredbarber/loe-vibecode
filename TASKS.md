# Open tasks

Agent instructions: When working on a task, update the status of the task in this TASKS.md file. Add notes to a subheading under the task you are working on that could help future agents complete the task if you are having trouble.

## Architecture cleanup pass — DONE

- [x] **Reset 2025 content** — deleted; will be re-ingested
- [x] **Retire the bracket-cue path**
  - Added `{% cue %}` shortcode for non-audio bracketed content (stage directions, music attributions)
  - Updated ingest to convert every standalone bracket paragraph to either `{% audio %}` or `{% cue %}`
  - Added `splitInlineBracketCues` pre-pass to handle BirdNote-style `<br>`-separated cues within one paragraph
  - Deleted ~120 lines of bracket-buffer code from `speaker_highlight` (`_clean_brackets`, `_flush_bracket_buffer`, `in_bracket_block` state)
  - Music-cue HTML emission now lives in one place: `plugins/shortcodes/__init__.py`
- [x] **Fix `show_segments` slug-substring fallback** — removed; only `{filename}` match remains. Also dropped case-permuted metadata access and dead `.strip('"')` calls. File shrank from 87 to 64 lines.
- [x] **De-dupe `article.html` and `show.html`** — extracted `modules/_article_header.html`. Both templates now ~18 lines.
- [x] **Unify CI deps** — `deploy.yml` now `pip install -r requirements.txt`.
- [x] **Add golden tests** — 7 tests in `tests/test_render.py` against a fixture site built into tmp. Run with `pytest tests/`. Covers: title quoting, transcript blocks, figure captions, `{% audio %}` custom player, `{% cue %}` speaker detection, show headline synthesis, nav active state.

## Open

- [ ] **Skipped from review**: split `speaker_highlight` into separate plugins by responsibility. User declined for now — the dedup with `shortcodes` is gone, so this is no longer urgent.
- [ ] **Ingest historical years** (2025 and earlier)
- [ ] **Port `scrape_newsletters.py` and `scrape_series.py`**
- [ ] **Delete `scripts/*.py`** once parity is reached
- [ ] **`tropical-forests-forever` / `the-frozen-creek` slug collisions** — Pelican warns; URLs are unique via date prefix, so no functional bug, but worth deduping slugs at emit time.

## Done (this branch)

- TS ingest pipeline + 2026 content
- Inline image captions → `<figure><figcaption>`
- `{% audio %}` + `{% cue %}` shortcodes + custom inline player
- Page-aware nav active state
- Migration-review agent (Haiku)
- Architecture cleanup pass (above)
