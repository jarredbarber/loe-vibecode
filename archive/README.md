# Archive (pre-2025 content)

This directory contains migrated shows and segments from 1991-2024 — kept in the repo for posterity but excluded from the Pelican build to keep CI fast.

## Layout

```
archive/
├── shows/        # show.md per week, 30 years
└── segments/     # individual segments, ~10k files
```

Mirror of `content/shows/` and `content/segments/` for years 2025+.

## Bringing a year back

To re-include a specific year in the public site:

```bash
mv archive/shows/<YYYY> content/shows/
mv archive/segments/<YYYY> content/segments/
```

Then build normally. The frontmatter, slugs, and audio URLs are all in the same format used by current content.

## Re-emitting from cache

If the archive content ever drifts or you want to re-render with newer parser fixes, the raw HTML for every year (1991-2025) is still in `ingest/cache/`. Re-emit any year:

```bash
cd ingest && npm run ingest -- emit --year YYYY --force
```

This writes to `content/shows/` and `content/segments/` directly (overwriting archive copies if those years are still there).

## Why excluded from build

12,000-article Pelican builds took ~5 minutes; recent content + 2025 onwards alone is ~6 seconds. CMS-driven editor saves don't need 5-min waits per change.
