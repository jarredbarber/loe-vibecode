/**
 * Eleventy config — parallel build alongside Pelican during the migration.
 *
 *   input:  ../content/   (shared with Pelican)
 *   output: ../_site_11ty/ (NOT _site/ so we can A/B compare against Pelican)
 *
 * Plugins live in ./plugins/ as JS equivalents of the Pelican ones in
 * ../plugins/. Theme templates live in _includes/.
 *
 * Run from eleventy/:
 *   npx @11ty/eleventy --serve   # dev with live reload
 *   npx @11ty/eleventy             # one-shot build
 *   npx @11ty/eleventy --incremental # builds only changed inputs
 */

const path = require('node:path');

module.exports = function (eleventyConfig) {
    eleventyConfig.addPassthroughCopy({ '../themes/loe_original/static': 'theme' });
    eleventyConfig.addPassthroughCopy({ '../content/images': 'images' });
    eleventyConfig.addPassthroughCopy({ '../content/extra': '.' });
    eleventyConfig.addPassthroughCopy({ '../content/admin': 'admin' });

    // Watch theme files so dev server reloads on CSS/JS changes.
    eleventyConfig.addWatchTarget('../themes/loe_original/');

    // Filters and shortcodes will get registered here as we port plugins.
    require('./plugins/shortcodes.js')(eleventyConfig);

    return {
        dir: {
            input: path.resolve(__dirname, '..', 'content'),
            output: path.resolve(__dirname, '..', '_site_11ty'),
            includes: path.resolve(__dirname, '_includes'),
            data: path.resolve(__dirname, '_data'),
            layouts: path.resolve(__dirname, '_includes/layouts'),
        },
        templateFormats: ['md', 'njk', 'html'],
        markdownTemplateEngine: 'njk',
        htmlTemplateEngine: 'njk',
        dataTemplateEngine: 'njk',
    };
};
