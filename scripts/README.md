# Utility Scripts (deprecated)

**These Python scrapers are being replaced by the TypeScript pipeline in `../ingest/`. See `../INGEST.md`.**

Kept here only as a reference until the new pipeline reaches parity, after which they will be deleted (see `../TASKS.md`).

## Scripts

- `scrape_archives.py` — main legacy scraper for shows + segments from loe.org.
- `scrape_newsletters.py` — newsletter pages.
- `scrape_series.py` — series index pages.
- `rescrape_2025.py` — one-off cleanup pass for 2025.
- `scraping_utils.py` — shared fetch/slugify helpers.
- `dev_watcher.sh` — local Pelican rebuild + serve on file changes (still useful, not deprecated).
