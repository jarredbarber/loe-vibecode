/**
 * Golden tests for the Eleventy render path. Each test asserts a specific
 * invariant we've broken before — there to catch regressions on the exact
 * bug, not to exhaustively spec the renderer.
 *
 * Run with:  node --test tests/test_render.mjs
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import filtersPlugin from '../eleventy/plugins/filters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const SEGMENT_QUOTE = '2099_01_01_quote-test-bursts-forth.html';
const SEGMENT_BIRDNOTE = '2099_01_01_birdnote-fixture.html';
const SHOW_PAGE = '2099_01_01_living-on-earth-january-1-2099.html';
const INDEX_PAGE = 'index.html';
const CHAPTERED_SHOW = '2099_02_02_living-on-earth-february-2-2099.html';
const WINDOWED_SEGMENT = '2099_02_02_world-cup-warming.html';

let outDir;

before(() => {
    outDir = mkdtempSync(path.join(os.tmpdir(), 'loe-test-'));
    process.on('exit', () => { try { rmSync(outDir, { recursive: true, force: true }); } catch {} });

    execSync(
        `npx @11ty/eleventy --config=${path.join(REPO, 'tests/fixtures/eleventy.config.js')} --output=${outDir}`,
        { cwd: path.join(REPO, 'eleventy'), stdio: 'inherit', env: { ...process.env, OUTPUT: outDir } },
    );
});

function load(name) {
    return cheerio.load(readFileSync(path.join(outDir, name), 'utf8'));
}

// 1. Frontmatter title with embedded double quotes renders cleanly.
test('title with quotes has no errant punctuation', () => {
    const $ = load(SEGMENT_QUOTE);
    const titleTag = $('title').text();
    assert.ok(titleTag.includes('Quote Test "Bursts" Forth'));
    assert.ok(!titleTag.includes("'Quote Test"), 'no errant single quotes');
    const h2 = $('h2').first().text().trim();
    assert.ok(h2.startsWith('Quote Test "Bursts" Forth'), `h2 was: ${h2}`);
});

// 2. Speaker lines are highlighted and grouped into transcript blocks.
test('speaker paragraphs get speaker + transcript-block wrapping', () => {
    const $ = load(SEGMENT_QUOTE);
    assert.ok($('div.transcript-block').length >= 1);
    const speakerTexts = new Set($('span.speaker').map((_, el) => $(el).text()).get());
    assert.ok(speakerTexts.has('CURWOOD:'));
    assert.ok(speakerTexts.has('DOERING:'));
});

// 3. Inline image with alt becomes a <figure><figcaption>.
test('inline image caption becomes <figure>', () => {
    const $ = load(SEGMENT_QUOTE);
    const figs = $('figure').filter((_, f) =>
        $(f).find('img[src*="inline.jpg"]').length > 0,
    );
    assert.ok(figs.length >= 1, 'expected an inline image wrapped in <figure>');
    const caption = figs.first().find('figcaption').text();
    assert.ok(caption.includes('Caption from alt text'));
});

// 4. {% audio %} shortcode expands to the .mcp custom player.
test('audio shortcode renders custom player', () => {
    const $ = load(SEGMENT_BIRDNOTE);
    const cue = $('div.music-cue').first();
    assert.equal(cue.find('.music-cue-label').text().trim(), 'Test Bird Song');
    assert.equal(cue.find('.music-cue-duration').text().trim(), '0:00-0:30');
    const audio = cue.find('audio.mcp-audio');
    assert.equal(audio.attr('src'), 'https://example.org/test/bird.mp3');
    // Custom .mcp player → native controls attribute must NOT be set.
    assert.equal(audio.attr('controls'), undefined);
});

// 5. {% cue %} shortcode detects speaker pattern in text.
test('cue shortcode detects speaker label', () => {
    const $ = load(SEGMENT_BIRDNOTE);
    const cues = $('div.music-cue').map((_, c) => $(c).text().trim()).get();
    assert.ok(cues.some((t) => t === 'CROWD CHEERS'), `cues: ${JSON.stringify(cues)}`);
    const cutaway = $('div.music-cue').filter((_, c) => $(c).text().includes('CUTAWAY MUSIC')).first();
    assert.equal(cutaway.find('.speaker').text(), 'CUTAWAY MUSIC:');
});

// 6. Show template synthesizes "Living on Earth: <date>" headline.
test('show layout headline', () => {
    const $ = load(SHOW_PAGE);
    const h2 = $('h2').first().text().trim();
    assert.ok(h2.startsWith('Living on Earth: January 1'), `h2: ${h2}`);
});

// 7. Nav active state matches the current page.
test('nav active state per page', () => {
    const homeActive = load(INDEX_PAGE)('.menu li a.active').map((_, a) => load(INDEX_PAGE).text.call(this, a)).get();
    const $home = load(INDEX_PAGE);
    const homeActiveText = $home('.menu li a.active').map((_, a) => $home(a).text()).get();
    assert.deepEqual(homeActiveText, ['Home']);

    const $seg = load(SEGMENT_BIRDNOTE);
    const segActive = $seg('.menu li a.active').get();
    assert.equal(segActive.length, 0);
});

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
