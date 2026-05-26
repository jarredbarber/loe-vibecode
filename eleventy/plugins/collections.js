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

    // Index segments by date string ("YYYY-MM-DD") so the filter below is O(1)
    // per show instead of scanning the full segments collection each call.
    // Built lazily on first use and cached on the segments array.
    function indexSegments(segments) {
        if (segments.__byDate) return segments.__byDate;
        const byDate = new Map();
        for (const s of segments) {
            const d = s.data ? s.data.date : s.date;
            const key = new Date(d).toISOString().slice(0, 10);
            if (!byDate.has(key)) byDate.set(key, []);
            byDate.get(key).push(s);
        }
        for (const arr of byDate.values()) {
            arr.sort((a, b) => {
                const ao = parseFloat(a.data.order) || Infinity;
                const bo = parseFloat(b.data.order) || Infinity;
                if (ao !== bo) return ao - bo;
                return (a.inputPath || '').localeCompare(b.inputPath || '');
            });
        }
        // Cache on the array; safe because Eleventy reuses the same collection
        // object across template renders within one build.
        Object.defineProperty(segments, '__byDate', { value: byDate, enumerable: false });
        return byDate;
    }

    eleventyConfig.addFilter('segmentsForShow', function (show, segments) {
        if (!show || !segments) return [];
        const showDate = show.data ? show.data.date : show.date;
        const key = new Date(showDate).toISOString().slice(0, 10);
        return indexSegments(segments).get(key) || [];
    });
};
