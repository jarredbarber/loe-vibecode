# `/eleventy` — Site build

[Eleventy (11ty)](https://www.11ty.dev/) configuration that builds the LoE site. Templates are Nunjucks. Content lives in `../content/`; output goes to `../_site_11ty/`.

## Commands

```bash
npm ci                                 # one-time, in repo root
npm --prefix eleventy ci               # one-time, in eleventy/

npm --prefix eleventy run build        # one-shot build → ../_site_11ty/
npm --prefix eleventy run dev          # dev server with live reload at :8080
npm --prefix eleventy run incremental  # rebuild only changed inputs (slow on this site — see below)
```

Cold build of the active content set (~500 files): ~5s. Of the full archive (~12K files): ~80s.

## Layout

```
eleventy/
├── .eleventy.js          # config: dirs, plugins, eleventyComputed for layout/permalink
├── _includes/
│   ├── layouts/          # base, article, show, page, newsletter_article
│   ├── modules/          # _article_header, show-segment, stations_map
│   └── us_map.svg        # inlined into stations_map via {% include %}
├── _data/
│   ├── site.js           # global site config (name, urls, github repo/branch)
│   └── recentWindow.js   # rolling date pattern injected into admin/config.yml
└── plugins/
    ├── shortcodes.js     # {% audio %} and {% cue %}
    ├── filters.js        # strftime, ordinal, dayOrdinal, stripQuotes, …
    ├── collections.js    # shows / segments / newsletters collections + segmentsForShow
    └── speaker-highlight.js  # cheerio transform: speaker spans, transcript-blocks, figures
```

## Layout selection

Per-file `layout:` frontmatter wins. Otherwise `.eleventy.js`'s `eleventyComputed.layout` derives it from existing Pelican-era frontmatter:

| Frontmatter | Layout |
|---|---|
| `template: show` | `layouts/show.njk` |
| `template: newsletter_article` | `layouts/newsletter_article.njk` |
| `category: Segments` | `layouts/article.njk` |
| `category: Newsletter` | `layouts/newsletter_article.njk` |
| path under `pages/` | `layouts/page.njk` |
| anything else | `layouts/article.njk` |
| `layout: false` | no wrapping (used by `admin/config.njk`) |

## URLs

Pelican-compatible: `YYYY_MM_DD_<slug>.html` for shows/segments/newsletters, `<slug>.html` for pages. The slug for show files is derived from the title via slugify; for everything else it comes from the `slug:` frontmatter (or filename).

## Incremental builds (caveat)

`--incremental` re-renders all files because every template depends on the `collections.shows` / `collections.segments` globals — any change to a single file changes the collection and invalidates everything. The dominant cost is the `speaker-highlight` transform (~40s of the 80s budget for the full archive). Tighter incremental would require caching transform output keyed on input hash; not worth the maintenance unless the build time becomes a real problem.

## Tests

`npm test` (from repo root) runs `tests/test_render.mjs` against a fixture site. Each test asserts a specific invariant we've broken before. See `tests/fixtures/eleventy.config.js` for the fixture build config.

## Rollback

Tag `pre-eleventy-migration` marks the last Pelican commit if a full revert is ever needed:

```bash
git reset --hard pre-eleventy-migration && git push --force
```
