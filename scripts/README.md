# Scripts

Small utilities. The legacy Python scrapers (`scrape_archives.py`, `scrape_newsletters.py`, `scrape_series.py`, `rescrape_2025.py`, `scraping_utils.py`) were retired once the TypeScript ingest pipeline in `../ingest/` reached parity — full history in git if you need to consult them.

## `convert-frontmatter-to-yaml.py`

One-shot conversion that rewrote legacy `key: value` Meta-style frontmatter into real YAML across every `content/**/*.md` file. Run once during the YAML migration; keep around in case the pipeline ever needs it again.

## `dev_watcher.sh`

Local dev loop: rebuild Pelican and serve on `:8000` when content changes. Requires `fswatch` (Homebrew on macOS, `apt install fswatch` on Linux).
