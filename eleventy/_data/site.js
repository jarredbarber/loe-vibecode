/**
 * Global site config exposed to all templates as `site`.
 * Mirrors Pelican's SITEURL / SITENAME / GITHUB_REPO / GITHUB_BRANCH globals.
 */
module.exports = {
    name: 'Living on Earth',
    url: process.env.SITEURL || '',
    githubRepo: process.env.GITHUB_REPO || 'jarredbarber/loe-vibecode',
    githubBranch: process.env.GITHUB_BRANCH || 'main',
    target: process.env.DEPLOY_TARGET || 'staging',
};
