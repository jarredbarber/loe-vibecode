# Eleventy migration

In-progress parallel build alongside Pelican. See https://github.com/jarredbarber/loe-vibecode/issues/2 for the migration plan and progress.

## Running

```bash
cd eleventy
npx @11ty/eleventy            # one-shot build → ../_site_11ty/
npx @11ty/eleventy --serve    # dev server with live reload
npx @11ty/eleventy --incremental  # only rebuild changed inputs
```

## Layout

```
eleventy/
├── .eleventy.js       # main config; input ../content, output ../_site_11ty
├── .eleventyignore    # paths skipped during the incremental port
├── _includes/         # Nunjucks templates
│   ├── layouts/       # base.njk, show.njk, article.njk
│   └── modules/       # partials (segment cards, etc.)
├── _data/             # global data files
└── plugins/           # JS ports of the Pelican plugins
    └── shortcodes.js  # {% audio %} / {% cue %}
```

## What's ported

- [x] Eleventy scaffold + dependencies
- [x] Shortcodes plugin (audio + cue)
- [x] Base layout
- [ ] Article / show / newsletter / page layouts
- [ ] speaker_highlight (transcript-block wrapping)
- [ ] show_segments (auto-discover sibling segments)
- [ ] Theme port (Jinja2 → Nunjucks)
- [ ] Golden tests against Eleventy output
- [ ] Switch deploy.yml

## Rollback

Tag `pre-eleventy-migration` marks the last commit before this work started.

```bash
git reset --hard pre-eleventy-migration
git push --force
```
