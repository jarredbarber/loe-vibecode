/**
 * OAuth proxy for Sveltia CMS.
 *
 * VENDORED SOURCE
 * ---------------
 * This file is a vendored copy of sveltia-cms-auth, with local modifications
 * applied on top.
 *
 *   Upstream: https://github.com/sveltia/sveltia-cms-auth/blob/main/src/index.js
 *   License:  MIT
 *   Version:  version unknown, vendored 2025-04 (based on feature set matching
 *             the README at that time; no explicit release tag was pinned)
 *
 * LOCAL MODIFICATIONS
 * -------------------
 * 1. Collaborator check (isCollaborator function, ~lines 275–295):
 *    After a successful GitHub token exchange, we verify the authenticated user
 *    is a collaborator on the repo named in the ALLOWED_REPO env var. If not,
 *    the token is withheld and an error page is returned. This is a UX gate —
 *    GitHub enforces write access at the API level regardless — but it prevents
 *    curious visitors from entering /admin/ only to discover they can't publish.
 *    Env var: ALLOWED_REPO (e.g. "jarredbarber/loe-vibecode"); omit to skip check.
 *
 * 2. GitHub scope narrowed to "public_repo,user" (line ~100):
 *    Upstream requests "repo" (full private access). We only need public_repo
 *    since this is a public repository.
 *
 * 3. Megaphone RSS proxy (handlePodcastRss, ~lines 302–326):
 *    Extra route GET /podcast.rss that proxies the Megaphone feed. This is
 *    unrelated to auth; it's co-located here because the Worker already exists.
 *
 * HOW TO UPDATE
 * -------------
 * 1. Fetch the latest upstream index.js:
 *      curl -O https://raw.githubusercontent.com/sveltia/sveltia-cms-auth/main/src/index.js
 * 2. Diff against this file to identify changes upstream made:
 *      diff index.js auth/src/index.js
 * 3. Copy the new upstream content into auth/src/index.js, then manually
 *    re-apply each local modification listed above.
 * 4. Update the "Version" line in this header with today's date.
 * 5. Run `wrangler deploy` from auth/ to push the updated Worker.
 *
 * Deployed as a Cloudflare Worker so editors can use "Sign in with GitHub"
 * from /admin/ instead of pasting a PAT.
 *
 * Required env (set via `wrangler secret put`):
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 * Optional:
 *   ALLOWED_DOMAINS   comma-separated, supports `*` wildcard
 *   ALLOWED_REPO      owner/repo to gate collaborator check (e.g. "jarredbarber/loe-vibecode")
 */

const supportedProviders = ['github', 'gitlab'];

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const outputHTML = ({ provider = 'unknown', token, error, errorCode }) => {
    const state = error ? 'error' : 'success';
    const content = error ? { provider, error, errorCode } : { provider, token };

    return new Response(
        `
      <!doctype html><html><body><script>
        (() => {
          window.addEventListener('message', ({ data, origin }) => {
            if (data === 'authorizing:${provider}') {
              window.opener?.postMessage(
                'authorization:${provider}:${state}:${JSON.stringify(content)}',
                origin
              );
            }
          });
          window.opener?.postMessage('authorizing:${provider}', '*');
        })();
      </script></body></html>
    `,
        {
            headers: {
                'Content-Type': 'text/html;charset=UTF-8',
                'Set-Cookie': `csrf-token=deleted; HttpOnly; Max-Age=0; Path=/; SameSite=Lax; Secure`,
            },
        },
    );
};

const handleAuth = async (request, env) => {
    const { url } = request;
    const { origin, searchParams } = new URL(url);
    const { provider, site_id: domain } = Object.fromEntries(searchParams);

    if (!provider || !supportedProviders.includes(provider)) {
        return outputHTML({
            error: 'Your Git backend is not supported by the authenticator.',
            errorCode: 'UNSUPPORTED_BACKEND',
        });
    }

    const {
        ALLOWED_DOMAINS,
        GITHUB_CLIENT_ID,
        GITHUB_CLIENT_SECRET,
        GITHUB_HOSTNAME = 'github.com',
        GITLAB_CLIENT_ID,
        GITLAB_CLIENT_SECRET,
        GITLAB_HOSTNAME = 'gitlab.com',
    } = env;

    if (
        ALLOWED_DOMAINS &&
        !ALLOWED_DOMAINS.split(/,/).some((str) =>
            (domain ?? '').match(new RegExp(`^${escapeRegExp(str.trim()).replace('\\*', '.+')}$`)),
        )
    ) {
        return outputHTML({
            provider,
            error: 'Your domain is not allowed to use the authenticator.',
            errorCode: 'UNSUPPORTED_DOMAIN',
        });
    }

    const csrfToken = globalThis.crypto.randomUUID().replaceAll('-', '');
    let authURL = '';

    if (provider === 'github') {
        if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
            return outputHTML({
                provider,
                error: 'OAuth app client ID or secret is not configured.',
                errorCode: 'MISCONFIGURED_CLIENT',
            });
        }

        const params = new URLSearchParams({
            client_id: GITHUB_CLIENT_ID,
            // loe-vibecode is public, so public_repo is sufficient. Tokens
            // still cover all of the editor's public repos (an OAuth-App
            // limitation; true per-repo scoping requires GitHub Apps,
            // which Sveltia doesn't natively support).
            scope: 'public_repo,user',
            state: csrfToken,
        });

        authURL = `https://${GITHUB_HOSTNAME}/login/oauth/authorize?${params.toString()}`;
    }

    if (provider === 'gitlab') {
        if (!GITLAB_CLIENT_ID || !GITLAB_CLIENT_SECRET) {
            return outputHTML({
                provider,
                error: 'OAuth app client ID or secret is not configured.',
                errorCode: 'MISCONFIGURED_CLIENT',
            });
        }

        const params = new URLSearchParams({
            client_id: GITLAB_CLIENT_ID,
            redirect_uri: `${origin}/callback`,
            response_type: 'code',
            scope: 'api',
            state: csrfToken,
        });

        authURL = `https://${GITLAB_HOSTNAME}/oauth/authorize?${params.toString()}`;
    }

    return new Response('', {
        status: 302,
        headers: {
            Location: authURL,
            'Set-Cookie':
                `csrf-token=${provider}_${csrfToken}; ` +
                `HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`,
        },
    });
};

const handleCallback = async (request, env) => {
    const { url, headers } = request;
    const { origin, searchParams } = new URL(url);
    const { code, state } = Object.fromEntries(searchParams);

    const [, provider, csrfToken] =
        headers.get('Cookie')?.match(/\bcsrf-token=([a-z-]+?)_([0-9a-f]{32})\b/) ?? [];

    if (!provider || !supportedProviders.includes(provider)) {
        return outputHTML({
            error: 'Your Git backend is not supported by the authenticator.',
            errorCode: 'UNSUPPORTED_BACKEND',
        });
    }

    if (!code || !state) {
        return outputHTML({
            provider,
            error: 'Failed to receive an authorization code. Please try again later.',
            errorCode: 'AUTH_CODE_REQUEST_FAILED',
        });
    }

    if (!csrfToken || state !== csrfToken) {
        return outputHTML({
            provider,
            error: 'Potential CSRF attack detected. Authentication flow aborted.',
            errorCode: 'CSRF_DETECTED',
        });
    }

    const {
        GITHUB_CLIENT_ID,
        GITHUB_CLIENT_SECRET,
        GITHUB_HOSTNAME = 'github.com',
        GITLAB_CLIENT_ID,
        GITLAB_CLIENT_SECRET,
        GITLAB_HOSTNAME = 'gitlab.com',
    } = env;

    let tokenURL = '';
    let requestBody = {};

    if (provider === 'github') {
        if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
            return outputHTML({
                provider,
                error: 'OAuth app client ID or secret is not configured.',
                errorCode: 'MISCONFIGURED_CLIENT',
            });
        }

        tokenURL = `https://${GITHUB_HOSTNAME}/login/oauth/access_token`;
        requestBody = {
            code,
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
        };
    }

    if (provider === 'gitlab') {
        if (!GITLAB_CLIENT_ID || !GITLAB_CLIENT_SECRET) {
            return outputHTML({
                provider,
                error: 'OAuth app client ID or secret is not configured.',
                errorCode: 'MISCONFIGURED_CLIENT',
            });
        }

        tokenURL = `https://${GITLAB_HOSTNAME}/oauth/token`;
        requestBody = {
            code,
            client_id: GITLAB_CLIENT_ID,
            client_secret: GITLAB_CLIENT_SECRET,
            grant_type: 'authorization_code',
            redirect_uri: `${origin}/callback`,
        };
    }

    let response;
    let token = '';
    let error = '';

    try {
        response = await fetch(tokenURL, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
    } catch {
        //
    }

    if (!response) {
        return outputHTML({
            provider,
            error: 'Failed to request an access token. Please try again later.',
            errorCode: 'TOKEN_REQUEST_FAILED',
        });
    }

    try {
        ({ access_token: token, error } = await response.json());
    } catch {
        return outputHTML({
            provider,
            error: 'Server responded with malformed data. Please try again later.',
            errorCode: 'MALFORMED_RESPONSE',
        });
    }

    // Gate token issuance on collaborator membership of the configured
    // repo. Pure UX — GitHub enforces write access at the API level
    // regardless — but stops curious visitors from landing inside /admin/
    // and only discovering they can't save when they hit Publish.
    if (provider === 'github' && token && env.ALLOWED_REPO) {
        const allowed = await isCollaborator(env.ALLOWED_REPO, token, GITHUB_HOSTNAME);
        if (!allowed) {
            return outputHTML({
                provider,
                error: `Your GitHub account isn't a collaborator on ${env.ALLOWED_REPO}. Ask an admin to add you.`,
                errorCode: 'NOT_COLLABORATOR',
            });
        }
    }

    return outputHTML({ provider, token, error });
};

/**
 * Check whether the OAuth-authenticated user is a collaborator on the
 * given repo. Returns false on any failure rather than throwing — we'd
 * rather fail closed than 500 in the middle of the OAuth dance.
 */
const isCollaborator = async (repo, token, hostname) => {
    const apiBase = hostname === 'github.com' ? 'https://api.github.com' : `https://${hostname}/api/v3`;
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'loe-auth-worker',
    };
    try {
        const userRes = await fetch(`${apiBase}/user`, { headers });
        if (!userRes.ok) return false;
        const { login } = await userRes.json();
        if (!login) return false;
        const collabRes = await fetch(
            `${apiBase}/repos/${repo}/collaborators/${encodeURIComponent(login)}`,
            { headers },
        );
        return collabRes.status === 204;
    } catch {
        return false;
    }
};

/**
 * Proxy the Megaphone RSS feed so we can drop the 33k-line static
 * mirror at content/extra/podcast.rss. Cloudflare's edge caches the
 * response for an hour, so upstream sees at most ~1 request/hour/PoP.
 */
const handlePodcastRss = async (method) => {
    let upstream;
    try {
        upstream = await fetch('https://feeds.megaphone.fm/livingonearth');
    } catch {
        return new Response('Failed to fetch upstream RSS feed.', { status: 502 });
    }

    if (!upstream.ok) {
        return new Response(`Upstream RSS feed returned ${upstream.status}.`, { status: 502 });
    }

    const headers = {
        'Content-Type': 'application/rss+xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    };

    // HEAD: same headers + status as GET, empty body. Some monitoring
    // tools and `curl -I` probe HEAD.
    if (method === 'HEAD') {
        return new Response(null, { status: 200, headers });
    }

    return new Response(upstream.body, { status: 200, headers });
};

export default {
    async fetch(request, env) {
        const { method, url } = request;
        const { pathname } = new URL(url);

        if (method === 'GET' && ['/auth', '/oauth/authorize'].includes(pathname)) {
            return handleAuth(request, env);
        }

        if (method === 'GET' && ['/callback', '/oauth/redirect'].includes(pathname)) {
            return handleCallback(request, env);
        }

        if ((method === 'GET' || method === 'HEAD') && pathname === '/podcast.rss') {
            return handlePodcastRss(method);
        }

        return new Response('', { status: 404 });
    },
};
