# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Rules

**Never merge or push to the `live` branch without explicit instruction from a human user.** The `live` branch deploys directly to production (vibingon.earth). Always stage on `staging` first (deploys to loe-staging.pages.dev). Only merge staging→live when the user explicitly asks.

## Project

Static website for **Living on Earth** (https://vibingon.earth, source for loe.org content), built with **Eleventy (11ty)**.

## Deployment: Two-tier branch model

| Branch | Target | URL |
|--------|--------|-----|
| `staging` | Cloudflare Pages (staging) | https://loe-staging.pages.dev |
| `live` | GitHub Pages (production) | https://vibingon.earth |

Editor flow: edit on `staging` (GitHub web editor or git) → preview on staging → PR `staging → live` → live. There is no CMS.

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

# Pre-publish show check (links/images/audio, deterministic)
npm run check-show                       # latest show
npm run check-show -- --date 2026-05-22  # specific date

# LLM copyedit pass (advisory, ~5¢, requires GEMINI_API_KEY)
npm run copyedit-check                       # latest show
npm run copyedit-check -- --date 2026-05-22

# Ingest pipeline (run from ingest/)
cd ingest && npm run ingest -- emit --year 2026
cd ingest && npm run ingest -- emit --year 1995 --force  # re-emit from cache
```

Cold build of active content (2025+2026, ~500 pages): ~5s. Full build including the 1991-2024 archive (~12k pages): ~84s.

## Architecture

### Eleventy config (`eleventy/.eleventy.js`)

- Input: `../content/` (shared content tree). Output: `../_site_11ty/`.
- Templates: Nunjucks (Jinja2-like syntax).
- Custom URL scheme: articles render as `YYYY_MM_DD_<slug>.html` via computed `permalink` — preserves legacy loe.org URL structure.
- Layout selection via `eleventyComputed.layout` derived from Pelican-era frontmatter fields (`template:`, `category:`), so no per-file changes were needed during migration.

### Plugins (`eleventy/plugins/`)

- `shortcodes.js` — `{% audio %}` and `{% cue %}` shortcodes for inline audio players and stage-direction blocks.
- `filters.js` — Nunjucks filters: `strftime`, `ordinal`, `dayOrdinal`, `stripQuotes`, `currentTime`, `toContentRel`, `tcToSeconds` (timecode `MM:SS`/`H:MM:SS`/int → integer seconds, for the chapter player).
- `collections.js` — `shows`, `segments`, `newsletters` collections + `segmentsForShow` and `showForDate` filters (both index by date for O(1) lookup; `showForDate` is the reverse of `segmentsForShow`, used by a windowed segment page to resolve its parent show's full-episode `megaphone_id`).
- `speaker-highlight.js` — cheerio transform that wraps speaker labels in `<span class="speaker">`, groups them into `<div class="transcript-block">`, and converts `<p><img alt=...></p>` into `<figure><figcaption>`.

### Audio player (`static/js/episode-player.js`)

Build-time markup comes from the `audio-player.njk` macro (`{% audio %}` shortcode and the show/segment players); the browser wiring lives in `static/js/episode-player.js`. Two families of player, chosen by which `data-*` attributes the macro emitted (field-presence, no flags):

- **Legacy multi-file** — each chapter is a separate Megaphone enclosure (`data-id`), played sequentially. The ~1.6k historical shows use this; the path is intentionally left untouched.
- **Single-file chapter player** (`initWindowed`) — one full-episode mp3 (`data-full` = the show's own `megaphone_id`) with per-chapter `data-start`/`data-dur` offsets. *Chaptered* mode (a show whose segments all have `start:`) seeks within the file, draws clickable tick markers on the scrubber, and plays continuously across chapters. *Windowed* mode (a standalone segment page, `episode-player--single`) plays only `[start, start+dur]` and stops at the window end. The homepage "This Week" player uses chaptered mode when the latest show is fully chaptered.

Design + rationale (no dynamic ad insertion, so fixed timestamps address the file reliably): `docs/superpowers/specs/2026-06-02-single-file-chapter-player-design.md`.

### Content model

- `content/shows/<year>/<MM-DD>/show.md` — episode cover page; `template: show`, `category: Shows`.
- `content/segments/<year>/<MM-DD>/<slug>.md` — individual segments, paired to their show by date via `segmentsForShow`.
- `content/newsletters/<YYYY-MM-DD>-<slug>.md` — weekly newsletter.
- `content/pages/<slug>.md` — standalone pages (about, stations, etc.).
- `content/archive/{shows,segments}/<year>/…` — historical 1991-2024 content; built and deployed, kept separate so active collections stay small.
- `megaphone_id` frontmatter drives podcast embed rendering. On a **show** it is the full-episode mp3; on a **segment** it is that segment's own enclosure (legacy multi-file mode).
- Optional segment `start` / `duration` timecodes (`MM:SS`, `H:MM:SS`, or bare seconds) opt a show into the **single-file chapter player**: the segment becomes a window `[start, start+dur]` into the show's full-episode mp3 instead of shipping its own file. A show whose segments *all* have `start` renders one chaptered player; a partial conversion falls back to legacy multi-file (and `check-show` warns). Going forward, new shows are authored this way; the legacy archive is not backfilled.

When editing markdown, preserve frontmatter fields: `title`, `date`, `category`, `template`, `megaphone_id`, `image_url`, `image_caption`, `summary`, `order`, `start`, `duration`.


### Tests (`tests/`)

`tests/test_render.mjs` — node:test + cheerio golden tests. Each test asserts a specific invariant we've broken before. Fixture content lives in `tests/fixtures/content/`.

### Ingest pipeline (`ingest/`)

TypeScript pipeline that scrapes loe.org and emits markdown into `content/`. Stages: `discover` → `fetch` (cached by URL SHA1) → `parse` → `emit`. Cache is durable; re-running `emit --force` never hits the network. See `INGEST.md` for full details.

### Scripts (`scripts/`)

- `check-show.mjs` — validates frontmatter shape, date/path alignment, megaphone_id format, and checks every image/audio/link URL 2xx. Runs in CI on every content push.
- `copyedit-check.mjs` — LLM advisory pass (Gemini). Always exits 0. Runs in CI only on manual `workflow_dispatch`.
- `tag-segments.mjs` — utility for tagging segments.

## Infrastructure

See `INFRA.md` for full service registry. Key services:

- **GitHub Actions** — CI/CD (`deploy.yml`, `check-show.yml`).
- **Cloudflare Pages** — staging hosting (`loe-staging` project, deploys from `staging`).
- **GitHub Pages** — production hosting (deploys from `live`).

Secrets: `CLOUDFLARE_API_TOKEN` (pages deploy), `GEMINI_API_KEY` (copyedit script). See `INFRA.md` for rotation/migration instructions.

## Conventions

- Open work lives in GitHub Issues: <https://github.com/jarredbarber/loe-vibecode/issues>. Reference issue numbers in commit messages (`Closes #2`).
- `_site_11ty/` is the build artifact — don't edit by hand.
