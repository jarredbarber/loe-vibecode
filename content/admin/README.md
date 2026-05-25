# Living on Earth — Editor (admin UI)

Sveltia CMS instance mounted at `/admin/` on staging deploys.

## Status

**Live in PAT mode** (`backend: github`). Editors visit `/admin/`, click **Sign in with Token**, and paste a GitHub Personal Access Token. Commits land on `main` directly.

### Editor sign-in (one-time per editor)

1. Visit `https://vibingon.earth/admin/`
2. Click **Sign in with Token**
3. Click the GitHub link in the dialog — it deep-links you to GitHub's PAT generation page with the `repo` scope pre-selected
4. Generate token (recommend no expiry for convenience, or 90 days)
5. Copy + paste back into the dialog
6. Done — token is stored in browser localStorage, future visits skip the prompt

## Gating

Whether the admin UI is included in a build is controlled by the `STAGING` env var in `site_config.py`. When `STAGING=true`, `content/admin/` is added to `STATIC_PATHS` and copied to `_site/admin/`. When unset (production), the directory is excluded and `/admin/` 404s.

## To switch to proper OAuth (optional)

PAT mode works fine for small teams but each editor manages their own token. For "Sign in with GitHub" button + Google-style OAuth flow:

1. Deploy [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) as a Cloudflare Worker (~10 min, instructions in that repo)
2. Register a GitHub OAuth app at https://github.com/settings/developers — callback URL = the deployed Worker URL
3. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as Worker env vars
4. Add `base_url: https://<your-worker>.workers.dev` to the `backend:` block in `config.yml`
5. Commit and deploy

## Local dev

```bash
STAGING=true pelican content -s site_config.py
python -m http.server -d _site 8000
# visit http://localhost:8000/admin/
```

## Schema

Four collections: **shows**, **segments**, **newsletters**, **pages**. See `config.yml` for fields. Custom editor components for `{% audio %}` and `{% cue %}` shortcodes are registered in `index.html`.

Segments are auto-discovered by the `show_segments` Pelican plugin from sibling .md files in each show's date folder. Creating a segment via the CMS automatically makes it appear on the parent show page.
