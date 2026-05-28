# `/auth` — CMS authentication worker

A small [Cloudflare Worker](https://workers.cloudflare.com/) that handles "Sign in with GitHub" for the Sveltia CMS at `/admin/`. Without it, editors would have to paste a GitHub Personal Access Token manually every session.

When an editor clicks "Sign in with GitHub", the CMS redirects them through this worker, which completes the OAuth handshake with GitHub and passes a token back to the CMS.

The worker also serves `GET /podcast.rss` — a cached proxy for the Megaphone podcast feed, so the static site doesn't need to bundle a 33K-line RSS mirror.

## Who needs to touch this

Rarely. The worker runs continuously on Cloudflare's free tier and doesn't need maintenance. You'd only come here to:

- Rotate the GitHub OAuth app credentials
- Add a new allowed domain (e.g. a new preview URL)
- Deploy after changes to `src/index.js`

## Deploying

Requires [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) and a Cloudflare account with the right permissions.

```bash
cd auth
npm ci
npx wrangler deploy          # deploy latest code
```

Secrets are stored in Cloudflare (not in this repo) and must be set once per worker:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

The allowed domains and repo are set as plain `[vars]` in `wrangler.toml` and can be edited there directly.

## GitHub OAuth app

The OAuth app lives at **GitHub → Settings → Developer settings → OAuth Apps → LOE CMS**. The Client ID and Secret from there are what get loaded as secrets above. If you ever need to reset the secret, generate a new one in GitHub and re-run `wrangler secret put GITHUB_CLIENT_SECRET`.
