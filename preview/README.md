# LoE CMS Preview Service

Tiny FastAPI app that renders a single markdown body through the same Pelican
plugin chain as the live build — so the Sveltia CMS preview pane shows
exactly what will end up on the public site.

## How it works

```
Sveltia CMS preview pane  →  POST /preview { body, frontmatter, collection }
        ↑                              │
        │                              ↓
        └─── { html: "..." }   ←  speaker_highlight + shortcodes plugins
```

The plugins live in `../plugins/`. The Dockerfile copies both `app.py` and
`plugins/` into the image; a small `pelican` import stub in `app.py` lets the
plugins import without the full Pelican framework.

## Deploy to Fly.io

One-time setup:

```bash
fly auth login
fly launch --config preview/fly.toml --no-deploy
```

(Or edit `app = "loe-cms-preview"` in `fly.toml` to whatever name Fly
suggests when you launch.)

Deploys:

```bash
fly deploy --config preview/fly.toml --dockerfile preview/Dockerfile
```

After the first deploy you get a URL like `https://loe-cms-preview.fly.dev`.
Verify:

```bash
curl -X POST https://loe-cms-preview.fly.dev/preview \
  -H "Content-Type: application/json" \
  -d '{"body": "CURWOOD: Hello world.\n\n{% audio src=\"https://example.org/x.mp3\" label=\"Bird\" %}"}'
```

## Wiring it into Sveltia

In `content/admin/index.html`, register a `CMS.registerPreviewTemplate` that
fetches from this URL and renders the returned HTML inside a div with the
site's CSS loaded via `CMS.registerPreviewStyle('/theme/css/style.css')`.

## Cost

Fly's free tier covers this easily — 256MB VM, scales to zero when idle.
Cold-start ~2 seconds; warm requests ~50ms.

## Local dev

```bash
cd preview
pip install -r requirements.txt
uvicorn app:app --reload
# POST to http://localhost:8000/preview
```
