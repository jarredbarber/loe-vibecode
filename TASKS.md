# Open tasks

## Backlog

- [ ] **Migrate Pelican → Eleventy.** The big one. Drop Python entirely; consolidate on TS/JS so the ingest pipeline, build pipeline, and CMS preview share one runtime. Expected wins: build time 5min → ~10s (real incremental support via `--incremental`), dependency graph that knows when archives can be skipped, no more yaml_reader cache-bug class of problems, no Python/Pelican plugin gymnastics, simpler agent-friendly codebase.

  Plan:
  1. Stand up a parallel `eleventy/` directory. Don't touch the Pelican config until parity is verified.
  2. Port the three Pelican plugins:
     - `speaker_highlight` → unified plugin (rehype walks the HTML, wraps speaker paragraphs) — half-written already in `ingest/src/`.
     - `shortcodes` → `eleventyConfig.addShortcode('audio', ...)` and `('cue', ...)`. Native feature.
     - `show_segments` → an Eleventy collection that groups segments under their show's date.
  3. Port the theme. Jinja2 templates → Nunjucks (~95% compatible, mostly mechanical search/replace). Verify CSS still works.
  4. Re-emit golden tests against Eleventy output. If they pass, the migration is correct.
  5. Switch `deploy.yml` to `npx @11ty/eleventy`. Delete `requirements.txt`, `site_config.py`, `plugins/`, `.venv/`.
  6. Move `archive/` back into `content/` — Eleventy can handle 12K pages with incremental rebuilds.
  7. Rewrite the Fly.io preview service in JS too (~30 lines).

  Estimated cost: 6-10 hours focused. Lowest-risk path is the parallel directory so we can A/B compare before flipping.

  Open decisions before starting:
  - Templating: Nunjucks (closest to Jinja2 — easiest port) vs WebC vs 11ty.js. Pick Nunjucks unless there's a reason not to.
  - Test framework: keep pytest fixtures or move to node:test / Vitest. Probably move so the whole stack is one language.

- [ ] **Recent-window CMS filter** — limit the Sveltia shows/segments collections to a rolling window (previous + current + next month, ~12 shows / ~60 segments). Implementation: Pelican plugin that hooks `signals.finalized`, computes a date-month regex from `date.today()`, substitutes a `__RECENT_PATTERN__` placeholder in `_site/admin/config.yml` for both collections. Optional nightly GH Actions cron keeps the window fresh on quiet days. Editing older content stays accessible via the "Edit on GitHub" badge on every live page. ~30 lines.

  Mostly obviated by the Eleventy migration above (Eleventy can render all 12K pages in seconds, so we don't need to hide them from the CMS to save build time). Still useful as a UX cleanup — editors don't want to scroll through 12K entries. Reconsider after migration.


- [ ] **Full-entry CMS preview** — Sveltia's `CMS.registerPreviewTemplate` is documented but not yet implemented (planned for 1.0). Until it lands, the in-pane preview falls back to Sveltia's built-in markdown renderer + our inline `{% audio %}` / `{% cue %}` toPreview handlers. The Fly.io render service at `https://loe-vibecode.fly.dev` is deployed and ready, returning pixel-identical HTML to the public site. Two ways to consume it once Sveltia supports it (or as a stop-gap): (a) wait for Sveltia 1.0 and wire `registerPreviewTemplate`, (b) build a companion `/admin/preview/` tab that reads Sveltia's draft from localStorage (`sveltia-cms.draft.<id>`) and POSTs to the Fly service for real-time render in a second window.
- [ ] **Pages audit** — content/pages and content/series may want hand cleanup after the YAML conversion.
- [ ] **OAuth proxy** — deferred. Not needed while nobody is actively editing through the CMS. Revisit when more than 1-2 editors are using `/admin/` and PAT management becomes friction.
- [ ] **`view_filters` for segments** — toggle row above the segments list (2026 / 2025 / All).

## Done

- TS ingest pipeline + 2026 content + historical archive (1991-2025 cached)
- Inline image captions → `<figure><figcaption>`
- `{% audio %}` + `{% cue %}` shortcodes + custom inline player
- Page-aware nav active state
- Migration-review agent (Haiku)
- Architecture cleanup: YAML frontmatter, auto-discover segments, slug collisions, template de-dup, golden tests, CI deps unified
- Sveltia CMS at `/admin/` with custom audio + cue widgets, deep-link badges, GitHub PAT auth, client-side editor-mode detection (no STAGING flag)
- Speaker regex handles O'NEILL, McKIBBEN, MacKENZIE, MAN 1, etc.
- Letterboxed header images, 2-column year browser, tap-friendly stations map
- Music-cue card de-nesting
- Build down from 5 min to 6 sec (pre-2025 moved to `archive/`)
- Fly.io preview render service deployed at `https://loe-vibecode.fly.dev`
- Newsletter ingest port, legacy Python scrapers deleted, series scraper skipped (one-offs)
