# Infrastructure

The site runs on a handful of third-party services. Most are currently tied to the original maintainer's personal accounts. This document explains what's where and how to migrate any of it to a new owner.

## Services in use

| Service | What it does | Where it lives | Cost |
|---|---|---|---|
| **GitHub** | Source of truth (this repo) + Actions (CI) + Pages (hosting of <https://vibingon.earth>) | Repo: `jarredbarber/loe-vibecode` | Free |
| **Cloudflare Workers** | OAuth proxy for the CMS at `loe-auth.<account>.workers.dev`. Source: `auth/` in this repo. | Personal CF account (account ID `85c72026550c41387ad9a84663882bcd`, subdomain `hector-ea`) | Free tier covers expected usage (hundreds of auth requests/month) |
| **GitHub OAuth App** | "Sign in with GitHub" button in the CMS | Personal OAuth app under <https://github.com/settings/developers>. Client ID `Ov23lisr51ryjbB0GmxZ` | Free |
| **Google Gemini API** | LLM copyedit pass on the show-review workflow | Personal Google account; key in repo's `GEMINI_API_KEY` Actions secret | Paid tier (~5¢ per copyedit run; <$5/year at current run frequency) |

Notes:
- All show audio (Megaphone), images (loe.org host), bird audio (Cornell Macaulay CDN) and the GitHub OAuth flow are URL-only — nothing for us to host or own.
- Editors don't sign up for anything; the OAuth app handles their access transparently. The collaborator check (in `auth/src/index.js`) gates the CMS to people with push access to the repo.

## Secrets registry

| Secret | Where it lives | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `.env` (gitignored), local dev only | `wrangler deploy` from `auth/` |
| `GITHUB_CLIENT_ID` | CF Worker secret on `loe-auth` | OAuth dance |
| `GITHUB_CLIENT_SECRET` | CF Worker secret on `loe-auth` | OAuth dance |
| `GEMINI_API_KEY` | GitHub Actions secret on this repo + `.env` for local copyedit runs | `scripts/copyedit-check.mjs` |

## Migrating to a new owner

Goal: replace the personal-account dependencies with org-owned or new-personal accounts without breaking the editor flow.

### 1. GitHub repository

If the repo itself needs to move:

1. **Transfer the repo** (Settings → Danger Zone → Transfer ownership) to the new account/org. URLs at `github.com/<old>/loe-vibecode` redirect for ~1 year; update anyway.
2. Update three places that hardcode `jarredbarber/loe-vibecode`:
   - `eleventy/_data/site.js` (`githubRepo`)
   - `auth/wrangler.toml` (`ALLOWED_REPO`)
   - `content/admin/config.njk` (`backend.repo`)
3. **GitHub Pages** moves with the transfer; the custom domain `vibingon.earth` (DNS pointing at GH Pages IPs) keeps working.

### 2. Cloudflare Worker (OAuth proxy)

Each step is mechanical. Total time: ~10 minutes.

1. Sign up for a Cloudflare account if the new owner doesn't have one (free).
2. Get an API token from <https://dash.cloudflare.com/profile/api-tokens> with the "Edit Cloudflare Workers" template scope.
3. Put it in `.env` as `CLOUDFLARE_API_TOKEN=…` (gitignored).
4. From `auth/`: `CLOUDFLARE_API_TOKEN=… wrangler deploy`. The worker deploys under the new account's `*.workers.dev` subdomain.
5. Note the new URL (something like `loe-auth.<new-subdomain>.workers.dev`).
6. Push the two OAuth secrets to the new worker (see step 3 below for getting them):
   ```bash
   echo "<client-id>" | wrangler secret put GITHUB_CLIENT_ID
   echo "<client-secret>" | wrangler secret put GITHUB_CLIENT_SECRET
   ```
7. Update `content/admin/config.njk` — replace `base_url: https://loe-auth.hector-ea.workers.dev` with the new URL.
8. Update `content/admin/README.md` and this file with the new account ID/subdomain for future reference.

### 3. GitHub OAuth App

The OAuth app belongs to whoever registered it. Migration = create new, delete old.

1. <https://github.com/settings/applications/new> (under the new owner's account, or under a GitHub org if you want shared ownership).
2. Application name: `Living on Earth CMS`.
3. Homepage URL: `https://vibingon.earth`.
4. Authorization callback URL: `https://<new-worker-url>/callback`.
5. After registering, copy the **Client ID** and **Generate a new client secret** — both are needed for the worker secrets in step 2.6.
6. Delete the old OAuth app at <https://github.com/settings/developers> once the new one is verified working.

### 4. Gemini API key

Cheapest service to migrate.

1. <https://aistudio.google.com/apikey> under the new owner's account.
2. Create a key. The free tier may use prompts for training (LOE didn't want this for the prior key — pick a billing-enabled project to opt out).
3. In GH: `gh secret set GEMINI_API_KEY` (paste new key) — this updates the Actions secret used by the workflow.
4. For local copyedit runs, replace the value in `.env`.
5. Revoke the old key on AI Studio.

## Rotation cadence

There is no scheduled rotation. Rotate any of these credentials if they leak, an account is decommissioned, or once a year as housekeeping. The migration steps above are also the rotation steps (just keep the same owner — only the credentials change).

## What's NOT documented elsewhere

- The `ALLOWED_DOMAINS` setting in `auth/wrangler.toml` restricts the worker so it can't be used as a generic OAuth proxy for unrelated sites. If we add a staging domain (see issue #36), add it there.
- `ALLOWED_REPO` in `auth/wrangler.toml` gates token issuance to repo collaborators. GitHub enforces write access at the API level too — this is purely UX.
- Local development uses `.env` (gitignored); CI uses GitHub Actions secrets. The two are independent — rotating one doesn't update the other.
