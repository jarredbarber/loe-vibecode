# Scripts

Small utilities. The legacy Python scrapers (`scrape_archives.py`, `scrape_newsletters.py`, `scrape_series.py`, `rescrape_2025.py`, `scraping_utils.py`) were retired once the TypeScript ingest pipeline in `../ingest/` reached parity — full history in git if you need to consult them.

## `check-show.mjs`

Pre-publish deterministic check for a single show + its segments. Validates frontmatter shape, that frontmatter `date` matches the directory path, megaphone_id format, and (the slow part) that every image / audio / link URL responds 2xx.

```bash
npm run check-show                       # latest show
npm run check-show -- --date 2026-05-22  # specific date
npm run check-show -- --quiet            # suppress per-URL log
```

Exit 0 if no failures, 1 otherwise. 403/429 responses (bot-blocked but typically live) are warnings rather than failures.

## `copyedit-check.mjs`

LLM advisory pass over the same show + segments — typos, broken speaker labels, frontmatter mismatches, intra-show contradictions. Citations include line numbers so editors can click "Edit on GitHub" and land directly on the right line.

```bash
npm run copyedit-check                       # latest show
npm run copyedit-check -- --date 2026-05-22  # specific date
```

Always exits 0 — output is advisory, never blocking. Requires `GEMINI_API_KEY`. Override the model via `LLM_MODEL=…` and thinking level via `LLM_THINKING_LEVEL=low|medium|high` (defaults: `gemini-3-flash-preview`, `high`). ~5¢ per run at default settings.

Both scripts also run in CI from `.github/workflows/check-show.yml` — `check-show.mjs` on every push to content; both on manual workflow_dispatch.
