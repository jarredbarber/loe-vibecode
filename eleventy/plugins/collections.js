/**
 * Eleventy collection definitions. Mirrors Pelican's article/page categorization
 * and powers the show_segments plugin (segments auto-discovered by date).
 */

const fs = require('node:fs');
const { normalizeSpeaker } = require('../_data/speakerAliases.js');

// Detect speaker labels in raw markdown bodies. Mirrors the regex in
// speaker-highlight.js but anchors per-line (markdown source) instead of
// inside HTML <p> tags.
const SPEAKER_LINE_RE = /^([A-Z](?:[A-Z'’\d\s.]|[a-z]{1,2}(?=[A-Z]))+):/;
const MIN_APPEARANCES = 3;

function extractSpeakers(rawBody) {
    if (!rawBody || typeof rawBody !== 'string') return [];
    const seen = new Set();
    for (const line of rawBody.split('\n')) {
        const m = line.match(SPEAKER_LINE_RE);
        if (!m) continue;
        const norm = normalizeSpeaker(m[1]);
        if (!norm) continue;
        seen.add(JSON.stringify([norm.slug, norm.name]));
    }
    return Array.from(seen).map((s) => JSON.parse(s)).map(([slug, name]) => ({ slug, name }));
}

// Read the raw markdown source for a segment, stripped of frontmatter.
// We cache by inputPath since file reads happen once at collection-build time.
const bodyCache = new Map();
function rawBody(item) {
    const p = item.inputPath;
    if (!p) return '';
    if (bodyCache.has(p)) return bodyCache.get(p);
    let text = '';
    try {
        text = fs.readFileSync(p, 'utf8');
    } catch (e) {
        bodyCache.set(p, '');
        return '';
    }
    // Strip YAML frontmatter (--- … ---) at the top of the file.
    if (text.startsWith('---')) {
        const end = text.indexOf('\n---', 3);
        if (end !== -1) {
            const lineEnd = text.indexOf('\n', end + 4);
            text = lineEnd === -1 ? '' : text.slice(lineEnd + 1);
        }
    }
    bodyCache.set(p, text);
    return text;
}

module.exports = function (eleventyConfig) {
    // Shows, sorted newest first.
    eleventyConfig.addCollection('shows', (api) => {
        return api
            .getAll()
            .filter((item) => item.data.template === 'show')
            .sort((a, b) => Date.parse(b.data.date) - Date.parse(a.data.date));
    });

    // Segments, sorted newest first then by `order:` frontmatter.
    eleventyConfig.addCollection('segments', (api) => {
        return api
            .getAll()
            .filter((item) => item.data.category === 'Segments')
            .sort((a, b) => Date.parse(b.data.date) - Date.parse(a.data.date));
    });

    // Newsletters.
    eleventyConfig.addCollection('newsletters', (api) => {
        return api
            .getAll()
            .filter((item) => item.data.category === 'Newsletter')
            .sort((a, b) => Date.parse(b.data.date) - Date.parse(a.data.date));
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

    // Speakers — derived from transcript labels in segment bodies. One entry
    // per canonical speaker who appears in at least MIN_APPEARANCES segments.
    eleventyConfig.addCollection('speakers', (api) => {
        const segments = api
            .getAll()
            .filter((item) => item.data.category === 'Segments');

        const bySlug = new Map(); // slug → { slug, name, segments: [] }

        for (const seg of segments) {
            const speakers = extractSpeakers(rawBody(seg));
            for (const { slug, name } of speakers) {
                let bucket = bySlug.get(slug);
                if (!bucket) {
                    bucket = { slug, name, segments: [] };
                    bySlug.set(slug, bucket);
                }
                bucket.segments.push(seg);
                // Prefer a non-fallback display name if one shows up later.
                if (name && name.length > bucket.name.length && !/[a-z]/.test(bucket.name)) {
                    bucket.name = name;
                }
            }
        }

        const out = [];
        for (const entry of bySlug.values()) {
            if (entry.segments.length < MIN_APPEARANCES) continue;
            entry.segments.sort((a, b) => Date.parse(b.data.date) - Date.parse(a.data.date));
            const dates = entry.segments.map((s) => new Date(s.data.date));
            entry.earliestYear = Math.min(...dates.map((d) => d.getUTCFullYear()));
            entry.latestYear = Math.max(...dates.map((d) => d.getUTCFullYear()));
            entry.count = entry.segments.length;
            out.push(entry);
        }
        out.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
        return out;
    });

    // Tags — derived from each segment's `tags:` frontmatter. One entry per
    // tag that appears on at least one segment. Tags that exist in the
    // vocabulary file but aren't used anywhere are NOT in this collection
    // (the /tags.html index reads the vocab directly to show all of them).
    eleventyConfig.addCollection('tags', (api) => {
        const segments = api
            .getAll()
            .filter((item) => item.data.category === 'Segments');
        const bySlug = new Map();
        for (const seg of segments) {
            const tags = seg.data.tags;
            if (!Array.isArray(tags)) continue;
            for (const t of tags) {
                if (typeof t !== 'string' || !t.trim()) continue;
                const slug = t.trim();
                let bucket = bySlug.get(slug);
                if (!bucket) {
                    bucket = { slug, name: slug, segments: [] };
                    bySlug.set(slug, bucket);
                }
                bucket.segments.push(seg);
            }
        }
        const out = [];
        for (const entry of bySlug.values()) {
            entry.segments.sort((a, b) => Date.parse(b.data.date) - Date.parse(a.data.date));
            entry.count = entry.segments.length;
            // Per-year counts for the sparkline on the tag page. Pre-computed
            // peak / first / last so the template doesn't need to do a
            // reduce-style loop (Nunjucks `{% set %}` inside `{% for %}`
            // doesn't propagate out of the loop scope).
            const yearCounts = new Map();
            for (const s of entry.segments) {
                const y = parseInt(String(s.data.date).slice(0, 4), 10);
                if (Number.isFinite(y)) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
            }
            const yc = [...yearCounts.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([year, count]) => ({ year, count }));
            entry.yearCounts = yc;
            entry.yearCountsPeak = yc.reduce((m, x) => Math.max(m, x.count), 0);
            entry.yearCountsFirst = yc.length ? yc[0].year : null;
            entry.yearCountsLast = yc.length ? yc[yc.length - 1].year : null;
            out.push(entry);
        }
        out.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
        return out;
    });

    eleventyConfig.addFilter('segmentsForShow', function (show, segments) {
        if (!show || !segments) return [];
        const showDate = show.data ? show.data.date : show.date;
        const key = new Date(showDate).toISOString().slice(0, 10);
        return indexSegments(segments).get(key) || [];
    });
};
