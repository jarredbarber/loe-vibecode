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

function sample(arr, n) {
    if (arr.length <= n) return arr.slice();
    const copy = arr.slice();
    const out = [];
    for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * copy.length);
        out.push(copy.splice(idx, 1)[0]);
    }
    return out;
}

module.exports = function () {
    const index = buildIndex();
    const now = new Date();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const today = `${mm}-${dd}`;
    const bucket = index[today] || [];
    const picks = sample(bucket, 3)
        .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest-first within picks
    return { today, picks };
};
