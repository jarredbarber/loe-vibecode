# `/admin/` — CMS

Sveltia CMS, served from `https://vibingon.earth/admin/`. Editor-facing instructions live in the project root `README.md`; this file is for developers.

## Files

- `index.html` — Sveltia SPA shell + custom editor components for `{% audio %}` and `{% cue %}` shortcodes.
- `config.njk` — built at Eleventy time into `/admin/config.yml`. Uses `{% raw %}` to pass Sveltia's own `{{ }}` template syntax through untouched, with two breakouts for the dynamic date filter regex.
- `preview.html` — companion live-preview page; renders body + frontmatter through markdown-it + a JS port of the shortcode / speaker-highlight logic so editors can see the live look without round-tripping a deploy.

## Authentication

PAT only. Editors paste a GitHub Personal Access Token with `repo` scope. Token stays in browser localStorage.

The "Sign in with GitHub" button on Sveltia's login screen points at Netlify's auth proxy and **does not work** — we're on GitHub Pages, not Netlify. Editors need to use **Sign in with Token**. Issue [#6](https://github.com/jarredbarber/loe-vibecode/issues/6) tracks deploying an OAuth proxy to fix this if we ever onboard more editors.

## Collections

| Collection | Folder | Visible scope |
|---|---|---|
| Shows | `content/shows` | Current ±2 months (rolling) |
| Segments | `content/segments` | Same rolling window |
| Newsletters | `content/newsletters` | All |
| Pages | `content/pages` | All |

The shows + segments rolling window is computed at build time by `eleventy/_data/recentWindow.js` and injected into `config.njk`. Older content stays in `archive/` (not deployed, not CMS-visible).

## Local preview

The CMS is deployed alongside the site. To poke at it locally:

```bash
npm --prefix eleventy run dev
# open http://localhost:8080/admin/
```

PAT auth works against `localhost` too — Sveltia hits api.github.com directly.

## Custom editor components

`index.html` registers two `CMS.registerEditorComponent`s:

- **`audio`** — toolbar button for inserting `{% audio src="..." label="..." duration="..." %}`. Form-driven; inline preview renders the same `.music-cue-item` markup the live site uses.
- **`cue`** — toolbar button for `{% cue text="..." %}`. Auto-detects speaker patterns.

If you change the live-site rendering of these shortcodes, update the inline `toPreview` handlers so the editor preview stays accurate.

## Backing-store gotchas

- Sveltia fetches the full git tree on init. With many thousands of files in a collection's `folder`, the editor fails with "Failed to fetch". The rolling window keeps the active collections under 1000 files combined.
- Sveltia stores draft backups in IndexedDB (`draft-backups` store, composite key `[collectionName, slug]`), but it does **not** auto-save — drafts only land in IndexedDB on explicit save. The companion preview page falls back to paste-mode for that reason.

## Runbook: CMS getting slow / "Failed to fetch"

Sveltia walks every file under a collection's `folder:` on init. It tolerates ~1k files per collection; past that it starts failing. New shows accumulate at ~250 files/year (1 show + ~5 segments × 52 weeks), so eventually `content/shows/` or `content/segments/` will overflow.

**Fix**: move the oldest year(s) of active content into the archive. Eleventy keeps building them; Sveltia stops seeing them.

```bash
# Example: drop 2025 out of CMS view, keep it on the live site
git mv content/shows/2025    content/archive/shows/2025
git mv content/segments/2025 content/archive/segments/2025
git commit -m "Archive 2025 content (CMS scope reduction)"
git push
```

**Why this works**:
- Sveltia's `folder: content/shows` is an exact path — it does *not* recurse into `content/archive/shows/`. So moved files vanish from the CMS.
- Eleventy's `dir.input` is `../content`, which walks recursively — `content/archive/**` still builds. Live URLs (`/2025_*.html`) keep working.
- No layout changes needed: the `template:`/`category:` frontmatter on each file drives layout selection via `.eleventy.js`'s `eleventyComputed`, independent of path.

**Don't**:
- Don't try to scope `folder:` to a single year (e.g. `content/shows/2026`). Editors prepping content for the next year would write to the wrong directory — Sveltia concatenates `folder + path` at create time, so the folder's year wins over the entry's date.
- Don't move newsletters/pages — those collections are small and stay scoped to `content/{newsletters,pages}` indefinitely.

After moving, editing the archived content goes through GitHub directly (the `Edit on GitHub` badge on each page still works).
