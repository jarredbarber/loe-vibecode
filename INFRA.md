# Infrastructure

The site runs on a handful of third-party services. Most are currently tied to the original maintainer's personal accounts. This document explains what's where and how to migrate any of it to a new owner.

## Services in use

| Service | What it does | Where it lives | Cost |
|---|---|---|---|
| **GitHub** | Source of truth (this repo) + Actions (CI) + Pages (production hosting at <https://vibingon.earth>) | Repo: `jarredbarber/loe-vibecode`. Pages deploys from the `live` branch. | Free |
| **Cloudflare Pages** | Staging hosting at <https://loe-staging.pages.dev>. Builds on every push to `main`. | Personal CF account, project `loe-staging`. | Free |
| **Cloudflare Workers** | OAuth proxy for the CMS at `loe-auth.<account>.workers.dev`. Source: `auth/` in this repo. | Personal CF account (account ID `85c72026550c41387ad9a84663882bcd`, subdomain `hector-ea`) | Free tier covers expected usage (hundreds of auth requests/month) |
| **GitHub OAuth App** | "Sign in with GitHub" button in the CMS | Personal OAuth app under <https://github.com/settings/developers>. Client ID `Ov23lisr51ryjbB0GmxZ` | Free |
| **Google Gemini API** | LLM copyedit pass on the show-review workflow | Personal Google account; key in repo's `GEMINI_API_KEY` Actions secret | Paid tier (~5¢ per copyedit run; <$5/year at current run frequency) |
| **ntfy.sh** | Push notifications for CI deploy/check results | Public topic `https://ntfy.sh/loe-vibecode` — no account, no secret | Free |

Notes:
- All show audio (Megaphone), images (loe.org host), bird audio (Cornell Macaulay CDN) and the GitHub OAuth flow are URL-only — nothing for us to host or own.
- Editors don't sign up for anything; the OAuth app handles their access transparently. The collaborator check (in `auth/src/index.js`) gates the CMS to people with push access to the repo.

## Secrets registry

| Secret | Where it lives | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `.env` (gitignored) for local dev + GitHub Actions secret on this repo | `wrangler deploy` from `auth/`; `wrangler pages deploy` from the deploy workflow |
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

## Upgrading the Sveltia CMS (pinned + SRI)

The CMS script in `content/admin/index.html` is pinned to an exact version with a Subresource Integrity hash, so a compromised CDN/package can't run swapped-out JS in an editor's authenticated session:

```html
<script src="https://unpkg.com/@sveltia/cms@0.166.0/dist/sveltia-cms.js" type="module"
    integrity="sha384-…" crossorigin="anonymous"></script>
```

Because the hash is tied to the exact bytes, **bumping the version means recomputing the hash** — otherwise the browser blocks the script and the CMS silently fails to load. To upgrade:

1. Pick the new version (`npm view @sveltia/cms version` for latest).
2. Recompute the integrity hash for that exact version:
   ```bash
   curl -sL "https://unpkg.com/@sveltia/cms@<VERSION>/dist/sveltia-cms.js" \
     | openssl dgst -sha384 -binary | openssl base64 -A
   ```
3. Update **both** the `@<VERSION>` in the `src` and the `integrity="sha384-<hash>"` in `content/admin/index.html`.
4. Push to `staging` and confirm `loe-staging.pages.dev/admin/` still loads (SRI is strict — a wrong hash = blank CMS). Production has no `/admin/`, so this only ever affects staging.

The GitHub Actions in `.github/workflows/` are likewise pinned to commit SHAs (e.g. `cloudflare/wrangler-action`); bump those via the trailing `# vX` comment + a fresh SHA, ideally with Dependabot.

## CI notifications (ntfy.sh)

Four workflow steps post a push notification to the public [ntfy.sh](https://ntfy.sh) topic `loe-vibecode` on CI completion:

| File | Step | Fires on |
|---|---|---|
| `.github/workflows/deploy.yml` | "Notify ntfy.sh — staging" | Every staging deploy (success or failure), unless triggered via `workflow_dispatch` with `notify: false` (used by the weekly `refresh-recent-window.yml` run) |
| `.github/workflows/deploy.yml` | "Notify ntfy.sh on build failure (prod)" | Build failures on the `live` branch before the deploy-prod job would even run |
| `.github/workflows/deploy.yml` | "Notify ntfy.sh" (in `deploy-prod` job) | Every production deploy (success or failure), same `notify` gate |
| `.github/workflows/check-show.yml` | "Notify ntfy.sh" | Every `check-show` run (manual or auto-triggered by a content push) |

Each step is a bare `curl -s` POST with no auth — `ntfy.sh/loe-vibecode` is a **public, unauthenticated topic**. Anyone who knows (or guesses) the topic name can subscribe to it or publish spoofed messages to it. That's an accepted tradeoff for a low-stakes CI ping, but it's worth knowing if the topic name ever needs to change (pick something less guessable, or migrate to Slack below).

To watch these notifications: subscribe at <https://ntfy.sh/loe-vibecode> (web) or install the ntfy app and add topic `loe-vibecode`.

### Switching to Slack

The team uses Slack, so migrating off ntfy.sh removes the public-topic exposure and puts notifications where people already look. Steps:

1. **Create a Slack incoming webhook** for the target channel: <https://api.slack.com/messaging/webhooks> → create/select a Slack app → enable "Incoming Webhooks" → "Add New Webhook to Workspace" → pick the channel → copy the webhook URL (`https://hooks.slack.com/services/...`).
2. **Store it as a repo secret**: `gh secret set SLACK_WEBHOOK_URL` (paste the URL). Add a row to the Secrets registry table above once done.
3. **Replace each of the four `curl` blocks.** ntfy uses custom headers (`Title`, `Tags`, `Priority`, `Click`) plus a plain-text body; Slack's incoming-webhook API takes a JSON payload with a `text` field. For example, the staging-deploy step becomes:

   ```yaml
   - name: Notify Slack — staging
     if: always() && steps.pick.outputs.target == 'staging' && (failure() || github.event.inputs.notify != 'false')
     run: |
       STATUS='${{ job.status }}'
       [ "$STATUS" = success ] && EMOJI=":white_check_mark:" || EMOJI=":rotating_light:"
       curl -s -X POST -H 'Content-type: application/json' \
         --data "{\"text\":\"$EMOJI LOE staging deploy: $STATUS — staging (loe-staging.pages.dev) ${GITHUB_REF_NAME}@${GITHUB_SHA::7} — <$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID|view run>\"}" \
         "$SLACK_WEBHOOK_URL"
     env:
       SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
   ```

   Apply the same shape (swap the `Title`/body text and emoji) to the other three steps in `deploy.yml` and the one in `check-show.yml`. Slack's `<url|text>` syntax replaces ntfy's `Click` header for the linked "view run" text.
4. **Priority has no direct Slack equivalent.** ntfy's `Priority: high` pops a phone notification even when muted; Slack has no per-message priority. If failures need to interrupt people, prepend `<!channel>` or `<!here>` to the failure-path text (don't add it to the success path — that defeats the point).
5. **Test before removing ntfy**: push to `staging` (or run `deploy.yml` via `workflow_dispatch`) and confirm the Slack message lands in the right channel with correct formatting, for both a success and a forced failure.
6. **Remove ntfy.sh** once Slack is confirmed working: delete the four `curl` steps' ntfy versions (if kept in parallel during testing), drop the `ntfy.sh` row from the Services table above, and update this section to describe Slack instead.

## What's NOT documented elsewhere

- The `ALLOWED_DOMAINS` setting in `auth/wrangler.toml` restricts the worker so it can't be used as a generic OAuth proxy for unrelated sites. If we add a staging domain (see issue #36), add it there.
- `ALLOWED_REPO` in `auth/wrangler.toml` gates token issuance to repo collaborators. GitHub enforces write access at the API level too — this is purely UX.
- Local development uses `.env` (gitignored); CI uses GitHub Actions secrets. The two are independent — rotating one doesn't update the other.
