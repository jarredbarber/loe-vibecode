# Living on Earth — Editor (admin UI)

Sveltia CMS instance mounted at `/admin/` on staging deploys.

## Status

**Currently in test mode** (`backend: test-repo` in `config.yml`). Anyone visiting `/admin/` can poke at the UI; nothing commits anywhere.

## Gating

Whether the admin UI is included in a build is controlled by the `STAGING` env var in `site_config.py`. When `STAGING=true`, `content/admin/` is added to `STATIC_PATHS` and copied to `_site/admin/`. When unset (production), the directory is excluded and `/admin/` 404s.

## To go live (GitHub backend)

1. Stand up a Cloudflare Worker as the OAuth proxy. Sveltia's docs have a reference Worker (~30 lines).
2. Register a GitHub OAuth app at https://github.com/settings/developers — set Authorization callback URL to the Worker URL.
3. Edit `config.yml`: comment out the `test-repo` backend, uncomment the `github` backend, fill in `base_url` with the Worker URL.
4. Each editor needs a GitHub account with write access to the repo.
5. Commit and deploy.

## Local dev

```bash
STAGING=true pelican content -s site_config.py
python -m http.server -d _site 8000
# visit http://localhost:8000/admin/
```

## Schema

Four collections: **shows**, **segments**, **newsletters**, **pages**. See `config.yml` for fields. Custom editor components for `{% audio %}` and `{% cue %}` shortcodes are registered in `index.html`.

Segments are auto-discovered by the `show_segments` Pelican plugin from sibling .md files in each show's date folder. Creating a segment via the CMS automatically makes it appear on the parent show page.
