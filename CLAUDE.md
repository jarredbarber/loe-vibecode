# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static website for **Living on Earth** (https://vibingon.earth, source for loe.org content), built with **Pelican** and deployed to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`.

## Commands

```bash
# Local build (outputs to _site/)
pelican content -s site_config.py

# Production-style build (matches CI)
SITEURL=/ pelican content -s site_config.py

# Skip the (large) archive content for faster iteration
FAST_BUILD=true pelican content -s site_config.py

# Dev loop: rebuild on change + serve at :8000 (requires venv + fswatch)
./scripts/dev_watcher.sh

# Install deps
pip install -r requirements.txt
```

There is no test suite or linter configured.

## Architecture

### Pelican config (`site_config.py`)
- Content lives in `content/` (shows, segments, newsletters, series, pages, images, extra).
- Theme: `themes/loe_original` (the only theme).
- Custom URL scheme: articles render as `{date:%Y_%m_%d}_{slug}.html` — preserves the legacy loe.org URL structure. Don't change without migration.
- `DIRECT_TEMPLATES` includes a custom `newsletter` template alongside `index`/`archives`.
- `EXTRA_PATH_METADATA` maps `extra/favicon.ico` and `extra/podcast.rss` to the site root.
- `SITEURL` is env-driven (empty for local, `/` in CI).

### Plugins (`plugins/`)
Both are local Pelican plugins loaded via `PLUGIN_PATHS`:

- **`show_segments`** — runs on the article generator. For articles with `template: show`, parses `<h3><a>...</a></h3>` segment links in the body and attaches the resolved target articles to the show so the show template can render rich segment cards (title, image, summary) instead of bare links. Segment links use Pelican's `{filename}segment-slug.md` syntax.
- **`speaker_highlight`** — content-stage transformer. Detects transcript paragraphs starting with `ALL CAPS NAME:` and rewrites them into styled speaker blocks. Operates on `content._content` via BeautifulSoup.

### Content model
- `content/shows/<year>/<MM-DD>/show.md` — episode cover page; `template: show`, `category: Shows`, lists segments as `### [Title]({filename}segment.md)`.
- Sibling files in the same `MM-DD/` folder are segments (`category: Segments`). The `show_segments` plugin couples them at build time, so the **filename-based linking convention is load-bearing** — renaming a segment file silently breaks the show page.
- `megaphone_id` frontmatter drives podcast embed rendering in templates.

### Scrapers (`scripts/`)
Python scrapers (`scrape_archives.py`, `scrape_newsletters.py`, `scrape_series.py`, `rescrape_2025.py`, shared `scraping_utils.py`) pull legacy content from loe.org and emit it into `content/` in the expected Pelican structure. These are one-shot migration tools, not part of the build.

## Conventions

- When editing show/segment markdown, preserve the frontmatter fields documented in `README.md` (`title`, `date`, `category`, `template`, `megaphone_id`, `image_url`, `summary`) — templates and plugins read them by name.
- Open work lives in GitHub Issues: <https://github.com/jarredbarber/loe-vibecode/issues>. Reference issue numbers in commit messages (`Closes #2`) and use `gh issue create` for new items.
- `_site/` and `output/` are build artifacts — don't edit by hand.
