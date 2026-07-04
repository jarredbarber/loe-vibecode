# Single-file Chapter Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let new shows chapter a single full-episode mp3 by per-segment timestamps instead of shipping one Megaphone file per segment, while leaving the ~1.6k legacy multi-file shows untouched.

**Architecture:** Field-presence drives the mode (no flags). A *segment* with a `start:` timecode becomes a window into the show's full-episode file (the show's own `megaphone_id`); a segment without `start:` keeps playing its own `megaphone_id`. A *show* whose segments all have `start:` renders one full-file player with chapter seeks; otherwise it renders today's N-file sequential player. Timecodes are parsed to integer seconds at build time by a new `tcToSeconds` filter, so the browser only ever sees ints in `data-*` attributes. The player JS gains a dedicated full-file branch (chaptered show + windowed segment), ported from the proven `content/chapter-demo.njk` prototype; the legacy multi-file path is left exactly as-is.

**Tech Stack:** Eleventy 3 (Nunjucks), CommonJS plugins (`eleventy/plugins/*.js`), vanilla browser JS (`static/js/episode-player.js`), `node:test` + cheerio golden tests, Sveltia CMS (`content/admin/config.njk`).

**Reference (read before starting):** `docs/superpowers/specs/2026-06-02-single-file-chapter-player-design.md` (design) and `content/chapter-demo.njk` (working prototype of both playback behaviors — the JS in Task 5 is adapted from it).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `eleventy/plugins/filters.js` | modify | Add `tcToSeconds(tc)` filter + export it for unit testing. |
| `eleventy/plugins/collections.js` | modify | Add `showForDate(date, shows)` filter (date→show index, mirror of `segmentsForShow`). |
| `eleventy/_includes/layouts/show.njk` | modify | Build windowed vs legacy `_audioTracks` per segment. |
| `eleventy/_includes/modules/audio-player.njk` | modify | Emit `data-full`/`data-start`/`data-dur` for windowed tracks; keep `data-id` for legacy. |
| `eleventy/_includes/layouts/article.njk` | modify | Pass `start`/`duration` into the shared `entry` object. |
| `eleventy/_includes/modules/_article_header.njk` | modify | Windowed `--single` player for a standalone segment that has `start`. |
| `static/js/episode-player.js` | modify | Dispatch to a new `initWindowed()` for chaptered/windowed players; legacy path untouched. |
| `scripts/check-show.mjs` | modify | Validate `start`/`duration` shape, require show `megaphone_id`, warn on partial conversion. |
| `content/admin/config.njk` | modify | Optional `start`/`duration` segment fields. |
| `tests/test_render.mjs` | modify | Golden tests for chaptered show, windowed segment, legacy regression, `tcToSeconds`. |
| `tests/fixtures/content/shows/2099/02-02/show.md` | create | Chaptered fixture show. |
| `tests/fixtures/content/segments/2099/02-02/world-cup-warming.md` | create | Windowed fixture segment (has `start`). |
| `tests/fixtures/content/segments/2099/02-02/sea-lavender-carbon.md` | create | Windowed fixture segment (has `start`). |

---

## Task 1: `tcToSeconds` build-time filter

**Files:**
- Modify: `eleventy/plugins/filters.js`
- Test: `tests/test_render.mjs` (unit test appended at end)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_render.mjs` (after the last test, before EOF). Add this import near the top with the other imports:

```js
import filtersPlugin from '../eleventy/plugins/filters.js';
```

Then append:

```js
// 8. tcToSeconds parses MM:SS, H:MM:SS, and bare seconds.
test('tcToSeconds parses timecodes to integer seconds', () => {
    const { tcToSeconds } = filtersPlugin;
    assert.equal(tcToSeconds('12:09'), 729);
    assert.equal(tcToSeconds('1:02:03'), 3723);
    assert.equal(tcToSeconds('134'), 134);
    assert.equal(tcToSeconds(134), 134);
    assert.equal(tcToSeconds('0:00'), 0);
    assert.equal(tcToSeconds(''), null);
    assert.equal(tcToSeconds(null), null);
    assert.equal(tcToSeconds('garbage'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern='tcToSeconds' tests/test_render.mjs`
Expected: FAIL — `tcToSeconds` is `undefined` (filtersPlugin has no such property yet).

- [ ] **Step 3: Implement the filter and export it**

In `eleventy/plugins/filters.js`, add this function near the other helpers (e.g. just after `stripQuotes`):

```js
/**
 * Parse a human timecode to integer seconds. Accepts "MM:SS", "H:MM:SS",
 * a bare integer-seconds string, or a number. Returns null for empty/garbage
 * so callers (and the player) can treat "no timecode" distinctly from 0:00.
 */
function tcToSeconds(tc) {
    if (tc === null || tc === undefined || tc === '') return null;
    if (typeof tc === 'number') return Number.isFinite(tc) ? Math.round(tc) : null;
    const s = String(tc).trim();
    if (s === '') return null;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (!/^\d+(:\d{1,2})+$/.test(s)) return null;
    let sec = 0;
    for (const part of s.split(':')) sec = sec * 60 + parseInt(part, 10);
    return sec;
}
```

Register it inside the exported `module.exports = function (eleventyConfig) { ... }`, alongside the other `addFilter` calls:

```js
    eleventyConfig.addFilter('tcToSeconds', tcToSeconds);
```

Then, at the very bottom of the file (after the `module.exports = function ...` block closes), attach the helper to the exported function so the unit test can import it:

```js
module.exports.tcToSeconds = tcToSeconds;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern='tcToSeconds' tests/test_render.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eleventy/plugins/filters.js tests/test_render.mjs
git commit -m "feat: add tcToSeconds timecode filter for chapter player"
```

---

## Task 2: `showForDate` filter

**Files:**
- Modify: `eleventy/plugins/collections.js:230-235` (add a second filter next to `segmentsForShow`)

This filter is exercised end-to-end by the Task 6 golden test (windowed segment page). No standalone unit test — it's a thin index lookup mirroring the already-tested `segmentsForShow`.

- [ ] **Step 1: Add the filter**

In `eleventy/plugins/collections.js`, immediately after the existing `eleventyConfig.addFilter('segmentsForShow', ...)` block (ends at line ~235), add:

```js
    // Reverse of segmentsForShow: given a date and the shows collection,
    // return that date's show entry (or null). Used by a standalone segment
    // page to resolve its parent show's full-episode megaphone_id for
    // windowed playback. O(1) after a one-time index, cached on the array.
    eleventyConfig.addFilter('showForDate', function (date, shows) {
        if (!date || !shows) return null;
        if (!shows.__byDate) {
            const idx = new Map();
            for (const s of shows) {
                const d = s.data ? s.data.date : s.date;
                const key = new Date(d).toISOString().slice(0, 10);
                if (!idx.has(key)) idx.set(key, s);
            }
            Object.defineProperty(shows, '__byDate', { value: idx, enumerable: false });
        }
        const key = new Date(date).toISOString().slice(0, 10);
        return shows.__byDate.get(key) || null;
    });
```

- [ ] **Step 2: Verify the build still loads the plugin**

Run: `npm --prefix eleventy run build`
Expected: build completes with no Nunjucks/plugin errors (full output ends with "Wrote N files" / "Copied …"). This confirms the new filter registers cleanly; behavior is asserted in Task 6.

- [ ] **Step 3: Commit**

```bash
git add eleventy/plugins/collections.js
git commit -m "feat: add showForDate filter for windowed segment pages"
```

---

## Task 3: Build windowed `_audioTracks` in the show layout

**Files:**
- Modify: `eleventy/_includes/layouts/show.njk:17-22`

Today every segment pushes `{ id: <segment megaphone_id>, ... }`. We change it so a segment with `start` instead pushes a windowed track `{ full: <show megaphone_id>, start, dur, ... }`. Mixed shows degrade to legacy (a segment without `start` still pushes its own id; the player only enters chaptered mode when *every* track is windowed — Task 5).

- [ ] **Step 1: Replace the track-building loop**

Replace lines 17-22 of `eleventy/_includes/layouts/show.njk`:

```njk
{# Chapter the episode player by segment: each segment is its own enclosure
   mp3, played sequentially. Read by _article_header.njk → audio-player macro. #}
{% set _audioTracks = [] %}
{% for segment in segments %}
    {% if segment.data.megaphone_id %}{% set _ = _audioTracks.push({ id: segment.data.megaphone_id, title: segment.data.title, art: segment.data.image_url or segment.data.banner_url }) %}{% endif %}
{% endfor %}
```

with:

```njk
{# Chapter the episode player by segment. A segment with `start` is a window
   into the show's full-episode file (the show's own megaphone_id) — that
   produces a single-file chaptered player (see episode-player.js). A segment
   without `start` keeps its own enclosure mp3 (legacy multi-file path). Read
   by _article_header.njk → audio-player macro. #}
{% set _audioTracks = [] %}
{% for segment in segments %}
    {% if segment.data.start and megaphone_id %}
        {% set _ = _audioTracks.push({ full: megaphone_id, start: (segment.data.start | tcToSeconds), dur: (segment.data.duration | tcToSeconds), title: segment.data.title, art: segment.data.image_url or segment.data.banner_url }) %}
    {% elif segment.data.megaphone_id %}
        {% set _ = _audioTracks.push({ id: segment.data.megaphone_id, title: segment.data.title, art: segment.data.image_url or segment.data.banner_url }) %}
    {% endif %}
{% endfor %}
```

Note: `megaphone_id` here is the show's own frontmatter field (a top-level template variable in `show.njk`), i.e. the full-episode file.

- [ ] **Step 2: Verify the build still renders shows**

Run: `npm --prefix eleventy run build`
Expected: build completes with no errors. (Markup assertions land in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add eleventy/_includes/layouts/show.njk
git commit -m "feat: build windowed audio tracks for shows with segment timestamps"
```

---

## Task 4: Emit windowed data attributes in the player macro

**Files:**
- Modify: `eleventy/_includes/modules/audio-player.njk:35-39`

- [ ] **Step 1: Replace the chapter `<li>` emission**

Replace the `<ul class="ep-chaps">` block (lines 35-39):

```njk
    <ul class="ep-chaps">
        {% for t in tracks %}
        <li class="ep-chap" data-id="{{ t.id }}" data-i="{{ loop.index0 }}" data-art="{{ t.art }}"><span class="ep-chap-n">{{ loop.index }}</span><span class="ep-chap-t">{{ t.title | stripQuotes }}</span></li>
        {% endfor %}
    </ul>
```

with:

```njk
    <ul class="ep-chaps">
        {% for t in tracks %}
        {% if t.full %}
        <li class="ep-chap" data-full="{{ t.full }}" data-start="{{ t.start }}"{% if t.dur != null %} data-dur="{{ t.dur }}"{% endif %} data-i="{{ loop.index0 }}" data-art="{{ t.art }}"><span class="ep-chap-n">{{ loop.index }}</span><span class="ep-chap-t">{{ t.title | stripQuotes }}</span></li>
        {% else %}
        <li class="ep-chap" data-id="{{ t.id }}" data-i="{{ loop.index0 }}" data-art="{{ t.art }}"><span class="ep-chap-n">{{ loop.index }}</span><span class="ep-chap-t">{{ t.title | stripQuotes }}</span></li>
        {% endif %}
        {% endfor %}
    </ul>
```

- [ ] **Step 2: Verify the build**

Run: `npm --prefix eleventy run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add eleventy/_includes/modules/audio-player.njk
git commit -m "feat: emit windowed track data attributes in audio-player macro"
```

---

## Task 5: Full-file playback in the player JS

**Files:**
- Modify: `static/js/episode-player.js`

We add a dedicated full-file branch and dispatch to it early in `init()`, leaving the legacy multi-file code path completely untouched. Logic is adapted from the proven `content/chapter-demo.njk` prototype (player 1 = chaptered, player 2 = windowed), folded into one function with a `mode` argument.

This is browser code with no unit-test harness — the golden tests (Task 9) assert the *markup* the JS consumes; runtime behavior is verified manually in Task 10's checkpoint. Keep edits surgical.

- [ ] **Step 1: Parse windowed fields when reading chapters**

In `init()`, replace the chapter-parsing map (currently lines ~50-52):

```js
        var chapters = [].slice.call(el.querySelectorAll('.ep-chap')).map(function (li) {
            return { id: li.dataset.id, title: (li.querySelector('.ep-chap-t') || {}).textContent || '', art: li.dataset.art || '' };
        });
```

with:

```js
        var chapters = [].slice.call(el.querySelectorAll('.ep-chap')).map(function (li) {
            return {
                id: li.dataset.id,
                full: li.dataset.full || null,
                start: li.dataset.start != null ? parseInt(li.dataset.start, 10) : null,
                dur: li.dataset.dur != null ? parseInt(li.dataset.dur, 10) : null,
                title: (li.querySelector('.ep-chap-t') || {}).textContent || '',
                art: li.dataset.art || ''
            };
        });
```

- [ ] **Step 2: Dispatch to the full-file branch**

Immediately after the `var all = chapters.concat(queue); if (!all.length) return;` line (currently ~57-58) and BEFORE the existing `var multi = ...` line, insert the dispatch:

```js
        // Full-file modes (single mp3, no per-chapter src reload):
        //   chaptered — a show whose every chapter is a window into the full
        //               file: chapter taps seek, playback flows continuously.
        //   windowed  — a standalone segment page playing only [start,start+dur].
        // Anything not fully windowed falls through to the legacy multi-file path.
        var windowedChaps = chapters.filter(function (c) { return c.full && c.start != null; });
        if (windowedChaps.length === chapters.length && windowedChaps.length) {
            if (el.classList.contains('episode-player--single') && chapters.length === 1) {
                initWindowed(el, applyUrl, chapters, 'windowed');
            } else {
                initWindowed(el, applyUrl, chapters, 'chaptered');
            }
            return;
        }
```

- [ ] **Step 3: Add the `initWindowed` function**

Add this new function at module scope, just before the existing `function init(el, applyUrl) {` declaration:

```js
    // Full-file player: one mp3 (the show's full episode), chapters are offsets.
    // mode 'chaptered' — multi-chapter show; taps seek; continuous playback.
    // mode 'windowed'  — single segment; plays only [start, start+dur]; stops.
    function initWindowed(el, applyUrl, chapters, mode) {
        var Q = function (s) { return el.querySelector(s); };
        var audio = new Audio(); audio.preload = 'metadata';
        audio.src = mp3(chapters[0].full);
        var play = Q('.ep-play'), bar = Q('.ep-bar'), fill = Q('.ep-fill'), buf = Q('.ep-buf'),
            curEl = Q('.ep-cur'), durEl = Q('.ep-dur'), now = Q('.ep-now'), spd = Q('.ep-spd');
        var speeds = [0.8, 1, 1.5, 2], si = 1;
        var started = false, reached = {};
        var fullId = chapters[0].full;
        var posKey = 'ep-pos-' + fullId + (mode === 'windowed' ? '-w' + chapters[0].start : '');

        // Window bounds for chapter i: [start, end). End is the next chapter's
        // start, or start+dur, or the file end. In chaptered mode we do NOT stop
        // at the boundary (winEnd governs the scrubber/labels only via highlight).
        function endOf(i) {
            if (i + 1 < chapters.length) return chapters[i + 1].start;
            if (chapters[i].dur != null) return chapters[i].start + chapters[i].dur;
            return audio.duration || null;
        }

        function track2(name, extra) {
            var c = chapters[curCh] || chapters[0] || {};
            track(name, Object.assign({
                episode_id: fullId, episode_title: c.title,
                position: Math.round(audio.currentTime) || 0,
                duration: Math.round(audio.duration) || undefined,
                player: 'loe-web'
            }, extra || {}));
        }

        // ── chaptered: whole-file scrubber, chapter list seeks + highlights ──
        var curCh = mode === 'windowed' ? 0 : -1;
        function chapterAt(t) { var idx = 0; for (var i = 0; i < chapters.length; i++) { if (t >= chapters[i].start) idx = i; } return idx; }
        function highlight(i) {
            if (i === curCh) return; curCh = i;
            el.querySelectorAll('.ep-chap').forEach(function (c) { c.classList.toggle('ep-cur', +c.dataset.i === i); });
            setMediaMeta(i);
        }
        function setMediaMeta(i) {
            if (!('mediaSession' in navigator)) return;
            var t = chapters[i] || chapters[0];
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: t.title, artist: 'Living on Earth', album: 'Living on Earth',
                    artwork: t.art ? [{ src: t.art, sizes: '512x512', type: 'image/jpeg' }] : []
                });
            } catch (e) { /* ignore */ }
        }

        // ── windowed: scrubber + labels relative to the single segment window ──
        var winStart = mode === 'windowed' ? chapters[0].start : 0;
        var winEnd = null; // resolved on loadedmetadata for windowed mode

        function fmtLocal(s) { return fmt(s); }

        audio.addEventListener('loadedmetadata', function () {
            if (mode === 'windowed') {
                winEnd = endOf(0);
                durEl.textContent = winEnd != null ? fmt(winEnd - winStart) : fmt(audio.duration);
                if (now) now.textContent = chapters[0].title;
                var resume = parseFloat(localStorage.getItem(posKey));
                audio.currentTime = (resume && resume > winStart && (winEnd == null || resume < winEnd)) ? resume : winStart;
                setMediaMeta(0);
            } else {
                durEl.textContent = fmt(audio.duration);
                var r = parseFloat(localStorage.getItem(posKey)) || 0;
                if (r > 0 && r < audio.duration) audio.currentTime = r;
                highlight(chapterAt(audio.currentTime));
            }
        });

        var tick = 0;
        audio.addEventListener('timeupdate', function () {
            if (mode === 'windowed') {
                if (winEnd == null) { winEnd = endOf(0); }
                if (audio.currentTime < winStart) { audio.currentTime = winStart; return; }
                if (winEnd != null && audio.currentTime >= winEnd) {
                    audio.pause(); track2('audio_complete', { percent: 100 });
                    localStorage.removeItem(posKey); audio.currentTime = winStart; return;
                }
                var len = (winEnd || audio.duration) - winStart, rel = audio.currentTime - winStart;
                fill.style.right = (100 - rel / len * 100) + '%';
                curEl.textContent = fmt(rel);
                if (audio.buffered.length) { var be = audio.buffered.end(audio.buffered.length - 1); fill.parentNode && (buf.style.right = (100 - Math.max(0, Math.min(1, (be - winStart) / len)) * 100) + '%'); }
                if (started && len > 0) {
                    var pcw = rel / len * 100;
                    [25, 50, 75].forEach(function (q) { if (pcw >= q && !reached[q]) { reached[q] = true; track2('audio_progress', { percent: q }); } });
                }
            } else {
                var d = audio.duration || 1;
                fill.style.right = (100 - audio.currentTime / d * 100) + '%';
                curEl.textContent = fmt(audio.currentTime);
                if (audio.buffered.length) buf.style.right = (100 - audio.buffered.end(audio.buffered.length - 1) / d * 100) + '%';
                highlight(chapterAt(audio.currentTime));
                if (started && audio.duration) {
                    var pc = audio.currentTime / audio.duration * 100;
                    [25, 50, 75].forEach(function (q) { if (pc >= q && !reached[q]) { reached[q] = true; track2('audio_progress', { percent: q }); } });
                }
            }
            if (++tick % 10 === 0) localStorage.setItem(posKey, audio.currentTime);
            if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && isFinite(audio.duration)) {
                try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: audio.playbackRate }); } catch (e) { /* ignore */ }
            }
        });

        audio.addEventListener('play', function () {
            play.textContent = '❚❚'; play.setAttribute('aria-label', 'Pause');
            if (!started) { started = true; track2('audio_play'); }
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        });
        audio.addEventListener('pause', function () {
            play.textContent = '▶'; play.setAttribute('aria-label', 'Play');
            localStorage.setItem(posKey, audio.currentTime);
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        });
        audio.addEventListener('ended', function () {
            track2('audio_complete', { percent: 100 });
            localStorage.removeItem(posKey);
        });

        play.addEventListener('click', function () {
            if (mode === 'windowed' && (audio.currentTime < winStart || (winEnd != null && audio.currentTime >= winEnd))) audio.currentTime = winStart;
            audio.paused ? audio.play() : audio.pause();
        });
        Q('.ep-back').addEventListener('click', function () {
            var lo = mode === 'windowed' ? winStart : 0;
            audio.currentTime = Math.max(lo, audio.currentTime - 15);
        });
        Q('.ep-fwd').addEventListener('click', function () {
            var hi = mode === 'windowed' && winEnd != null ? winEnd : (audio.duration || 0);
            audio.currentTime = Math.min(hi, audio.currentTime + 15);
        });
        bar.addEventListener('click', function (e) {
            var r = bar.getBoundingClientRect(), frac = (e.clientX - r.left) / r.width;
            if (mode === 'windowed') {
                if (winEnd == null) return;
                audio.currentTime = winStart + frac * (winEnd - winStart);
            } else {
                audio.currentTime = frac * (audio.duration || 0);
            }
        });
        bar.addEventListener('keydown', function (e) {
            var lo = mode === 'windowed' ? winStart : 0;
            var hi = mode === 'windowed' && winEnd != null ? winEnd : (audio.duration || 0);
            if (e.key === 'ArrowRight') { audio.currentTime = Math.min(hi, audio.currentTime + 5); e.preventDefault(); }
            else if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(lo, audio.currentTime - 5); e.preventDefault(); }
            else if (e.key === ' ' || e.key === 'Enter') { audio.paused ? audio.play() : audio.pause(); e.preventDefault(); }
        });
        spd.addEventListener('click', function () {
            si = (si + 1) % speeds.length; audio.playbackRate = speeds[si]; spd.textContent = speeds[si] + '×';
        });

        // Chapter list: chaptered → seek; windowed page has only one chapter
        // (clicking it just restarts the window).
        el.querySelectorAll('.ep-chap').forEach(function (c) {
            c.addEventListener('click', function () {
                var i = +c.dataset.i;
                if (mode === 'windowed') { audio.currentTime = winStart; audio.play(); return; }
                audio.currentTime = chapters[i].start; highlight(i); audio.play();
            });
        });

        if ('mediaSession' in navigator) {
            var ms = navigator.mediaSession, H = function (a, fn) { try { ms.setActionHandler(a, fn); } catch (e) { /* unsupported */ } };
            H('play', function () { audio.play(); });
            H('pause', function () { audio.pause(); });
            H('seekbackward', function (e) { var lo = mode === 'windowed' ? winStart : 0; audio.currentTime = Math.max(lo, audio.currentTime - ((e && e.seekOffset) || 15)); });
            H('seekforward', function (e) { var hi = mode === 'windowed' && winEnd != null ? winEnd : (audio.duration || 0); audio.currentTime = Math.min(hi, audio.currentTime + ((e && e.seekOffset) || 15)); });
            if (mode === 'chaptered') {
                H('previoustrack', function () { var i = Math.max(0, chapterAt(audio.currentTime) - 1); audio.currentTime = chapters[i].start; highlight(i); });
                H('nexttrack', function () { var i = Math.min(chapters.length - 1, chapterAt(audio.currentTime) + 1); audio.currentTime = chapters[i].start; highlight(i); });
            }
        }
    }
```

Note on glyphs: the existing file uses literal `❚❚`, `▶`, `×` characters. The escapes above (`❚`, `▶`, `×`) render identically — you may paste the literal characters instead to match surrounding style.

- [ ] **Step 4: Lint-check the file parses**

Run: `node --check static/js/episode-player.js`
Expected: no output (exit 0) — file is syntactically valid.

- [ ] **Step 5: Verify legacy path still builds into a page**

Run: `npm --prefix eleventy run build`
Expected: build completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add static/js/episode-player.js
git commit -m "feat: full-file chaptered + windowed playback in episode player"
```

---

## Task 6: Windowed player on standalone segment pages

**Files:**
- Modify: `eleventy/_includes/layouts/article.njk:4-6`
- Modify: `eleventy/_includes/modules/_article_header.njk:70-86`

A standalone segment page renders via `article.njk` → `_article_header.njk`. Today the header builds a single own-file player from `entry.megaphone_id`. When the segment has `start`, render a windowed `--single` player against the parent show's full-episode id instead.

- [ ] **Step 1: Pass `start`/`duration` into `entry`**

In `eleventy/_includes/layouts/article.njk`, extend the `entry` object (lines 4-6):

```njk
{% set entry = { title: title, date: date, summary: summary,
    banner_url: banner_url, image_url: image_url, image_caption: image_caption,
    megaphone_id: megaphone_id, audio_url: audio_url } %}
```

to:

```njk
{% set entry = { title: title, date: date, summary: summary,
    banner_url: banner_url, image_url: image_url, image_caption: image_caption,
    megaphone_id: megaphone_id, audio_url: audio_url,
    start: start, duration: duration } %}
```

- [ ] **Step 2: Add the windowed branch to the header's player selection**

In `eleventy/_includes/modules/_article_header.njk`, replace the player-selection block (lines 70-86):

```njk
{% if _audioTracks and _audioTracks.length %}
{{ player(_audioTracks, false, entry.megaphone_id) }}
{% elif entry.megaphone_id %}
{# Up-next radio queue: related segments that have their own audio. #}
{% set _related = page.inputPath | relatedForSegment %}
{% set _queue = [] %}
{% for r in _related %}{% if r.megaphoneId %}{% set _ = _queue.push({ id: r.megaphoneId, title: r.title, art: r.art }) %}{% endif %}{% endfor %}
{{ player([{ id: entry.megaphone_id, title: entry.title, art: entry.image_url }], true, entry.megaphone_id, _queue) }}
{% elif entry.audio_url %}
```

with (insert a new windowed branch as the FIRST `{% if %}` so `_audioTracks` — which only shows pass — still wins on show pages):

```njk
{% if _audioTracks and _audioTracks.length %}
{{ player(_audioTracks, false, entry.megaphone_id) }}
{% elif entry.start %}
{# Windowed segment: a slice of the parent show's full-episode file. The show
   (resolved by date) carries the full mp3 as its own megaphone_id. #}
{% set _show = entry.date | showForDate(collections.shows) %}
{% if _show and _show.data.megaphone_id %}
{{ player([{ full: _show.data.megaphone_id, start: (entry.start | tcToSeconds), dur: (entry.duration | tcToSeconds), title: entry.title, art: entry.image_url }], true, _show.data.megaphone_id) }}
{% elif entry.megaphone_id %}
{{ player([{ id: entry.megaphone_id, title: entry.title, art: entry.image_url }], true, entry.megaphone_id) }}
{% endif %}
{% elif entry.megaphone_id %}
{# Up-next radio queue: related segments that have their own audio. #}
{% set _related = page.inputPath | relatedForSegment %}
{% set _queue = [] %}
{% for r in _related %}{% if r.megaphoneId %}{% set _ = _queue.push({ id: r.megaphoneId, title: r.title, art: r.art }) %}{% endif %}{% endfor %}
{{ player([{ id: entry.megaphone_id, title: entry.title, art: entry.image_url }], true, entry.megaphone_id, _queue) }}
{% elif entry.audio_url %}
```

(The trailing `<div class="audio">…` / `{% endif %}` after this block is unchanged.)

- [ ] **Step 3: Verify the build**

Run: `npm --prefix eleventy run build`
Expected: build completes with no errors. (Assertions in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add eleventy/_includes/layouts/article.njk eleventy/_includes/modules/_article_header.njk
git commit -m "feat: windowed player on standalone segment pages with start timecode"
```

---

## Task 7: check-show validation for timecodes

**Files:**
- Modify: `scripts/check-show.mjs` — `validateFrontmatter` (lines 63-82) and the doc-collection block (lines 197-217)

`parseFrontmatter` already captures single-line `start: "12:09"` / `duration: "8:32"` as strings (quotes stripped). We add: timecode shape validation; require the show to have a `megaphone_id` when any segment has `start`; warn on a partially-converted show.

- [ ] **Step 1: Add a timecode shape check in `validateFrontmatter`**

In `scripts/check-show.mjs`, inside `validateFrontmatter`, just before `return findings;` (line 81), add:

```js
    const TC_RE = /^(\d+|\d+(:\d{1,2})+)$/;
    for (const field of ['start', 'duration']) {
        if (doc.fm[field] && !TC_RE.test(doc.fm[field])) {
            findings.push({ level: 'fail', msg: `${field} "${doc.fm[field]}" is not a timecode (MM:SS, H:MM:SS, or seconds)` });
        }
    }
    if (doc.kind === 'segment' && doc.fm.start && !doc.fm.duration) {
        findings.push({ level: 'warn', msg: 'segment has start but no duration — windowed player will run to the next chapter / file end' });
    }
```

- [ ] **Step 2: Add show-level cross-checks after docs are collected**

In the main IIFE, after the per-doc `validateFrontmatter` loop (after line 217, the block that ends `for (const f of docFindings) note(...)`), add:

```js
        // Single-file chapter player cross-checks: a segment with `start` is a
        // window into the show's full-episode file, so the show MUST carry a
        // megaphone_id. A half-converted show (some segments windowed, some not)
        // silently falls back to the legacy multi-file player — warn the editor.
        const showDoc = docs.find((d) => d.kind === 'show');
        const segDocs = docs.filter((d) => d.kind === 'segment');
        const windowed = segDocs.filter((d) => d.fm.start);
        if (windowed.length && !(showDoc && showDoc.fm.megaphone_id)) {
            note('fail', relpath(showDoc.path), 'segments have start timecodes but the show has no megaphone_id (the full-episode file)');
        }
        if (windowed.length && windowed.length !== segDocs.length) {
            note('warn', relpath(showDoc.path), `partial chapter conversion: ${windowed.length}/${segDocs.length} segments have start — show will use the legacy multi-file player`);
        }
```

- [ ] **Step 3: Run the checker against a real legacy show (regression — must not newly fail)**

Run: `npm run check-show -- --date 2026-05-29`
Expected: completes; the new checks add no failures for this legacy show (no segment has `start`). Pre-existing URL warnings/results are unchanged.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-show.mjs
git commit -m "feat: validate segment start/duration timecodes in check-show"
```

---

## Task 8: CMS fields for start/duration

**Files:**
- Modify: `content/admin/config.njk:84-94` (segments collection `fields`)

- [ ] **Step 1: Add the two optional fields**

In `content/admin/config.njk`, in the `segments` collection `fields:` list, add after the `Order` field (line 92):

```njk
      - { label: 'Segment start (timecode)', name: 'start', widget: 'string', required: false, pattern: ['^(\\d+|\\d+(:\\d{1,2})+)$', 'Use MM:SS, H:MM:SS, or seconds'], hint: 'Offset of this segment in the full-show audio, e.g. 12:09. Leave blank to use a separate per-segment Megaphone file.' }
      - { label: 'Segment duration (timecode)', name: 'duration', widget: 'string', required: false, pattern: ['^(\\d+|\\d+(:\\d{1,2})+)$', 'Use MM:SS, H:MM:SS, or seconds'], hint: 'Length of this segment, e.g. 8:32.' }
```

- [ ] **Step 2: Verify the config template renders**

Run: `npm --prefix eleventy run build`
Expected: build completes; `_site_11ty/admin/config.yml` exists and contains `name: 'start'` and `name: 'duration'`. Confirm:

Run: `grep -E "name: '(start|duration)'" _site_11ty/admin/config.yml`
Expected: both lines present.

- [ ] **Step 3: Commit**

```bash
git add content/admin/config.njk
git commit -m "feat: optional start/duration segment fields in CMS"
```

---

## Task 9: Golden tests + fixtures

**Files:**
- Create: `tests/fixtures/content/shows/2099/02-02/show.md`
- Create: `tests/fixtures/content/segments/2099/02-02/world-cup-warming.md`
- Create: `tests/fixtures/content/segments/2099/02-02/sea-lavender-carbon.md`
- Modify: `tests/test_render.mjs`

- [ ] **Step 1: Create the chaptered fixture show**

Create `tests/fixtures/content/shows/2099/02-02/show.md`:

```markdown
---
title: 'Living on Earth: February 2, 2099'
date: '2099-02-02'
category: Shows
template: show
megaphone_id: LOEFIXTURE0100
image_url: https://example.org/test/show2.jpg
summary: Fixture show exercising the single-file chaptered player.
---

## Segments

### [World Cup in a Warming World]({filename}world-cup-warming.md)

### [Sea Lavender Stores Carbon]({filename}sea-lavender-carbon.md)
```

- [ ] **Step 2: Create the two windowed fixture segments**

Create `tests/fixtures/content/segments/2099/02-02/world-cup-warming.md`:

```markdown
---
title: World Cup in a Warming World
date: '2099-02-02'
category: Segments
start: "12:09"
duration: "7:38"
image_url: https://example.org/test/worldcup.jpg
summary: Windowed segment fixture — has a start timecode, no own megaphone_id.
---

## Transcript

CURWOOD: A windowed segment plays a slice of the full show file.
```

Create `tests/fixtures/content/segments/2099/02-02/sea-lavender-carbon.md`:

```markdown
---
title: Sea Lavender Stores Carbon
date: '2099-02-02'
category: Segments
start: "19:47"
duration: "2:20"
image_url: https://example.org/test/sealavender.jpg
summary: Second windowed segment fixture for the chaptered show.
---

## Transcript

DOERING: The second chapter is another window into the same file.
```

- [ ] **Step 3: Add the page constants and golden tests**

In `tests/test_render.mjs`, add near the other page constants (after line 24):

```js
const CHAPTERED_SHOW = '2099_02_02_living-on-earth-february-2-2099.html';
const WINDOWED_SEGMENT = '2099_02_02_world-cup-warming.html';
```

Then append these tests:

```js
// 9. A show whose segments all have `start` renders a single-file chaptered
//    player: every chapter points at the show's full id via data-full +
//    data-start, and no chapter carries a per-segment data-id.
test('chaptered show renders single-file windowed chapters', () => {
    const $ = load(CHAPTERED_SHOW);
    const chaps = $('.episode-player .ep-chap');
    assert.ok(chaps.length >= 2, `expected >=2 chapters, got ${chaps.length}`);
    chaps.each((_, li) => {
        assert.equal($(li).attr('data-full'), 'LOEFIXTURE0100');
        assert.ok($(li).attr('data-start') !== undefined, 'chapter missing data-start');
        assert.equal($(li).attr('data-id'), undefined, 'windowed chapter must not have data-id');
    });
    // 12:09 -> 729, 19:47 -> 1187
    const starts = chaps.map((_, li) => $(li).attr('data-start')).get();
    assert.deepEqual(starts, ['729', '1187']);
});

// 10. The standalone segment page for a windowed segment renders a --single
//     windowed player against the parent show's full id, with data-dur.
test('windowed segment page renders --single windowed player', () => {
    const $ = load(WINDOWED_SEGMENT);
    const player = $('.episode-player--single');
    assert.equal(player.length, 1, 'expected one --single player');
    const li = player.find('.ep-chap');
    assert.equal(li.length, 1);
    assert.equal(li.attr('data-full'), 'LOEFIXTURE0100');
    assert.equal(li.attr('data-start'), '729');   // 12:09
    assert.equal(li.attr('data-dur'), '458');     // 7:38
    assert.equal(li.attr('data-id'), undefined);
});

// 11. Regression: a legacy show (no segment timecodes) still renders per-segment
//     data-id chapters — the 1.6k existing shows must not change.
test('legacy show still renders multi-file data-id chapters', () => {
    const $ = load(SHOW_PAGE);
    const chaps = $('.episode-player .ep-chap');
    assert.ok(chaps.length >= 1);
    chaps.each((_, li) => {
        assert.ok($(li).attr('data-id') !== undefined, 'legacy chapter must keep data-id');
        assert.equal($(li).attr('data-full'), undefined, 'legacy chapter must not be windowed');
    });
});
```

- [ ] **Step 4: Run the full golden suite**

Run: `npm test`
Expected: all tests PASS, including the three new render tests and the `tcToSeconds` unit test from Task 1.

If `CHAPTERED_SHOW` / `WINDOWED_SEGMENT` filenames 404 in the test, confirm the permalink scheme: the build emits `YYYY_MM_DD_<slug>.html` where `<slug>` derives from the title/filename. Adjust the constant to match the actual emitted filename (check `ls` of the test output dir, or the existing `SHOW_PAGE` pattern which uses the title slug).

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/content/shows/2099/02-02 tests/fixtures/content/segments/2099/02-02 tests/test_render.mjs
git commit -m "test: golden coverage for chaptered + windowed chapter player"
```

---

## Task 10: Manual verification checkpoint

**Files:** none (verification only)

The golden tests cover markup; this confirms runtime playback behavior the tests can't.

- [ ] **Step 1: Build and serve**

Run: `npm --prefix eleventy run dev`
Then open the chaptered fixture is not in the real site — instead verify against a real converted show OR temporarily add `start`/`duration` to one current segment under `content/segments/2026/05-29/`. (Discuss with the user which real show to convert first; do not convert without direction.)

- [ ] **Step 2: Verify in the browser**

- Chaptered show page: one audio file loads; tapping a chapter seeks (no reload/stop); playback flows across chapter boundaries; the current chapter highlights as the playhead crosses each `start`.
- Windowed segment page: the `--single` player shows `0:00–<duration>`; playback is confined to the window and pauses at the end; the scrubber is relative to the window.
- A legacy 2026 show (unconverted) plays exactly as before (per-segment files, sequential auto-advance).

- [ ] **Step 3: Report results to the user** — do not push to `staging` until the user has reviewed the manual checkpoint, per the no-deploy-polling / staging-first conventions.

---

## Self-Review Notes (addressed during planning)

- **Spec coverage:** `tcToSeconds` (T1), `showForDate` (T2), show track-building (T3), macro data attrs (T4), both JS behaviors (T5), segment-page windowed player in `_article_header.njk` (T6 — the spec's corrected file), check-show validation incl. partial-conversion warning (T7), CMS fields (T8), all four golden test cases (T9). Out-of-scope items (backfill, RSS, ingest) are not tasked, matching the spec.
- **Type/name consistency:** track object shape is uniform across producer and consumer — windowed `{ full, start, dur, title, art }`, legacy `{ id, title, art }`; data attributes `data-full`/`data-start`/`data-dur` are emitted by Task 4 and read by Task 5; `posKey`, `winStart`, `winEnd`, `chapterAt`, `endOf`, `highlight` are all defined within `initWindowed`.
- **`dur` vs `duration`:** frontmatter/CMS field is `duration`; the in-template/JS track property is `dur` (parsed via `tcToSeconds`). The mapping happens once, in Task 3 and Task 6.
- **No placeholders:** every code step contains complete content.
