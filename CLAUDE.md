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

Editor flow: CMS saves to `staging` → preview on staging → PR `staging → live` → live.

The `refresh-recent-window.yml` workflow dispatches a staging deploy every Monday so the CMS date-range regex stays current even during quiet weeks.

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
- `eleventy/_data/recentWindow.js` — computes a rolling 4-month date regex at build time to scope CMS to recent content only (Sveltia crashes loading 12k entries).

### Plugins (`eleventy/plugins/`)

- `shortcodes.js` — `{% audio %}` and `{% cue %}` shortcodes for inline audio players and stage-direction blocks.
- `filters.js` — Nunjucks filters: `strftime`, `ordinal`, `dayOrdinal`, `stripQuotes`, `currentTime`, `toContentRel`, `pathToCmsSlug`.
- `collections.js` — `shows`, `segments`, `newsletters` collections + `segmentsForShow` filter (indexes segments by date for O(1) lookup).
- `speaker-highlight.js` — cheerio transform that wraps speaker labels in `<span class="speaker">`, groups them into `<div class="transcript-block">`, and converts `<p><img alt=...></p>` into `<figure><figcaption>`.

### Content model

- `content/shows/<year>/<MM-DD>/show.md` — episode cover page; `template: show`, `category: Shows`.
- `content/segments/<year>/<MM-DD>/<slug>.md` — individual segments, paired to their show by date via `segmentsForShow`.
- `content/newsletters/<YYYY-MM-DD>-<slug>.md` — weekly newsletter.
- `content/pages/<slug>.md` — standalone pages (about, stations, etc.).
- `content/archive/{shows,segments}/<year>/…` — historical 1991-2024 content; built and deployed but not CMS-visible.
- `megaphone_id` frontmatter drives podcast embed rendering.

When editing markdown, preserve frontmatter fields: `title`, `date`, `category`, `template`, `megaphone_id`, `image_url`, `image_caption`, `summary`, `order`.

Historical content lives at `content/archive/{shows,segments}/<year>/…`. When active collections overflow Sveltia's ~1k file ceiling, fix: `git mv content/shows/<old-year> content/archive/shows/<old-year>`. See `content/admin/README.md` "Runbook: CMS getting slow".

### Tests (`tests/`)

`tests/test_render.mjs` — node:test + cheerio golden tests. Each test asserts a specific invariant we've broken before. Fixture content lives in `tests/fixtures/content/`.

### CMS (`content/admin/`)

Sveltia CMS at `/admin/` with OAuth (Cloudflare Worker proxy at `auth/`) or PAT fallback. Scoped to recent content only via `recentWindow.js`. See `content/admin/README.md`.

### Ingest pipeline (`ingest/`)

TypeScript pipeline that scrapes loe.org and emits markdown into `content/`. Stages: `discover` → `fetch` (cached by URL SHA1) → `parse` → `emit`. Cache is durable; re-running `emit --force` never hits the network. See `INGEST.md` for full details.

### Scripts (`scripts/`)

- `check-show.mjs` — validates frontmatter shape, date/path alignment, megaphone_id format, and checks every image/audio/link URL 2xx. Runs in CI on every content push.
- `copyedit-check.mjs` — LLM advisory pass (Gemini). Always exits 0. Runs in CI only on manual `workflow_dispatch`.
- `tag-segments.mjs` — utility for tagging segments.

## Infrastructure

See `INFRA.md` for full service registry. Key services:

- **GitHub Actions** — CI/CD (`deploy.yml`, `check-show.yml`, `refresh-recent-window.yml`).
- **Cloudflare Pages** — staging hosting (`loe-staging` project, deploys from `staging`).
- **GitHub Pages** — production hosting (deploys from `live`).
- **Cloudflare Worker** (`auth/`) — OAuth proxy for the CMS; source in `auth/src/index.js`.

Secrets: `CLOUDFLARE_API_TOKEN` (wrangler deploy + pages), `GEMINI_API_KEY` (copyedit script). See `INFRA.md` for rotation/migration instructions.

## Conventions

- Open work lives in GitHub Issues: <https://github.com/jarredbarber/loe-vibecode/issues>. Reference issue numbers in commit messages (`Closes #2`).
- `_site_11ty/` is the build artifact — don't edit by hand.
