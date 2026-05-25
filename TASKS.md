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

- [ ] **Decap/Sveltia admin — go live**: stand up the Cloudflare Worker OAuth proxy, swap `backend: test-repo` for `backend: github` in `content/admin/config.yml`, register GitHub OAuth app. Until then, `/admin/` works in test mode only (UI exploration, no commits). Tag `pre-decap-admin` marks the rollback point.

## Older open

- [ ] **Skipped from review**: split `speaker_highlight` into separate plugins by responsibility. User declined for now — the dedup with `shortcodes` is gone, so this is no longer urgent.
- [ ] **Ingest historical years** (2025 and earlier) — cache is fully populated through 2003; the 2002→1991 agent is still running. After that, `ingest emit --year YYYY` for each historical year.
- [x] **Port `scrape_newsletters.py`** — done.
- [ ] **Port `scrape_series.py`**
- [ ] **Delete `scripts/*.py`** once parity is reached
- [x] **Slug collisions** — fixed (MMDD suffix at emit time).
- [x] **YAML frontmatter** — Pelican now uses real YAML via the `yaml_reader` plugin + `markdown_full_yaml_metadata`. Ingest emit uses `js-yaml`. All existing content converted via `scripts/convert-frontmatter-to-yaml.py`.
- [x] **Auto-discover segments** — `show_segments` plugin scans the show directory; show.md no longer needs a `## Segments` block. Optional `order:` frontmatter for explicit segment ordering.
- [ ] **Pages audit** — review `content/pages/*.md` and `content/series/*.md` by hand for any field cleanups now that YAML quoting handles tricky values (the conversion script wrapped strings safely, but some content might still want manual cleanup).

## Done (this branch)

- TS ingest pipeline + 2026 content
- Inline image captions → `<figure><figcaption>`
- `{% audio %}` + `{% cue %}` shortcodes + custom inline player
- Page-aware nav active state
- Migration-review agent (Haiku)
- Architecture cleanup pass (above)
