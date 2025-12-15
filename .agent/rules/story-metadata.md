---
trigger: always_on
description: working with show or segment content files, or archive scraping.
---

The show and segment pages have the following metadata fields:

```yaml
---
title: Show / Segment title
date: <show air date>
category: Either "Shows" or "Segment"
template: show or show-segment
megaphone_id: <megaphone ID, i.e. LOE3444516140>
audio_url: <possible URL for >
banner_url: <Primary banner image URL>
thumb_url: <Square / thumbnail` image URL>
image_caption: <Caption and attribution for the image>
summary: <Show tagline or segment summary>
length: <length of audio file as MM:SS>
host: <name(s) of the host or hosts>
---
```

For shows, the the archive page has the title of each show.

The best (but still imperfect) example is the show in `content/shows/2025/12-12`

Recent (past 2 months) shows go in shows/

Older shows go in archive/<year>/<month>

Each folder should have a `show.md` file with the main show, and then other markdown files for each segment.

The scrape_archive.py script is a work in progress and does not properly populate all of the fields for all input years.

Some older years may not have complete metadata.

I have metadata fields for both a banner URL and a thumbnail URL, but I'm not sure if there are more versions of the banner image present in the pages. We can revise the schema if needed.

Each show.md contains metadata and links to the segments in the order that they appear in the main show audio. Each segment contains a transcript and possibly other things like a section of links.




