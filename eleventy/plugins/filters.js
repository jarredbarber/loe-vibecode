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

// ---------------------------------------------------------------------------
// Related segments — TF-IDF tag similarity, computed once and cached.
// score(a,b) = Σ 1/freq(t) for t in intersection(tags_a, tags_b)
// Diversity nudge: at least 2 distinct "primary" tags (first tag) across picks.
// Tiebreak by recency gap (prefer different years).
// ---------------------------------------------------------------------------
let _relatedCache = null;
function buildRelatedCache() {
    if (_relatedCache) return _relatedCache;
    const fs = require('node:fs');
    const path = require('node:path');
    const yaml = require('js-yaml');
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

    // Parse frontmatter from each segment.
    const segments = [];
    for (const root of roots) {
        for (const file of walk(root)) {
            let raw = '';
            try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
            if (!raw.startsWith('---')) continue;
            const end = raw.indexOf('\n---', 3);
            if (end === -1) continue;
            const fmStr = raw.slice(4, end);
            let fm;
            try { fm = yaml.load(fmStr); } catch { continue; }
            const tags = Array.isArray(fm.tags) ? fm.tags.filter(Boolean) : [];
            if (!tags.length) continue;
            const date = fm.date ? new Date(fm.date) : null;
            if (!date || isNaN(date)) continue;
            const yyyy = date.getUTCFullYear();
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(date.getUTCDate()).padStart(2, '0');
            const slug = fm.slug || path.basename(file, '.md');
            const url = `/${yyyy}_${mm}_${dd}_${slug}.html`;
            const rel = path.relative(repoRoot, file).replace(/^content\//, '');
            segments.push({
                rel, url, title: fm.title || slug, date, year: yyyy, tags,
                megaphoneId: fm.megaphone_id || null,
                art: fm.image_url || fm.banner_url || null,
            });
        }
    }

    // Build inverted index: tag → count of segments with that tag.
    const tagFreq = new Map();
    for (const seg of segments) {
        for (const t of seg.tags) tagFreq.set(t, (tagFreq.get(t) || 0) + 1);
    }

    // For each segment, score all others and pick top 4-5.
    const result = {};
    for (let i = 0; i < segments.length; i++) {
        const a = segments[i];
        const tagsA = new Set(a.tags);
        // Score candidates.
        const scored = [];
        for (let j = 0; j < segments.length; j++) {
            if (i === j) continue;
            const b = segments[j];
            let score = 0;
            for (const t of b.tags) {
                if (tagsA.has(t)) score += 1 / (tagFreq.get(t) || 1);
            }
            if (score > 0) scored.push({ score, seg: b });
        }
        if (!scored.length) continue;
        // Sort by score desc, then by recency (prefer different years from `a`).
        scored.sort((x, y) => {
            if (y.score !== x.score) return y.score - x.score;
            // Prefer segments from a different year (tiebreak by year distance desc).
            const xDiff = Math.abs(x.seg.year - a.year);
            const yDiff = Math.abs(y.seg.year - a.year);
            return yDiff - xDiff;
        });
        // Pick top candidates with diversity nudge: ≥2 distinct primary tags.
        const picks = [];
        const primaryTags = new Set();
        for (const { seg } of scored) {
            if (picks.length >= 5) break;
            picks.push(seg);
            if (seg.tags[0]) primaryTags.add(seg.tags[0]);
        }
        // If diversity not met (< 2 primary tags) and we have <4 picks, top-up
        // from candidates with a different primary tag.
        if (primaryTags.size < 2 && picks.length < 4) {
            for (const { seg } of scored) {
                if (picks.includes(seg)) continue;
                if (!picks.find(p => p.tags[0] === seg.tags[0])) {
                    picks.push(seg);
                    if (picks.length >= 4) break;
                }
            }
        }
        result[a.rel] = picks.slice(0, 5).map(s => ({
            url: s.url,
            title: s.title,
            date: s.date.toISOString().slice(0, 10),
            megaphoneId: s.megaphoneId,
            art: s.art,
        }));
    }
    _relatedCache = result;
    return result;
}

function relatedForSegment(inputPath) {
    if (!inputPath) return [];
    // inputPath may be "./content/segments/..." or "segments/..." — normalise.
    const m = String(inputPath).match(/content\/(.+\.md)$/);
    const rel = m ? m[1] : null;
    if (!rel) return [];
    return buildRelatedCache()[rel] || [];
}

module.exports = function (eleventyConfig) {
    eleventyConfig.addFilter('strftime', strftime);
    eleventyConfig.addFilter('stripQuotes', stripQuotes);
    eleventyConfig.addFilter('currentTime', currentTime);
    eleventyConfig.addFilter('toContentRel', toContentRel);
    eleventyConfig.addFilter('pathToCmsSlug', pathToCmsSlug);
    eleventyConfig.addFilter('readingTime', readingTime);
    eleventyConfig.addFilter('listeningTime', listeningTime);
    eleventyConfig.addFilter('speakersForSegment', speakersForSegment);
    eleventyConfig.addFilter('relatedForSegment', relatedForSegment);
    eleventyConfig.addFilter('aggregatedPillsForShow', aggregatedPillsForShow);
    eleventyConfig.addFilter('yearCountsToBarLinks', (yearCounts) =>
        Object.fromEntries(yearCounts.map(({ year }) => [year, `#period-${year}`]))
    );

    // Day-of-month with ordinal — e.g. {{ article.date | dayOrdinal }} → "22nd".
    eleventyConfig.addFilter('dayOrdinal', (value) => {
        const d = asDate(value);
        return d ? ordinal(d.getUTCDate()) : '';
    });
};
