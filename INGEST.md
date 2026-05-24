# Ingest Pipeline

Replacement for the Python scrapers in `scripts/`. Pulls show + segment content from loe.org and emits Pelican-ready markdown into `content/shows/`.

## Why a rewrite

The Python scrapers grew organically against a moving HTML target: ~1,600 lines, no tests, regex-on-markdown post-processors patching symptoms of brittle parsing, and a silent 2025-10-31 cutoff that routed older shows to a non-existent `_wip/` directory. Only 7 weeks of content ever made it into `content/shows/`. See the original review in chat history (Dec 2026) for the full breakdown.

## Goals

1. Migrate **2026 content** (immediate need) and then backfill historical years.
2. Iterate on parsing **offline**, against cached HTML, with golden-file tests.
3. Idempotent re-runs that don't silently clobber hand-edits.

## Stack

TypeScript on Node, using **unified/remark/rehype** for HTML→Markdown. Same pipeline Glint uses, so the parser is composable plugins instead of regex passes. Mdast trees flow end-to-end; markdown is only stringified at emit.

## Layout

```
ingest/
  package.json
  tsconfig.json
  src/
    fetch.ts          # URL → cached HTML
    discover.ts       # year TOC → ShowRef[] (url + date)
    parse-show.ts     # HTML → ShowMeta + SegmentRef[]
    parse-segment.ts  # HTML → SegmentDoc (mdast + frontmatter fields)
    transform/        # rehype/remark plugins, one quirk each
      speakers.ts
      image-caption.ts
      strip-footer.ts
      megaphone.ts
    emit.ts           # SegmentDoc → frontmatter + markdown on disk
    cli.ts            # commander subcommands
  cache/              # gitignored; content-addressed raw HTML
  fixtures/           # golden tests: input.html + expected/*.md
  test/
```

## Pipeline stages

Each stage is a pure function, separately runnable from the CLI. Stages communicate via disk, so any one can be re-run in isolation.

```
discover(year)   →  ShowRef[]              // from TOC, URL + date only
fetch(url)       →  string (cached)        // sha1(url) → cache/<hash>.html
parse(html)      →  ShowDoc | SegmentDoc   // mdast tree, structured metadata
emit(doc)        →  content/shows/YYYY/MM-DD/*.md
```

### Properties

- **Cache is the contract.** `fetch` writes `cache/<sha1>.html` plus an index. After one backfill, iterating on `parse` never hits the network.
- **Mdast end-to-end.** No regex-on-markdown patches. Speaker handling, caption merging, footer stripping are all tree transforms.
- **Idempotent emit.** Refuses to overwrite a file whose mtime is newer than its cache entry. `--force` to override.
- **No `_wip` cutoff.** Everything emits to `content/shows/`. Use Pelican config or frontmatter `status: draft` if staging is needed later.

## CLI

```bash
ingest discover --year 2026         # → prints/writes ShowRef[]
ingest fetch --year 2026            # populates cache/
ingest parse <url>                  # one show, useful for debugging
ingest emit --year 2026             # writes markdown from cache
ingest all --year 2026              # discover → fetch → emit
ingest fixture-add <url>            # snapshot current output as golden test
```

## Testing

Golden-file. Each fixture is:

```
fixtures/<slug>/
  input.html
  expected/show.md
  expected/<segment-slug>.md
```

Test runner pipes `input.html` through `parse` + `emit` into a temp dir and diffs against `expected/`. Adding a fixture = `ingest fixture-add <url>`.

## Migration plan

1. **Scaffold** `ingest/` with `fetch` + content-addressed cache + `discover`. Backfill cache for 2026 in one polite pass.
2. **Implement parse + emit** against 3–5 fixtures from 2026.
3. `ingest all --year 2026` → review diff → ship.
4. Expand fixtures with quirky older shows; backfill prior years.
5. Port newsletters + series (currently `scripts/scrape_newsletters.py`, `scrape_series.py`) reusing the same primitives.
6. Delete `scripts/*.py` once parity is reached.
