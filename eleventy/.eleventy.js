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
    // admin/index.html + README copy through; config.njk is templated
    // (produces _site_11ty/admin/config.yml via its frontmatter permalink).
    eleventyConfig.addPassthroughCopy({ '../content/admin/index.html': 'admin/index.html' });
    eleventyConfig.addPassthroughCopy({ '../content/admin/preview.html': 'admin/preview.html' });
    eleventyConfig.addPassthroughCopy({ '../content/admin/README.md': 'admin/README.md' });

    // Skip content sections while we port templates incrementally.
    // .eleventyignore globs are relative to the ignore file's dir; ours
    // lives in eleventy/ which doesn't see ../content/. Use the JS API
    // with paths relative to the configured input dir.
    // Ignore admin/* templates EXCEPT config.njk which we want rendered.
    eleventyConfig.ignores.add('../content/admin/index.html');
    eleventyConfig.ignores.add('../content/admin/preview.html');
    eleventyConfig.ignores.add('../content/admin/README.md');
    eleventyConfig.ignores.add('../content/series/**');
    eleventyConfig.ignores.add('../content/extra/**');
    eleventyConfig.ignores.add('../content/images/**');
    eleventyConfig.ignores.add('../content/static/**');

    // Watch theme files so dev server reloads on CSS/JS changes.
    eleventyConfig.addWatchTarget('../themes/loe_original/');

    // Plugin ports.
    require('./plugins/shortcodes.js')(eleventyConfig);
    require('./plugins/filters.js')(eleventyConfig);
    require('./plugins/collections.js')(eleventyConfig);
    require('./plugins/speaker-highlight.js')(eleventyConfig);

    // Compute layout + permalink per item from existing Pelican frontmatter
    // (template:, category:, slug:) so we don't have to touch every markdown
    // file in the repo.
    eleventyConfig.addGlobalData('eleventyComputed', {
        layout: (data) => {
            // Explicit layout: false in frontmatter disables wrapping
            // entirely (used by config.yml and similar raw outputs).
            if (data.layout === false) return false;
            if (data.layout) return data.layout;
            if (data.template === 'show') return 'layouts/show.njk';
            if (data.template === 'newsletter_article') return 'layouts/newsletter_article.njk';
            if (data.category === 'Segments') return 'layouts/article.njk';
            if (data.category === 'Newsletter') return 'layouts/newsletter_article.njk';
            // Pelican pages live in content/pages/.
            if (data.page && data.page.inputPath && data.page.inputPath.includes('/pages/')) {
                return 'layouts/page.njk';
            }
            return 'layouts/article.njk';
        },
        permalink: (data) => {
            if (data.permalink) return data.permalink;
            // Pages → /<slug>.html (Pelican PAGE_URL).
            if (data.page && data.page.inputPath && data.page.inputPath.includes('/pages/')) {
                const slug = data.slug || (data.page.filePathStem.split('/').pop());
                return `/${slug}.html`;
            }
            // Shows + segments + newsletters → /YYYY_MM_DD_<slug>.html.
            if (data.date) {
                const d = new Date(data.date);
                if (!isNaN(d)) {
                    const yyyy = d.getUTCFullYear();
                    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
                    const dd = String(d.getUTCDate()).padStart(2, '0');
                    // For shows (no slug: field), Pelican derives slug from
                    // the title via slugify. Match that here so URLs stay
                    // backwards-compatible.
                    let slug = data.slug;
                    if (!slug && data.template === 'show') {
                        slug = (data.title || '')
                            .toLowerCase()
                            .replace(/[^a-z0-9\s-]/g, '')
                            .replace(/\s+/g, '-')
                            .replace(/-+/g, '-')
                            .replace(/^-|-$/g, '');
                    }
                    if (!slug) {
                        slug = data.page.filePathStem.split('/').pop();
                    }
                    return `/${yyyy}_${mm}_${dd}_${slug}.html`;
                }
            }
            return false; // let Eleventy skip
        },
    });

    return {
        // dir.includes / dir.data must be relative to dir.input, not
        // absolute paths. Since our input is ../content/ (from eleventy/'s
        // cwd) the templates land in ../eleventy/_includes.
        dir: {
            input: '../content',
            output: '../_site_11ty',
            includes: '../eleventy/_includes',
            data: '../eleventy/_data',
        },
        templateFormats: ['md', 'njk', 'html'],
        markdownTemplateEngine: 'njk',
        htmlTemplateEngine: 'njk',
        dataTemplateEngine: 'njk',
    };
};
