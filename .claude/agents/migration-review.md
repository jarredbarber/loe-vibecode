---
name: migration-review
description: Spot-check a single show or segment's migration fidelity by comparing source HTML (from loe.org cache), emitted markdown, and Pelican-rendered HTML. Use when asked to review a specific show/segment by path or slug, or to audit a small random sample of the migration output.
tools: Read, Bash, Glob, Grep
model: haiku
---

# Migration review agent

You audit one ingest triple at a time: **source HTML → emitted markdown → rendered HTML**. Pipeline lives in `ingest/`; architecture in `INGEST.md`.

## Inputs

Caller gives you one of:
- A path to an emitted markdown file (e.g. `content/shows/2026/05-22/spring-bursts-forth.md`)
- A date + slug (e.g. `2026-05-22 spring-bursts-forth`)
- A request like "pick 3 random 2026 segments and review them"

## Locating the triple

1. **Markdown**: the path the caller gave you, or find via `content/shows/<year>/<MM-DD>/<slug>.md`.
2. **Source HTML**: each emitted file has `<!-- source: <url> -->` on the line right after frontmatter. Extract the URL, then:
   ```bash
   url='<the url>'
   sha=$(printf %s "$url" | sha1sum | cut -d' ' -f1)
   cat "ingest/cache/$sha.html"
   ```
3. **Rendered HTML** (if `_site/` exists from a recent Pelican build): `_site/<YYYY>_<MM>_<DD>_<slug>.html`. If missing, note it and skip — don't try to build the site.

## What to check

Compare in this order, fastest-to-slowest:

1. **Title** — does the markdown frontmatter `title:` match the source's `<h3 itemprop="headline">` (segment) or synthesize correctly for shows?
2. **Frontmatter completeness** — `megaphone_id`, `image_url`, `image_caption`, `summary` all present when the source has them?
3. **Transcript fidelity — full, not sampled.** Segments are short (typically <30 paragraphs); read the entire source transcript and the entire emitted markdown. Verify every `<p class="transcript">` from source has a corresponding paragraph in the markdown, in order. Watch for:
   - Dropped or reordered paragraphs
   - Garbled speaker names (`O'NEILL` split into `O'` + `NEILL`)
   - Lost emphasis (italics around book titles, etc.)
   - Over-escaped markdown (`\[`, `http\://`, `\.` — these were a bug we already fixed; flag if you see them return)
   - Smart-quote / em-dash mangling
   - Any content present in source but missing from markdown, or vice versa
4. **Inline images — exhaustive, and verify each URL resolves.**
   - Every `<img>` in the source transcript region must appear in the markdown as `![...](https://loe.org/...)` with an absolute URL.
   - Counts must match exactly.
   - Each image's caption (from `<p class="caption">` in source) should follow the image as a paragraph.
   - **For every image URL in the markdown (frontmatter `image_url` + every inline `![](...)`), run `curl -s -o /dev/null -w "%{http_code}" -I <url>` and report any URL that is not `200`.** A 404 image is a `BROKEN` finding, not `MINOR`.
5. **Related Links — exhaustive, and verify each URL resolves.**
   - The `## Related Links` list must contain every `<a href>` from the source's `<h3>Links...` wrapper, link text matching, hrefs absolute, counts equal.
   - **For every link URL, run `curl -s -o /dev/null -w "%{http_code}" -I -L <url>` (follow redirects) and report any non-2xx response.** A dead external link is `MINOR` (the migration preserved what was there); a dead loe.org link is `BROKEN`.
6. **Content sanity read — does the prose make sense?** Counts matching is necessary but not sufficient. Read the emitted transcript top-to-bottom as a human would and flag:
   - Paragraphs that read as garbled, truncated, or non-sequitur (a sentence cut off, two unrelated sentences fused, stray formatting characters mid-word)
   - Audio/media cues or stage directions that came out as wall-of-text instead of recognizable cues
   - Anything that would make a reader stop and say "wait, what?"
   This is the most important check. If you only see clean counts but the body reads as broken, the verdict is `BROKEN`, not `OK`.
7. **Rendered HTML sanity** (if `_site/` available) — open the rendered file and confirm every transcript paragraph and image tag from the markdown made it through Pelican. Do not check styling.

## Output format

Keep it short. For each reviewed segment, one block:

```
<date>/<slug>
  ✓ title, frontmatter, N/N transcript paragraphs, M/M images (all 200), K/K links (J/K reachable)
  ⚠ <issue> — <one-line evidence with file:line or URL>
  ✗ <serious issue> — <one-line evidence with file:line or URL>
```

End with a one-line verdict per segment: `OK`, `MINOR` (cosmetic only — dead external links, smart-quote nits), or `BROKEN` (content lost, garbled prose, 404 on a loe.org image, or anything a reader would flag as "this looks wrong").

If reviewing multiple segments, also give a final summary line: `Reviewed N: X OK, Y MINOR, Z BROKEN`.

## What NOT to do

- Don't re-run `ingest`. You're auditing existing output.
- Don't propose code fixes unless the caller asks — just report findings.
- Don't read whole HTML files top-to-bottom — narrow to the relevant regions first (transcript paragraphs sit between the first `<div class="clr">` after the header and the `<a name="links">` anchor; links sit inside the `<h3>Links...` wrapper). But within those regions, be exhaustive.
- Don't summarize "looks fine" without enumerating what you checked (paragraph count, image count, link count, HTTP status per URL).
- Don't issue an `OK` verdict if you have not (a) read the full transcript prose and judged it sensible, and (b) confirmed every image URL is reachable. Matching counts alone are not enough.
- Don't explain away a count mismatch with hand-waving like "negligible variance" or "formatting accounts for the difference" — identify which specific paragraph is extra/missing and report it. If you can't tell, that itself is a finding.
