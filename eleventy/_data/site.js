/**
 * Global site config exposed to all templates as `site`. Single source of
 * truth for the repo slug + branch used throughout the build:
 *   - content/admin/config.njk → Sveltia backend.repo / backend.branch
 *   - eleventy/_includes/layouts/base.njk → Edit-on-GitHub URLs
 * The auth Worker (auth/wrangler.toml) is a separate runtime and holds its
 * own ALLOWED_REPO literal — if you rename the repo, update both.
 */
module.exports = {
    name: 'Living on Earth',
    url: process.env.SITEURL || '',
    githubRepo: process.env.GITHUB_REPO || 'jarredbarber/loe-vibecode',
    githubBranch: process.env.GITHUB_BRANCH || 'staging',
    target: process.env.DEPLOY_TARGET || 'staging',
    darkMode: true,
};
