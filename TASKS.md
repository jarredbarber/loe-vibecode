# Open tasks

Agent instructions: When working on a task, update the status of the task in this TASKS.md file. Add notes to a subheading under the task you are working on that could help future agents complete the task if you are having trouble.

## Task: New ingest pipeline

See `INGEST.md` for full architecture. Pipeline at `ingest/`.

- [x] Scaffold `ingest/` (package.json, tsconfig, src skeleton, gitignore for `cache/`)
- [x] Implement `fetch.ts` with content-addressed cache + polite rate limiting
- [x] Implement `discover.ts` — year TOC → ShowRef[] (with date + segment URLs)
- [x] Backfill `cache/` for all 2026 shows (21 shows + 96 segments)
- [x] Pick 4 random fixtures from 2026 (seeded), snapshot with `fixture-add-random`
- [x] Implement `parse-show.ts` + `parse-segment.ts` using unified/rehype/remark
- [x] Implement `emit.ts` with idempotency guard
- [x] Wire `ingest emit --year 2026` and run end-to-end (117 files written)
- [x] Verify Pelican build succeeds against new content (215 articles, 0 errors)
- [ ] Golden-file tests against fixtures (test runner not yet wired)
- [ ] Resolve slug collisions across shows (`the-frozen-creek`, `tropical-forests-forever` — both produced Pelican warnings; URLs are still unique via date prefix)
- [ ] Backfill historical years (2025 and earlier)
- [ ] Port `scrape_newsletters.py` and `scrape_series.py`
- [ ] Delete `scripts/*.py`

### Notes

- Transform logic (speaker handling, image-caption merging, footer stripping) ended up small enough to fold into `parse-segment.ts` rather than separate `transform/` plugin files. `transform/` directory exists but is empty; can stay that way unless complexity grows.
- `emit-fixture` CLI subcommand writes a debug dump and bypasses `emit.ts`'s summary fallback / frontmatter. Use `emit --year ...` for real output.
- `extractShowDate` and `extractSegmentUrls` live in `discover.ts` because they're shared with the parsers.
