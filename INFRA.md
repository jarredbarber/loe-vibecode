# Infrastructure

The site runs on a handful of third-party services. Most are currently tied to the original maintainer's personal accounts. This document lists what's where and how to migrate each service to a new owner.

## Services in use

| Service | What it does | Where it lives | Cost |
|---|---|---|---|
| **GitHub** | Source of truth (this repo) + Actions (CI) + Pages (production hosting at <https://vibingon.earth>) | Repo: `jarredbarber/loe-vibecode`. Pages deploys from the `live` branch. | Free |
| **Cloudflare Pages** | Staging hosting at <https://loe-staging.pages.dev>. Builds on every push to `staging`. | Personal CF account, project `loe-staging`. | Free |
| **Google Gemini API** | LLM copyedit pass on the show-review workflow | Personal Google account; key in repo's `GEMINI_API_KEY` Actions secret | Paid tier (~5¢ per copyedit run; <$5/year at current run frequency) |
| **ntfy.sh** | Push notifications for CI deploy/check results | Public topic `https://ntfy.sh/loe-vibecode` — no account, no secret | Free |

Notes:
- All show audio (Megaphone), images (loe.org host), bird audio (Cornell Macaulay CDN) are URL-only — nothing for us to host or own.
- Editors need push access to the repo; GitHub handles identity.

## Secrets registry

| Secret | Where it lives | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `.env` (gitignored) for local dev + GitHub Actions secret on this repo | `wrangler pages deploy` from the deploy workflow |
| `GEMINI_API_KEY` | GitHub Actions secret on this repo + `.env` for local copyedit runs | `scripts/copyedit-check.mjs` |

## Migrating to a new owner

Goal: replace the personal-account dependencies with org-owned or new-personal accounts without breaking the editor flow.

### 1. GitHub repository

If the repo itself needs to move:

1. **Transfer the repo** (Settings → Danger Zone → Transfer ownership) to the new account/org. URLs at `github.com/<old>/loe-vibecode` redirect for ~1 year; update anyway.
2. Update `eleventy/_data/site.js` (`githubRepo`), the one place that hardcodes `jarredbarber/loe-vibecode`.
3. **GitHub Pages** moves with the transfer; the custom domain `vibingon.earth` (DNS pointing at GH Pages IPs) keeps working.

### 2. Cloudflare Pages (staging)

1. Cloudflare account with an API token scoped to Pages (<https://dash.cloudflare.com/profile/api-tokens>).
2. Create a Pages project named `loe-staging` (direct upload, no git integration).
3. `gh secret set CLOUDFLARE_API_TOKEN` on this repo.

### 3. Gemini API key

The easiest service to migrate.

1. <https://aistudio.google.com/apikey> under the new owner's account.
2. Create a key. The free tier may use prompts for training (LOE didn't want this for the prior key — pick a billing-enabled project to opt out).
3. In GH: `gh secret set GEMINI_API_KEY` (paste new key) — this updates the Actions secret used by the workflow.
4. For local copyedit runs, replace the value in `.env`.
5. Revoke the old key on AI Studio.

## Rotation cadence

There is no scheduled rotation. Rotate a credential if it leaks, an account is decommissioned, or once a year. The migration steps above double as rotation steps; keep the same owner and change only the credentials.

## Pinned dependencies

The GitHub Actions in `.github/workflows/` are pinned to commit SHAs (e.g. `cloudflare/wrangler-action`); bump those via the trailing `# vX` comment + a fresh SHA, ideally with Dependabot.

## CI notifications (ntfy.sh)

Four workflow steps post a push notification to the public [ntfy.sh](https://ntfy.sh) topic `loe-vibecode` on CI completion:

| File | Step | Fires on |
|---|---|---|
| `.github/workflows/deploy.yml` | "Notify ntfy.sh — staging" | Every staging deploy (success or failure), unless triggered via `workflow_dispatch` with `notify: false` (used by the weekly `refresh-recent-window.yml` run) |
| `.github/workflows/deploy.yml` | "Notify ntfy.sh on build failure (prod)" | Build failures on the `live` branch before the deploy-prod job would even run |
| `.github/workflows/deploy.yml` | "Notify ntfy.sh" (in `deploy-prod` job) | Every production deploy (success or failure), same `notify` gate |
| `.github/workflows/check-show.yml` | "Notify ntfy.sh" | Every `check-show` run (manual or auto-triggered by a content push) |

Each step is a bare `curl -s` POST with no auth — `ntfy.sh/loe-vibecode` is a **public, unauthenticated topic**. Anyone who knows (or guesses) the topic name can subscribe to it or publish spoofed messages to it. That's an accepted tradeoff for a low-stakes CI ping. If the topic name ever needs to change, pick something less guessable or migrate to Slack (below).

To watch these notifications: subscribe at <https://ntfy.sh/loe-vibecode> (web) or install the ntfy app and add topic `loe-vibecode`.

### Switching to Slack

The team uses Slack, so migrating off ntfy.sh removes the public-topic exposure and puts notifications where people already look.

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
4. **Priority has no direct Slack equivalent.** ntfy's `Priority: high` pops a phone notification even when muted; Slack has no per-message priority. If failures need to interrupt people, prepend `<!channel>` or `<!here>` to the failure-path text only, not the success path.
5. **Test before removing ntfy**: push to `staging` (or run `deploy.yml` via `workflow_dispatch`) and confirm the Slack message lands in the right channel with correct formatting, for both a success and a forced failure.
6. **Remove ntfy.sh** once Slack is confirmed working: delete the four `curl` steps' ntfy versions (if kept in parallel during testing), drop the `ntfy.sh` row from the Services table above, and update this section to describe Slack instead.

## Other notes

- Local development uses `.env` (gitignored); CI uses GitHub Actions secrets. The two are independent — rotating one doesn't update the other.
