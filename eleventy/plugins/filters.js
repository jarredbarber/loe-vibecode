/**
 * Custom filters mirroring Pelican's site_config.py filters and adding a
 * few Eleventy-specific conveniences.
 */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function ordinal(n) {
    const m = n % 100;
    if (m >= 11 && m <= 13) return `${n}th`;
    const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
    return `${n}${suffix}`;
}

function asDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'string') return new Date(value);
    return null;
}

function strftime(value, fmt) {
    const d = asDate(value);
    if (!d || isNaN(d)) return '';
    // Subset of strftime used in the Pelican templates.
    return fmt
        .replace('%B', MONTHS[d.getUTCMonth()])
        .replace('%Y', String(d.getUTCFullYear()))
        .replace('%m', String(d.getUTCMonth() + 1).padStart(2, '0'))
        .replace('%d', String(d.getUTCDate()).padStart(2, '0'));
}

function stripQuotes(value) {
    if (!value) return '';
    return String(value).replace(/^"+|"+$/g, '');
}

function currentTime(_ignored, fmt) {
    const now = new Date();
    return strftime(now.toISOString(), fmt) +
        ` at ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`;
}

/** Absolute or content-relative input path → "shows/2026/05-22/show.md". */
function toContentRel(inputPath) {
    if (!inputPath) return null;
    // page.inputPath comes in as "./<rel-to-cwd>" — strip both common shapes.
    const m = String(inputPath).match(/content\/(.+\.md)$/);
    return m ? m[1] : null;
}

/** "shows/2026/05-22/show.md" → { collection: "shows", slug: "2026/05-22/show" } */
function pathToCmsSlug(relSourcePath) {
    if (!relSourcePath) return { collection: null, slug: null };
    const m = relSourcePath.match(/^(shows|segments|newsletters|pages)\/(.+)\.md$/);
    if (!m) return { collection: null, slug: null };
    return { collection: m[1], slug: m[2] };
}

module.exports = function (eleventyConfig) {
    eleventyConfig.addFilter('ordinal', ordinal);
    eleventyConfig.addFilter('strftime', strftime);
    eleventyConfig.addFilter('stripQuotes', stripQuotes);
    eleventyConfig.addFilter('currentTime', currentTime);
    eleventyConfig.addFilter('toContentRel', toContentRel);
    eleventyConfig.addFilter('pathToCmsSlug', pathToCmsSlug);

    // Day-of-month with ordinal — e.g. {{ article.date | dayOrdinal }} → "22nd".
    eleventyConfig.addFilter('dayOrdinal', (value) => {
        const d = asDate(value);
        return d ? ordinal(d.getUTCDate()) : '';
    });
};
