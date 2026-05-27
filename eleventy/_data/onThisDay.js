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

// 10-day rolling window — the build runs on push, not nightly, so a
// Tuesday deploy can be shown all week. Pulling from a window of the past
// 10 days keeps the section reasonable when shown days after a build.
const WINDOW_DAYS = 10;

module.exports = function () {
    const index = buildIndex();
    const now = new Date();
    // Today + the past WINDOW_DAYS-1 calendar days as mm-dd strings.
    const windowDays = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
        windowDays.push(
            String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(d.getUTCDate()).padStart(2, '0')
        );
    }
    const bucket = windowDays.flatMap((mmdd) => index[mmdd] || []);
    // Seed with the window endpoints so picks stay stable across rebuilds
    // within the same week but rotate as the window slides.
    const seed = hashStr(windowDays[0] + '|' + windowDays[WINDOW_DAYS - 1]);
    const picks = sample(bucket, 3, seed)
        .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest-first within picks
    return { window: windowDays, picks };
};
