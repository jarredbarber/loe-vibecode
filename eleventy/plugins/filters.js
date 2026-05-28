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
    // %-d / %-m: numeric, no zero padding (GNU extension).
    return fmt
        .replace('%B', MONTHS[d.getUTCMonth()])
        .replace('%Y', String(d.getUTCFullYear()))
        .replace('%-m', String(d.getUTCMonth() + 1))
        .replace('%-d', String(d.getUTCDate()))
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

/** Strip HTML tags and shortcode-ish noise, then count word-like tokens. */
function countWords(value) {
    if (!value) return 0;
    const text = String(value)
        // Drop fenced/inline code blocks — they're not "reading".
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        // Drop HTML tags.
        .replace(/<[^>]+>/g, ' ')
        // Drop Nunjucks-style shortcodes like {% audio ... %} or {{ ... }}.
        .replace(/\{[%{][\s\S]*?[%}]\}/g, ' ')
        // Drop markdown link/image syntax — keep the visible text.
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    const m = text.match(/[A-Za-z0-9À-ɏ'’-]+/g);
    return m ? m.length : 0;
}

/** "7 min read" — assumes ~200wpm. Returns null if body is empty. */
function readingTime(body) {
    const words = countWords(body);
    if (!words) return null;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return `${minutes} min read`;
}

/** "9 min listen" — radio cadence ~150wpm. Returns null if body is empty. */
function listeningTime(body) {
    const words = countWords(body);
    if (!words) return null;
    const minutes = Math.max(1, Math.ceil(words / 150));
    return `${minutes} min listen`;
}

// Lazy per-segment speakers map. Built once on first call, then O(1) lookups
// per page. Tried this as a global _data file first — Eleventy ended up
// deep-cloning the 10K-entry map across every page render and OOMed. A
// closure-cached filter sidesteps that entirely.
//
// Only speakers with ≥ MIN_APPEARANCES total are returned — those are the
// ones with /people/<slug>.html pages built (see plugins/collections.js).
// Single-mention guests get filtered out so pill links don't 404.
const SPEAKER_MIN_APPEARANCES = 3;
let _speakersCache = null;
function buildSpeakersCache() {
    if (_speakersCache) return _speakersCache;
    const fs = require('node:fs');
    const path = require('node:path');
    const { normalizeSpeaker, KNOWN_SPEAKERS } = require('../_data/speakerAliases.js');
        const knownSlugs = new Set(KNOWN_SPEAKERS.map(s => s.slug));
    const SPEAKER_LINE_RE = /^([A-Z](?:[A-Z'’\d\s.]|[a-z]{1,2}(?=[A-Z]))+):/;
    const repoRoot = path.resolve(__dirname, '..', '..');
    const roots = [
        path.resolve(repoRoot, 'content', 'segments'),
        path.resolve(repoRoot, 'content', 'archive', 'segments'),
    ];
    const walk = function* (dir) {
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) yield* walk(p);
            else if (e.isFile() && e.name.endsWith('.md')) yield p;
        }
    };
    // Pass 1: per-file speaker list + global counts.
    const perFile = {};
    const counts = new Map();
    for (const root of roots) {
        for (const file of walk(root)) {
            let raw = '';
            try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
            let body = raw;
            if (body.startsWith('---')) {
                const end = body.indexOf('\n---', 3);
                if (end !== -1) {
                    const lineEnd = body.indexOf('\n', end + 4);
                    body = lineEnd === -1 ? '' : body.slice(lineEnd + 1);
                }
            }
            const seen = new Map();
            for (const line of body.split('\n')) {
                const m = line.match(SPEAKER_LINE_RE);
                if (!m) continue;
                const norm = normalizeSpeaker(m[1]);
                if (!norm) continue;
                if (!seen.has(norm.slug)) seen.set(norm.slug, norm.name);
            }
            if (seen.size) {
                const rel = path.relative(repoRoot, file).replace(/^content\//, '');
                perFile[rel] = [...seen.entries()].map(([slug, name]) => ({ slug, name }));
                for (const slug of seen.keys()) counts.set(slug, (counts.get(slug) || 0) + 1);
            }
        }
    }
    // Pass 2: filter each per-file list to only speakers with built pages.
    const filtered = {};
    for (const [rel, list] of Object.entries(perFile)) {
        const kept = list.filter((s) => knownSlugs.has(s.slug) && (counts.get(s.slug) || 0) >= SPEAKER_MIN_APPEARANCES);
        if (kept.length) filtered[rel] = kept;
    }
    _speakersCache = filtered;
    return _speakersCache;
}

function speakersForSegment(inputPath) {
    if (!inputPath) return [];
    return buildSpeakersCache()[inputPath] || [];
}

/**
 * Aggregated pills for a show page: union of all featured speakers and
 * tags across the show's segments. `segments` is an array of Eleventy
 * collection items as returned by the `segmentsForShow` filter.
 */
function aggregatedPillsForShow(segments) {
    if (!segments || !segments.length) return { speakers: [], tags: [] };
    const cache = buildSpeakersCache();
    const speakerSeen = new Map();
    const tagSeen = new Set();
    for (const seg of segments) {
        const rel = (seg.inputPath || '').replace(/^.*\/content\//, '').replace(/^content\//, '');
        const list = cache[rel] || [];
        for (const s of list) {
            if (!speakerSeen.has(s.slug)) speakerSeen.set(s.slug, s.name);
        }
        const tags = (seg.data && seg.data.tags) || [];
        for (const t of tags) tagSeen.add(t);
    }
    return {
        speakers: [...speakerSeen.entries()].map(([slug, name]) => ({ slug, name })),
        tags: [...tagSeen],
    };
}

module.exports = function (eleventyConfig) {
    eleventyConfig.addFilter('ordinal', ordinal);
    eleventyConfig.addFilter('strftime', strftime);
    eleventyConfig.addFilter('stripQuotes', stripQuotes);
    eleventyConfig.addFilter('currentTime', currentTime);
    eleventyConfig.addFilter('toContentRel', toContentRel);
    eleventyConfig.addFilter('pathToCmsSlug', pathToCmsSlug);
    eleventyConfig.addFilter('readingTime', readingTime);
    eleventyConfig.addFilter('listeningTime', listeningTime);
    eleventyConfig.addFilter('speakersForSegment', speakersForSegment);
    eleventyConfig.addFilter('aggregatedPillsForShow', aggregatedPillsForShow);

    // Day-of-month with ordinal — e.g. {{ article.date | dayOrdinal }} → "22nd".
    eleventyConfig.addFilter('dayOrdinal', (value) => {
        const d = asDate(value);
        return d ? ordinal(d.getUTCDate()) : '';
    });
};
