/**
 * Eleventy transform — JS port of plugins/speaker_highlight/__init__.py.
 *
 * Walks the rendered HTML of segment/show pages and:
 *   1. Wraps speaker labels (CURWOOD:, O'NEILL:, McKIBBEN:, MAN 1:) in
 *      <span class="speaker"> at the start of <p> tags.
 *   2. Groups consecutive speaker paragraphs into <div class="transcript-block">
 *      so the theme can style runs of dialogue.
 *   3. Converts standalone <p><img alt="caption"></p> blocks to
 *      <figure><img><figcaption>caption</figcaption></figure>.
 *
 * Uses cheerio (jQuery-like API on top of parse5) — same shape as the
 * Python plugin which used BeautifulSoup.
 */

const cheerio = require('cheerio');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SPEAKER_RE = /^\s*([A-Z](?:[A-Z'’\d\s.]|[a-z]{1,2}(?=[A-Z]))+):/;

// ── Persistent transform cache ──────────────────────────────────────────────
// This cheerio transform is ~44% of total build time and is a pure function of
// the page HTML. The archive (~12k pages) never changes between builds, so we
// cache transform(html) keyed by sha1(html) and skip the cheerio parse on hits.
//
// Pages are fully build-deterministic (no date/time in output), so the cache
// persists indefinitely across builds — a page only re-runs cheerio if its
// rendered HTML actually changed. We MERGE (load existing, add new, write all)
// rather than prune to this build's pages: other builds share this file (the
// test suite builds fixture content through the same plugin), and pruning would
// let a small/partial build wipe the full cache. Growth is slow (only changed
// pages add entries; stale ones linger harmlessly); CACHE_VERSION resets it all
// when the transform logic changes.
const CACHE_VERSION = 'v2';
const CACHE_FILE = path.resolve(__dirname, '..', '.cache', 'speaker-highlight.json');
let _cache = null;
let _dirty = false;
function loadCache() {
    if (_cache) return _cache;
    _cache = new Map();
    try {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (data.version === CACHE_VERSION) {
            _cache = new Map(Object.entries(data.entries));
        }
    } catch { /* no/stale cache — start fresh */ }
    return _cache;
}
function flushCache() {
    if (!_dirty || !_cache) return;
    try {
        fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            version: CACHE_VERSION, entries: Object.fromEntries(_cache),
        }));
        _dirty = false;
    } catch { /* best-effort cache; ignore write failures */ }
}
function cachedTransform(html) {
    if (!html || typeof html !== 'string') return html;
    // Cheap early-out (also avoids hashing pages with nothing to do).
    if (!SPEAKER_RE.test(html) && !html.includes('<img')) return html;
    const cache = loadCache();
    const key = crypto.createHash('sha1').update(html).digest('hex');
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const out = transform(html);
    cache.set(key, out);
    _dirty = true;
    return out;
}

function transform(html) {
    if (!html || typeof html !== 'string') return html;
    if (!SPEAKER_RE.test(html) && !html.includes('<img')) return html;

    const $ = cheerio.load(html, null, false);

    // Process every parent that contains a speaker <p>, scoping the
    // transcript-block grouping to that parent's direct children.
    const speakerParas = $('p').filter((_, p) => SPEAKER_RE.test($(p).text()));
    const parents = new Set();
    speakerParas.each((_, p) => parents.add(p.parent));

    for (const parent of parents) {
        if (!parent) continue;
        const $parent = $(parent);
        const siblings = $parent.contents().toArray();
        let currentBlock = null;
        let inSpeakerSection = false;

        for (const el of siblings) {
            if (el.type !== 'tag') continue;
            const $el = $(el);
            const tag = el.name;

            if (tag === 'p' && SPEAKER_RE.test($el.text())) {
                inSpeakerSection = true;
                highlightSpeaker($, $el);
                currentBlock = $('<div class="transcript-block"></div>');
                $el.before(currentBlock);
                currentBlock.append($el);
            } else if (inSpeakerSection) {
                const isBreak = ['h1', 'h2', 'h3', 'section'].includes(tag);
                const isMedia =
                    tag === 'img' ||
                    tag === 'iframe' ||
                    tag === 'figure' ||
                    $el.find('img,iframe').length > 0;
                if (isBreak) {
                    inSpeakerSection = false;
                    currentBlock = null;
                } else if (isMedia) {
                    currentBlock = null;
                    convertImgToFigure($, $el);
                } else if (currentBlock) {
                    currentBlock.append($el);
                }
            }
        }
    }

    // Also handle standalone <p><img alt=...></p> blocks anywhere (image
    // captions on pages without speaker dialogue still need figure wrapping).
    $('p').each((_, p) => {
        if (!$(p).parents('.transcript-block').length) {
            convertImgToFigure($, $(p));
        }
    });

    return $.html();
}

function highlightSpeaker($, $p) {
    const text = $p.text();
    const m = text.match(SPEAKER_RE);
    if (!m) return;
    const name = m[1];
    // Find the first text node in the paragraph that contains the label,
    // split it, wrap the label in <span class="speaker">.
    const firstChild = $p.contents().get(0);
    if (firstChild && firstChild.type === 'text' && firstChild.data.startsWith(name + ':')) {
        const rest = firstChild.data.slice(name.length + 1);
        $(firstChild).replaceWith(`<span class="speaker">${name}:</span>${rest}`);
    }
}

function convertImgToFigure($, $el) {
    // <p><img alt="caption"></p> → <figure><img><figcaption>caption</figcaption></figure>.
    if ($el.get(0).name !== 'p') return;
    const text = $el.text().trim();
    if (text) return; // <p> has other content beyond the image
    const $img = $el.find('img').first();
    if (!$img.length) return;
    const alt = ($img.attr('alt') || '').trim();
    if (!alt) return;
    const figure = $('<figure></figure>');
    figure.append($img.clone());
    figure.append(`<figcaption>${escapeHtml(alt)}</figcaption>`);
    $el.replaceWith(figure);
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

module.exports = function (eleventyConfig) {
    eleventyConfig.addTransform('speaker-highlight', function (content) {
        // Only run on HTML output.
        if (!String(this.page.outputPath || '').endsWith('.html')) return content;
        return cachedTransform(content);
    });
    // Persist the cache once the build finishes so the next build is warm.
    eleventyConfig.on('eleventy.after', flushCache);
};
