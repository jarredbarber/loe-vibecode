/**
 * "On this day in Living on Earth history" — surfaces 1-3 archive segments
 * from past years matching today's MM-DD.
 *
 * Scans content/archive/segments/<year>/<MM-DD>/<slug>.md once per build
 * (cached in module scope). Archive is read-only, so a single scan is safe.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const ARCHIVE_ROOT = path.resolve(__dirname, '..', '..', 'content', 'archive', 'segments');

let cachedIndex = null;

function slugify(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function urlFor(data, fileSlug) {
    // Match the permalink computation in .eleventy.js for archive segments.
    if (!data || !data.date) return null;
    const d = new Date(data.date);
    if (isNaN(d)) return null;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    let slug = data.slug || fileSlug;
    if (!slug) return null;
    return `/${yyyy}_${mm}_${dd}_${slug}.html`;
}

function buildIndex() {
    if (cachedIndex) return cachedIndex;
    const index = {};
    let years = [];
    try {
        years = fs.readdirSync(ARCHIVE_ROOT, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    } catch (err) {
        // Archive missing — return empty index.
        cachedIndex = index;
        return index;
    }

    for (const year of years) {
        const yearDir = path.join(ARCHIVE_ROOT, year);
        let mmdds = [];
        try {
            mmdds = fs.readdirSync(yearDir, { withFileTypes: true })
                .filter((e) => e.isDirectory())
                .map((e) => e.name);
        } catch { continue; }

        for (const mmdd of mmdds) {
            if (!/^\d{2}-\d{2}$/.test(mmdd)) continue;
            const dayDir = path.join(yearDir, mmdd);
            let files = [];
            try {
                files = fs.readdirSync(dayDir).filter((f) => f.endsWith('.md'));
            } catch { continue; }

            for (const file of files) {
                const full = path.join(dayDir, file);
                let parsed;
                try {
                    const raw = fs.readFileSync(full, 'utf8');
                    parsed = matter(raw);
                } catch {
                    continue;
                }
                const data = parsed && parsed.data ? parsed.data : {};
                const title = (data.title || '').toString().trim();
                if (!title) continue;
                const fileSlug = file.replace(/\.md$/, '');
                const url = urlFor(data, fileSlug);
                if (!url) continue;
                const dateStr = data.date ? String(data.date).slice(0, 10) : `${year}-${mmdd}`;
                const summary = data.summary ? String(data.summary).trim() : '';
                if (!index[mmdd]) index[mmdd] = [];
                index[mmdd].push({ title, date: dateStr, url, summary });
            }
        }
    }
    cachedIndex = index;
    return index;
}

// Deterministic 32-bit hash → use as a PRNG seed so each day's pick is
// stable across rebuilds (was non-deterministic with Math.random — dirty
// diffs on every prod build).
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function sample(arr, n, seed) {
    if (arr.length <= n) return arr.slice();
    const copy = arr.slice();
    const out = [];
    let s = seed >>> 0;
    for (let i = 0; i < n; i++) {
        // xorshift32 — cheap, deterministic, plenty good for picking 3 of N.
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        const idx = s % copy.length;
        out.push(copy.splice(idx, 1)[0]);
    }
    return out;
}

// Anchor the 7-day window to the latest show's air date, not to today.
// Builds run on push (not nightly), and the homepage's hero block already
// frames content around "This week on LOE". Aligning the history picks
// to the same week makes the two sections read as a pair — and means a
// stale build still shows correct picks for the week being broadcast.
const WINDOW_DAYS = 7;
const SHOWS_ROOT = path.resolve(__dirname, '..', '..', 'content', 'shows');

function latestShowDate() {
    let years = [];
    try {
        years = fs.readdirSync(SHOWS_ROOT, { withFileTypes: true })
            .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
            .map((e) => e.name)
            .sort();
    } catch { return null; }
    for (const year of years.reverse()) {
        let mmdds = [];
        try {
            mmdds = fs.readdirSync(path.join(SHOWS_ROOT, year))
                .filter((m) => /^\d{2}-\d{2}$/.test(m))
                .sort();
        } catch { continue; }
        if (!mmdds.length) continue;
        const [mm, dd] = mmdds[mmdds.length - 1].split('-');
        return new Date(Date.UTC(parseInt(year, 10), parseInt(mm, 10) - 1, parseInt(dd, 10)));
    }
    return null;
}

module.exports = function () {
    const index = buildIndex();
    // Anchor on the latest show's air date; fall back to today if no shows
    // are found (fresh repo, etc.).
    const anchor = latestShowDate() || new Date();
    // Anchor day + past WINDOW_DAYS-1 days as mm-dd strings.
    const windowDays = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
        const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() - i));
        windowDays.push(
            String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(d.getUTCDate()).padStart(2, '0')
        );
    }
    const bucket = windowDays.flatMap((mmdd) => index[mmdd] || []);
    // Seed with the window endpoints so picks are stable across rebuilds in
    // the same week but rotate when a new show shifts the anchor.
    const seed = hashStr(windowDays[0] + '|' + windowDays[WINDOW_DAYS - 1]);
    const picks = sample(bucket, 3, seed)
        .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest-first within picks
    return { window: windowDays, picks };
};
