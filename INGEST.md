# Ingest pipeline

TypeScript pipeline at `ingest/` that scrapes loe.org and emits markdown into `content/`. One-shot migration tool; not part of the live build.

## Stack

Node + TypeScript, using the **unified/remark/rehype** ecosystem for HTML→Markdown. Mdast trees flow end-to-end; markdown is stringified only at emit. js-yaml dumps frontmatter so quoting / escaping / dates round-trip correctly.

## Layout

```
ingest/
├── src/
│   ├── fetch.ts             # URL → cached HTML
│   ├── discover.ts          # year TOC → ShowRef[] with date + segment URLs
│   ├── parse-show.ts        # HTML → ShowDoc
│   ├── parse-segment.ts     # HTML → SegmentDoc (frontmatter + body)
│   ├── parse-newsletter.ts  # HTML → NewsletterDoc
│   ├── discover-newsletters.ts
│   ├── emit.ts              # SegmentDoc / ShowDoc → markdown files
│   ├── emit-newsletter.ts
│   └── cli.ts               # commander subcommands
├── cache/                   # gitignored content-addressed raw HTML
├── fixtures/                # golden tests
└── test/
```

## Pipeline stages

Each stage is a pure function, runnable independently. Stages communicate via disk so any one can be re-run in isolation.

```
discover(year)  →  ShowRef[]              # from TOC: URL + date + segment URLs
fetch(url)      →  string (cached)        # sha1(url) → cache/<hash>.html
parse(html)     →  ShowDoc | SegmentDoc   # mdast + structured frontmatter
emit(doc)       →  content/{shows|segments}/YYYY/MM-DD/*.md
```

Properties:

- **Cache is the contract.** After one backfill, iterating on `parse` never hits the network.
- **Mdast end-to-end.** Plugin transforms operate on trees, not regex-on-markdown.
- **Idempotent emit.** Refuses to overwrite a file whose mtime is newer than its cache entry; `--force` overrides.

## CLI

```bash
cd ingest

ingest discover --year 2026               # list shows from TOC
ingest fetch --year 2026                  # populate cache
ingest emit --year 2026                   # write markdown from cache

ingest discover-newsletters
ingest fetch-newsletters
ingest emit-newsletters
```

`ingest emit` does cross-show slug-collision dedup at write time, appending an MMDD suffix when two segments on different dates would share a slug.

## Frontmatter shape (segments)

```yaml
title: Spring "Bursts" Forth
slug: spring-bursts-forth          # globally unique, suffixed if collision
date: '2026-05-22'
category: Segments
order: '3'                          # broadcast order within the show
megaphone_id: LOE6677141098
image_url: https://loe.org/content/2026-05-22/BIRDNOTE_willowflycatchers.jpg
image_caption: …
summary: …
```

The `<!-- source: <url> -->` HTML comment on the line after frontmatter pins each markdown file to its scraped source so the migration-review agent (and future re-ingest) can find the cached HTML.

## Shortcode emission

Bracketed audio cues from the source (`[Northern Cardinal song, http://macaulaylibrary.org/audio/176244, 0.06-.10]`) become `{% audio %}` shortcodes during emit. Macaulay URLs resolve to Cornell's CDN MP3. Non-audio bracketed text becomes `{% cue text="..." %}`.

## Re-emitting from cache

Cache is durable. To re-render any year through the current parser:

```bash
cd ingest && npm run ingest -- emit --year 1995 --force
```

`ingest/cache/` contains the raw HTML for every show + segment 1991-2025 (~470 MB on disk). Years 1991-1992 had no segment links extracted on first pass — segment-list parsing for those years would need a per-year quirk.

## Status

Migration is complete for 2025-2026 content (in `content/{shows,segments}/`). Older years live in `content/archive/` — built and deployed, but not CMS-visible. Newsletters are ingested into `content/newsletters/`. Pages/series were one-off content per the original site and are hand-maintained.
