/**
 * Eleventy config used by the golden tests. Mirrors the production config in
 * ../../eleventy/.eleventy.js but points at tests/fixtures/content instead.
 * Output goes to a tmp dir provided via OUTPUT env var.
 */
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');

module.exports = function (eleventyConfig) {
    eleventyConfig.addPassthroughCopy({
        [path.join(REPO, 'themes/loe_original/static')]: 'theme',
    });

    require('../../eleventy/plugins/shortcodes.js')(eleventyConfig);
    require('../../eleventy/plugins/filters.js')(eleventyConfig);
    require('../../eleventy/plugins/collections.js')(eleventyConfig);
    require('../../eleventy/plugins/speaker-highlight.js')(eleventyConfig);

    // Same eleventyComputed as production so URLs and layouts match.
    eleventyConfig.addGlobalData('eleventyComputed', {
        layout: (data) => {
            if (data.layout) return data.layout;
            if (data.template === 'show') return 'layouts/show.njk';
            if (data.template === 'newsletter_article') return 'layouts/newsletter_article.njk';
            if (data.category === 'Segments') return 'layouts/article.njk';
            if (data.category === 'Newsletter') return 'layouts/newsletter_article.njk';
            if (data.page && data.page.inputPath && data.page.inputPath.includes('/pages/')) {
                return 'layouts/page.njk';
            }
            return 'layouts/article.njk';
        },
        permalink: (data) => {
            if (data.permalink) return data.permalink;
            if (data.page && data.page.inputPath && data.page.inputPath.includes('/pages/')) {
                const slug = data.slug || data.page.filePathStem.split('/').pop();
                return `/${slug}.html`;
            }
            if (data.date) {
                const d = new Date(data.date);
                if (!isNaN(d)) {
                    const yyyy = d.getUTCFullYear();
                    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
                    const dd = String(d.getUTCDate()).padStart(2, '0');
                    let slug = data.slug;
                    if (!slug && data.template === 'show') {
                        slug = (data.title || '')
                            .toLowerCase()
                            .replace(/[^a-z0-9\s-]/g, '')
                            .replace(/\s+/g, '-')
                            .replace(/-+/g, '-')
                            .replace(/^-|-$/g, '');
                    }
                    if (!slug) slug = data.page.filePathStem.split('/').pop();
                    return `/${yyyy}_${mm}_${dd}_${slug}.html`;
                }
            }
            return false;
        },
    });

    return {
        // Eleventy v3 joins dir.includes onto dir.input; using absolute paths
        // for both produces a concatenated double-absolute. Keep input absolute
        // and includes relative-from-input.
        dir: {
            input: path.join(REPO, 'tests/fixtures/content'),
            output: process.env.OUTPUT || path.join(REPO, 'tests/fixtures/_build'),
            includes: '../../../eleventy/_includes',
            data: '../../../eleventy/_data',
        },
        templateFormats: ['md', 'njk', 'html'],
        markdownTemplateEngine: 'njk',
        htmlTemplateEngine: 'njk',
    };
};
