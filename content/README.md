# `/content` — Site content

This folder holds everything that appears on the website: episodes, segments, newsletters, and pages. Browse and edit files directly on GitHub.

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
├── images/         # Uploaded images
└── extra/          # favicon.ico and similar one-off assets
```

## Adding or editing content

Use GitHub's built-in editor (pencil icon on any file), committing to the `staging` branch. Every page on staging has an **Edit on GitHub** badge that opens its source file.

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

Files in `archive/` are identical in format to current content — they just live in a separate folder to keep the active collections small. They build and publish normally; every archive segment has a live URL.

When a year of `shows/` or `segments/` gets old enough to move to archive, run:
```bash
git mv content/shows/2024 content/archive/shows/2024
git mv content/segments/2024 content/archive/segments/2024
```
