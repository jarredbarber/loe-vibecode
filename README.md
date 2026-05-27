<div align="center">
  <a href="https://vibingon.earth"><img src="https://raw.githubusercontent.com/jarredbarber/loe-vibecode/main/themes/loe_original/static/img/logo.png" alt="Living on Earth" width="400"></a>

  [![Latest show web check](https://github.com/jarredbarber/loe-vibecode/actions/workflows/check-show.yml/badge.svg)](https://github.com/jarredbarber/loe-vibecode/actions/workflows/check-show.yml)
</div>

This is the website for [Living on Earth](https://loe.org), a weekly environmental news radio program. It's a static site, built with [Eleventy (11ty)](https://www.11ty.dev/) and deployed to GitHub Pages on every push to `main`.

Live site: **<https://vibingon.earth>**.

## 🌍 About Living on Earth

Living on Earth is a weekly, hour-long, award-winning environmental news program distributed by PRX. Hosted by Steve Curwood, the program features interviews and commentary on environmental issues. The show has been broadcasting since 1991 and airs on over 300 public radio stations nationwide.

# ✍️ Editing the site

There's a CMS at **<https://vibingon.earth/admin/>**. That's the easiest way in. Direct GitHub editing also works for anything the CMS doesn't surface (older archive content, theme files).

## Option A — The CMS (recommended)

1. Visit <https://vibingon.earth/admin/>
2. Click **Sign in with GitHub**. A GitHub consent screen opens; click **Authorize Living on Earth CMS** the first time. Future visits skip the consent step.
3. You're in. The CMS remembers you in this browser.

If the GitHub flow ever breaks, **Sign in with Token** (a Personal Access Token with `repo` scope) still works as a fallback — the dialog has a "Generate a Personal Access Token" link that opens GitHub's token-creation page pre-filled with the right scope.

What you can do:
- **Shows** — create or edit a weekly show. Only recent shows (current month ± 2) are listed; editing older content goes through GitHub directly.
- **Segments** — same scope, each pairs to a show by date.
- **Newsletters** — weekly newsletter posts.
- **Pages** — static pages (about, stations, events…).

Useful while editing:
- **Live preview**: there's a teal **Live preview ↗** pill in the top-right corner of `/admin/`. Click it while editing an entry — a new tab opens showing the entry's draft rendered exactly the way the live site renders it (shortcodes, speaker highlighting, all of it). Auto-refreshes every 3s as you save in the CMS.
- Every entry on the live site has two icon-pill links in the top-left when you're signed in: **Edit in CMS** (deep-links the entry in `/admin/`) and **Edit on GitHub** (raw markdown via GitHub's web editor).
- **Pre-publish review** runs automatically on every content push and checks every image / audio / link URL — the badge at the top of this README reflects the latest content's status. The badge also doubles as a manual entry point: click it → **Run workflow** → optionally enter a date → an LLM copyedit pass runs alongside (advisory: typos, broken speaker labels, frontmatter mismatches, intra-show contradictions, with per-line citations). Both passes write to the run's Job Summary panel.

## Option B — Direct GitHub editing

Useful for one-off edits, theme tweaks, anything the CMS doesn't surface, or older archive content.

1. Browse to the file on GitHub (e.g. `content/shows/2026/05-22/show.md`).
2. Click the pencil icon ✏️ to open the inline editor.
3. Edit. Scroll down. **Commit changes** with a message.

## Staging → production

CMS saves and any push to `main` go to **<https://loe-staging.pages.dev>** (~2 minutes). Eyeball the change there. To publish to the live site, open a pull request from `main` → `live` and merge it. The merge triggers the deploy to <https://vibingon.earth>.

## File anatomy

### Show file: `content/shows/<year>/<MM-DD>/show.md`

```yaml
---
title: 'Living on Earth: December 19, 2025'
date: '2025-12-19'
category: Shows
template: show
megaphone_id: LOE1234567890
image_url: https://loe.org/content/2025-12-19/cover.jpg
summary: The full description of the show goes here.
---
```

That's it — segments are auto-discovered from the matching folder under `content/segments/`. No manual segment list needed.

### Segment file: `content/segments/<year>/<MM-DD>/<slug>.md`

```yaml
---
title: Climate Summit Reaches Agreement
date: '2025-12-19'
category: Segments
megaphone_id: LOE0987654321
image_url: https://loe.org/content/2025-12-19/summit.jpg
image_caption: Description of the image. (Photo: UN Photo)
summary: A short summary of this specific segment.
order: 1
---

## Transcript

HOST: Welcome back to Living on Earth.

GUEST: It's great to be here.

{% audio src="https://cdn.download.ams.birds.cornell.edu/api/v1/asset/176244/audio", label="Northern Cardinal song", duration="0.06-0.10" %}

{% cue text="CROWD CHEERS" %}
```

The two shortcodes:
- **`{% audio src="…", label="…", duration="…" %}`** — inline audio player. `src` can be any MP3 URL or a Macaulay Library CDN URL.
- **`{% cue text="…" %}`** — stage direction / sound cue in a styled italic box. If the text starts with `SPEAKER NAME:`, the label is highlighted.

`order:` is optional — it sorts segments on the show page. Without it, alphabetical filename order is used.

### Image conventions

- Header image: set `image_url` in frontmatter; optional `image_caption` for the caption shown under it.
- Inline images: standard markdown `![Caption](https://example.org/img.jpg)`. If the alt text is non-empty, the image renders as a `<figure>` with a `<figcaption>`.

## Behind the scenes

```
content/
├── shows/<year>/<MM-DD>/show.md        # weekly cover page
├── segments/<year>/<MM-DD>/<slug>.md   # individual stories, paired to show by date
├── newsletters/<YYYY-MM-DD>-<slug>.md  # weekly newsletter
├── pages/<slug>.md                     # standalone pages
├── images/                             # any committed images
├── admin/                              # the CMS
│   ├── index.html
│   ├── preview.html
│   └── config.njk                      # built into /admin/config.yml
├── archive/                            # pre-2025 historical content (built, not CMS-visible)
└── *.njk                               # direct templates (index, archives, newsletter)

eleventy/                               # build config + templates + plugins
ingest/                                 # TypeScript scraper that pulls from loe.org
```

## Markdown cheatsheet

* **Bold**: `**text**` → **text**
* **Italics**: `*text*` → *text*
* **Links**: `[Link Text](https://google.com)`
* **Images**: `![Alt Text](ImageURL)` — non-empty alt text → captioned figure
* **Headers**: `## Section`, `### Sub-section`
* **HTML works**: embed `<iframe>`s, YouTube embeds, anything HTML directly in the body

## Getting help

- **CMS won't load**: check <https://www.githubstatus.com/> — Actions/Pages outages do happen.
- **CMS says "Failed to fetch" after login**: token probably doesn't have `repo` scope. Generate a Classic PAT with full `repo` access.
- **Build failing**: <https://github.com/jarredbarber/loe-vibecode/actions> shows the workflow runs.
- **Anything else**: <https://github.com/jarredbarber/loe-vibecode/issues>

## For developers

See **CLAUDE.md** for the architecture overview, **INGEST.md** for the loe.org scraper, and **INFRA.md** for the services + secrets + migration walkthrough.

## License

Site code: ISC-style permissive. Content licensing per Living on Earth.
