# Scripts

Small utilities. The legacy Python scrapers (`scrape_archives.py`, `scrape_newsletters.py`, `scrape_series.py`, `rescrape_2025.py`, `scraping_utils.py`) were retired once the TypeScript ingest pipeline in `../ingest/` reached parity — full history in git if you need to consult them.

## `check-show.mjs`

Pre-publish deterministic check for a single show + its segments. Validates frontmatter shape, that frontmatter `date` matches the directory path, megaphone_id format, and (the slow part) that every image / audio / link URL responds 2xx.

```bash
npm run check-show                       # latest show
npm run check-show -- --date 2026-05-22  # specific date
npm run check-show -- --quiet            # suppress per-URL log
```

Exit 0 if no failures, 1 otherwise. 403/429 responses (bot-blocked but typically live) are warnings rather than failures. See [#32](https://github.com/jarredbarber/loe-vibecode/issues/32) for the planned LLM-based copyedit companion.

## `convert-frontmatter-to-yaml.py`

One-shot conversion that rewrote legacy `key: value` Meta-style frontmatter into real YAML across every `content/**/*.md` file. Run once during the YAML migration; keep around in case the pipeline ever needs it again.

## `dev_watcher.sh`

Local dev loop: rebuild Pelican and serve on `:8000` when content changes. Requires `fswatch` (Homebrew on macOS, `apt install fswatch` on Linux).
