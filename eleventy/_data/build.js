/**
 * Build provenance exposed to templates as `build`. Resolves the current
 * commit SHA from CI env vars (GITHUB_SHA / GIT_SHA) or, locally, from git.
 * Sliced to 7 chars. Returns an empty string if unavailable so templates can
 * gate cleanly (`{% if build.sha %}`).
 */
const { execSync } = require('node:child_process');

module.exports = () => {
    let sha = process.env.GITHUB_SHA || process.env.GIT_SHA || '';
    if (!sha) {
        try { sha = execSync('git rev-parse HEAD').toString().trim(); } catch {}
    }
    return { sha: sha.slice(0, 7) };
};
