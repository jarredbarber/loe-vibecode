# Living on Earth — Website Rebuild: What We've Built and Why It Matters

This document is a summary for the LOE editorial and management team. It covers what changed, what's new, and what it means for the show.

---

## What Changed: From Dynamic to Static

The old site (Pelican/Python) assembled pages on demand — every visitor triggered a server to query a database, render templates, and return a page. If the database had a problem, the site went down.

The new site (Eleventy/11ty) works differently. Pages are built once, before any visitor arrives, and served as plain files from a CDN. There is nothing to crash and nothing to hack. The site is hosted on GitHub Pages (production) and Cloudflare Pages (staging preview), both free tiers.

| | Old Site | New Site |
| :--- | :--- | :--- |
| **How it works** | Server builds each page on request | Pages pre-built, delivered instantly |
| **Reliability** | Database outages break the site | No database, no downtime |
| **Security** | Database + login surface exposed | No server-side attack surface |
| **Hosting cost** | Paid server/database infrastructure | Free (GitHub Pages + Cloudflare) |
| **Content format** | Locked in database rows | Plain text files (.md), fully portable |
| **Preview workflow** | None | Staging branch auto-deploys to loe-staging.pages.dev |

---

## The Archive

The rebuild includes the full 35-year archive: over 10,000 segments and 1,600 shows, going back to 1991. Every episode page, every transcript, every segment is indexed and reachable at a stable URL. Previously, older content existed but was not reliably discoverable. Now it all builds together.

---

## Editing Experience

Editors use **Sveltia CMS** at `/admin/`. It is a browser-based visual editor — no code, no markdown syntax required. Editors log in with their GitHub account, write in a rich-text interface, and publish. Saving in the CMS triggers an automatic staging deploy to `loe-staging.pages.dev` in about two minutes, so editors can preview before the change goes live.

Every change is version-controlled in Git. Nothing is ever truly deleted — any change can be rolled back to any prior state.

---

## AI Features

This is the most significant new capability. Several AI-powered features run automatically, powered by Gemini.

### Tag taxonomy (auto-classification)

We defined a controlled vocabulary of 90 topic tags (e.g. "climate policy", "biodiversity", "environmental justice"). Every segment in the archive — all 10,000+ — has been classified against this taxonomy automatically. New segments are classified on publish.

The result: `/tags.html` is a full topic index of the show's 35-year output. Each tag has its own page listing every relevant segment, with a frequency sparkline showing how coverage of that topic has changed over the decades.

### Speaker pages (auto-generated from transcripts)

Every recurring host, reporter, and guest who appears in transcripts gets an auto-generated page at `/people/<name>.html`. These pages are built from transcript analysis — no manual data entry required. Editors do not maintain a "people database"; the site derives it from the content itself.

### Discovery pills on every page

Each segment and show page now shows clickable speaker names and topic tags as inline "pills." A reader interested in a topic or a particular voice can navigate directly to everything else they've appeared in.

### Pre-publish AI copyedit pass

Every content push triggers an automated Gemini review that checks for typos, broken speaker labels (mismatched names between frontmatter and transcript), and frontmatter issues (missing fields, wrong date formats). Problems are flagged before the change goes live. This runs silently in the background — editors just see a normal publish flow, but the AI catches common errors before they reach readers.

### "This week in LOE history" widget

The homepage includes a widget that surfaces archive content from the same calendar week in prior years. It runs automatically — no curation required. It gives returning visitors a reason to explore older content and highlights the depth of the archive.

---

## Listener Features

- **Zip-code station locator** — enter a zip code, get the nearest affiliate with real distance (Haversine calculation)
- **Reading and listening time estimates** on segment cards
- **Clickable inline audio cues** in transcripts — jump to a specific moment in an episode
- **Dark mode** — follows the OS setting, with a manual toggle
- **Mobile-responsive** throughout

---

## Summary

The rebuild delivers three things:

1. **A more reliable, lower-cost infrastructure** — the site cannot go down from a database failure, and hosting is effectively free.

2. **A better editing workflow** — visual CMS, staging previews, version history, and automated quality checks.

3. **New discoverability for a 35-year archive** — AI-driven tagging, speaker pages, and a history widget turn the archive from a static record into something navigable and alive.
