# `/content` — Site content

This folder holds everything that appears on the website: episodes, segments, newsletters, pages, and the CMS configuration. You can browse and edit files directly on GitHub, or use the CMS at [loe-staging.pages.dev/admin](https://loe-staging.pages.dev/admin).

## Layout

```
content/
├── shows/          # Current episode cover pages (2025–present)
├── segments/       # Current individual segments (2025–present)
├── newsletters/    # Weekly newsletter issues
├── pages/          # Standalone pages (About, Stations, Events, …)
├── series/         # Special feature series
├── archive/
│   ├── shows/      # Episode cover pages 1991–2024
│   └── segments/   # Individual segments 1991–2024
├── admin/          # CMS configuration (Sveltia)
├── images/         # Uploaded images
└── extra/          # favicon.ico and similar one-off assets
```

## Adding or editing content

The easiest way is the CMS — it handles formatting and saves directly to GitHub. The CMS is scoped to `shows/` and `segments/` (current content only).

For anything outside that scope — newsletters, pages, series, or archive edits — use GitHub's built-in editor (pencil icon on any file).

## File format

Every content file is Markdown with a YAML frontmatter block at the top:

```yaml
---
title: My Episode Title
date: 2026-05-28
category: Segments        # or Shows, Newsletter
slug: my-episode-title
megaphone_id: LOE123456   # drives the audio player embed
image_url: https://...
image_caption: Caption text
summary: One-paragraph description shown on the episode page.
tags:
  - climate-policy
  - biodiversity
---

Transcript goes here...
```

## Archive

Files in `archive/` are identical in format to current content — they just live in a separate folder to keep the CMS fast (Sveltia would slow down loading ~12,000 files). They build and publish normally; every archive segment has a live URL.

When a year of `shows/` or `segments/` gets old enough to move to archive, run:
```bash
git mv content/shows/2024 content/archive/shows/2024
git mv content/segments/2024 content/archive/segments/2024
```
See `admin/README.md` → "Runbook: CMS getting slow" for the full procedure.
