/**
 * Eleventy collection definitions. Mirrors Pelican's article/page categorization
 * and powers the show_segments plugin (segments auto-discovered by date).
 */

module.exports = function (eleventyConfig) {
    // Shows, sorted newest first.
    eleventyConfig.addCollection('shows', (api) => {
        return api
            .getAll()
            .filter((item) => item.data.template === 'show')
            .sort((a, b) => Number(b.data.date) - Number(a.data.date));
    });

    // Segments, sorted newest first then by `order:` frontmatter.
    eleventyConfig.addCollection('segments', (api) => {
        return api
            .getAll()
            .filter((item) => item.data.category === 'Segments')
            .sort((a, b) => Number(b.data.date) - Number(a.data.date));
    });

    // Newsletters.
    eleventyConfig.addCollection('newsletters', (api) => {
        return api
            .getAll()
            .filter((item) => item.data.category === 'Newsletter')
            .sort((a, b) => Number(b.data.date) - Number(a.data.date));
    });

    // Segments belonging to a specific show, used by show.njk.
    // Looks up by date string match — show.md has date: 2026-05-22, segments
    // have date: 2026-05-22, all live in their respective YYYY/MM-DD folders.
    eleventyConfig.addFilter('segmentsForShow', function (show, segments) {
        if (!show || !segments) return [];
        const showDate = show.data ? show.data.date : show.date;
        const showDateStr = new Date(showDate).toISOString().slice(0, 10);
        return segments
            .filter((s) => {
                const segDate = s.data ? s.data.date : s.date;
                return new Date(segDate).toISOString().slice(0, 10) === showDateStr;
            })
            .sort((a, b) => {
                const ao = parseFloat(a.data.order) || Infinity;
                const bo = parseFloat(b.data.order) || Infinity;
                if (ao !== bo) return ao - bo;
                return (a.inputPath || '').localeCompare(b.inputPath || '');
            });
    });
};
