/**
 * Global site config exposed to all templates as `site`. Single source of
 * truth for the repo slug + branch used throughout the build:
 *   - eleventy/_includes/layouts/base.njk → Edit-on-GitHub URLs
 */
module.exports = {
    name: 'Living on Earth',
    url: process.env.SITEURL || '',
    githubRepo: process.env.GITHUB_REPO || 'jarredbarber/loe-vibecode',
    githubBranch: process.env.GITHUB_BRANCH || 'staging',
    target: process.env.DEPLOY_TARGET || 'staging',
    darkMode: true,
};
