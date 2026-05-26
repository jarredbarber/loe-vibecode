# Open tasks

## Backlog

- [ ] **Full-entry CMS preview** — Sveltia's `CMS.registerPreviewTemplate` is documented but not yet implemented (planned for 1.0). Until it lands, the in-pane preview falls back to Sveltia's built-in markdown renderer + our inline `{% audio %}` / `{% cue %}` toPreview handlers. The Fly.io render service at `https://loe-vibecode.fly.dev` is deployed and ready, returning pixel-identical HTML to the public site. Two ways to consume it once Sveltia supports it (or as a stop-gap): (a) wait for Sveltia 1.0 and wire `registerPreviewTemplate`, (b) build a companion `/admin/preview/` tab that reads Sveltia's draft from localStorage (`sveltia-cms.draft.<id>`) and POSTs to the Fly service for real-time render in a second window.
- [ ] **Pages audit** — content/pages and content/series may want hand cleanup after the YAML conversion.
- [ ] **OAuth proxy** — currently using GitHub PAT auth. Worth switching to a Cloudflare Worker OAuth proxy if more editors join (eliminates per-editor token management).
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
