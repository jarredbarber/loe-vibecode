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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const SEGMENT_QUOTE = '2099_01_01_quote-test-bursts-forth.html';
const SEGMENT_BIRDNOTE = '2099_01_01_birdnote-fixture.html';
const SHOW_PAGE = '2099_01_01_living-on-earth-january-1-2099.html';
const INDEX_PAGE = 'index.html';

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
