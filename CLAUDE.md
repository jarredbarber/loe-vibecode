# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static website for **Living on Earth** (https://vibingon.earth, source for loe.org content), built with **Eleventy (11ty)** and deployed to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`.

The project was originally Pelican; the migration to Eleventy is tracked in issue #2.

## Commands

```bash
# Install deps (root + eleventy subdir)
npm ci && npm --prefix eleventy ci

# One-shot build → _site_11ty/
npm --prefix eleventy run build

# Dev server with live reload
npm --prefix eleventy run dev

# Incremental rebuild (only changed inputs)
npm --prefix eleventy run incremental

# Run golden tests
npm test
```

Cold build of the active content set (2025+2026, ~500 pages): ~5 seconds. The historical archive (1991-2024) lives in `archive/` and is not built — Sveltia chokes when CMS-visible folders exceed ~1k entries, and editors won't normally need to revise content older than the current rolling window. If we want to surface historical content on the live site, see the "serve archive without paying build cost" discussion in chat history (option A — snapshot + concat at deploy).

## Architecture

### Eleventy config (`eleventy/.eleventy.js`)

- Input: `../content/` (shared content tree).
- Output: `../_site_11ty/`.
- Templates: Nunjucks (Jinja2-like syntax).
- Custom URL scheme: articles render as `YYYY_MM_DD_<slug>.html` via the computed `permalink` — preserves the legacy loe.org URL structure inherited from Pelican.
- Layout selection happens via `eleventyComputed.layout` derived from the existing Pelican frontmatter fields (`template:`, `category:`) so no per-file changes were needed during the migration.

### Plugins (`eleventy/plugins/`)

- `shortcodes.js` — registers `{% audio %}` and `{% cue %}` shortcodes for inline audio players and stage-direction blocks.
- `filters.js` — Nunjucks filters: `strftime`, `ordinal`, `dayOrdinal`, `stripQuotes`, `currentTime`, `toContentRel`, `pathToCmsSlug`.
- `collections.js` — `shows`, `segments`, `newsletters` collections + `segmentsForShow` filter that indexes segments by date for O(1) lookup.
- `speaker-highlight.js` — Eleventy transform (cheerio-based) that wraps speaker labels in `<span class="speaker">`, groups them into `<div class="transcript-block">`, and converts `<p><img alt=...></p>` into `<figure><figcaption>`.

### Templates (`eleventy/_includes/`)

- `layouts/base.njk` — site shell, nav, editor badges.
- `layouts/{article,show,page,newsletter_article}.njk` — per-content-type layouts.
- `modules/_article_header.njk` — shared header block (title, date, image, megaphone iframe).
- `modules/show-segment.njk` — segment card on show pages.
- `modules/stations_map.njk` — interactive US stations map.

Direct templates (`content/{index,archives,newsletter}.njk`) live in `content/` as `.njk` files so Eleventy renders them as standalone pages.

### Ingest pipeline (`ingest/`)

TypeScript pipeline that scrapes loe.org and emits markdown into `content/`. See `INGEST.md`.

### Content model

- `content/shows/<year>/<MM-DD>/show.md` — episode cover page; `template: show`, `category: Shows`.
- `content/segments/<year>/<MM-DD>/<slug>.md` — individual segments, paired with their show by date via the `segmentsForShow` filter at render time.
- `content/newsletters/<YYYY-MM-DD>-<slug>.md` — weekly newsletter.
- `content/pages/<slug>.md` — standalone pages (about, stations, etc.).
- `archive/{shows,segments}/<year>/…` — historical content (1991-2024), in-repo but not in the build path.
- `megaphone_id` frontmatter drives podcast embed rendering.

### Tests (`tests/`)

`tests/test_render.mjs` — node:test + cheerio golden tests. Each test asserts a specific invariant we've broken before. Fixture content lives in `tests/fixtures/content/`. Run with `npm test`.

### CMS (`content/admin/`)

Sveltia CMS at `/admin/` with PAT-based GitHub auth. See `content/admin/README.md`. Recent shows + segments only — older content stays accessible via direct GitHub edit. The companion live preview at `/admin/preview.html` renders body markdown + shortcodes client-side via markdown-it.

(A short-lived Python preview service at `loe-vibecode.fly.dev` is still deployed but unused — `fly apps destroy loe-vibecode` to clean up.)

## Conventions

- When editing show/segment markdown, preserve frontmatter fields (`title`, `date`, `category`, `template`, `megaphone_id`, `image_url`, `image_caption`, `summary`, `order`) — templates and plugins read them by name.
- Open work lives in GitHub Issues: <https://github.com/jarredbarber/loe-vibecode/issues>. Reference issue numbers in commit messages (`Closes #2`) and use `gh issue create` for new items.
- `_site_11ty/` is the build artifact — don't edit by hand.
- The legacy Pelican stack (`site_config.py`, `plugins/`, `themes/loe_original/templates/`, `requirements.txt`, `scripts/scrape_*.py`) has been removed. Git tag `pre-eleventy-migration` marks the last commit before the migration if rollback is needed.
