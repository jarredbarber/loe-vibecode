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
