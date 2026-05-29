/**
 * Unit tests for the pure logic in scripts/check-show.mjs.
 *
 * These tests cover only the deterministic, network-free functions:
 *   - parseFrontmatter   — YAML-lite frontmatter parser
 *   - validateFrontmatter — required fields, date/path alignment, megaphone_id format
 *   - extractUrlRefs     — URL extraction from frontmatter + body
 *   - classify           — HTTP status → ok/warn/fail
 *
 * Run with:  node --test tests/test_check_show.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseFrontmatter,
    validateFrontmatter,
    extractUrlRefs,
    classify,
} from '../scripts/check-show.mjs';

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

test('parseFrontmatter: parses basic key/value pairs', () => {
    const raw = `---\ntitle: Hello World\ndate: 2026-01-15\ncategory: Shows\n---\nBody text here.\n`;
    const { fm, body } = parseFrontmatter(raw);
    assert.equal(fm.title, 'Hello World');
    assert.equal(fm.date, '2026-01-15');
    assert.equal(fm.category, 'Shows');
    assert.ok(body.includes('Body text here.'));
});

test('parseFrontmatter: strips surrounding single quotes from values', () => {
    const raw = `---\ntitle: 'Quoted Title'\n---\n`;
    const { fm } = parseFrontmatter(raw);
    assert.equal(fm.title, 'Quoted Title');
});

test('parseFrontmatter: strips surrounding double quotes from values', () => {
    const raw = `---\ntitle: "Double Quoted"\n---\n`;
    const { fm } = parseFrontmatter(raw);
    assert.equal(fm.title, 'Double Quoted');
});

test('parseFrontmatter: returns empty fm and raw text when no frontmatter delimiters', () => {
    const raw = 'Just plain text, no frontmatter.';
    const { fm, body } = parseFrontmatter(raw);
    assert.deepEqual(fm, {});
    assert.equal(body, raw);
});

test('parseFrontmatter: ignores lines without a colon key', () => {
    const raw = `---\ntitle: Fine\n  not a key-value line\ndate: 2026-05-01\n---\n`;
    const { fm } = parseFrontmatter(raw);
    assert.equal(fm.title, 'Fine');
    assert.equal(fm.date, '2026-05-01');
    assert.equal(Object.keys(fm).length, 2);
});

test('parseFrontmatter: handles hyphenated keys like megaphone_id and image_url', () => {
    const raw = `---\nmegaphone_id: LOE1234\nimage_url: https://example.com/img.jpg\n---\n`;
    const { fm } = parseFrontmatter(raw);
    assert.equal(fm.megaphone_id, 'LOE1234');
    assert.equal(fm.image_url, 'https://example.com/img.jpg');
});

// ---------------------------------------------------------------------------
// validateFrontmatter — show docs
// ---------------------------------------------------------------------------

test('validateFrontmatter: no findings for a valid show doc', () => {
    const doc = {
        kind: 'show',
        fm: { title: 'A Show', date: '2026-05-22', category: 'Shows', template: 'show' },
    };
    assert.deepEqual(validateFrontmatter(doc, '2026-05-22'), []);
});

test('validateFrontmatter: fails when required show fields are missing', () => {
    const doc = { kind: 'show', fm: { title: 'Missing others' } };
    const findings = validateFrontmatter(doc, '2026-05-22');
    const failMsgs = findings.filter((f) => f.level === 'fail').map((f) => f.msg);
    assert.ok(failMsgs.some((m) => m.includes('"date"')));
    assert.ok(failMsgs.some((m) => m.includes('"category"')));
    assert.ok(failMsgs.some((m) => m.includes('"template"')));
});

test('validateFrontmatter: fails when frontmatter date does not match path date', () => {
    const doc = {
        kind: 'show',
        fm: { title: 'T', date: '2026-05-01', category: 'Shows', template: 'show' },
    };
    const findings = validateFrontmatter(doc, '2026-05-22');
    assert.ok(findings.some((f) => f.level === 'fail' && f.msg.includes("doesn't match path date")));
});

test('validateFrontmatter: no date-mismatch finding when fm.date equals path date', () => {
    const doc = {
        kind: 'show',
        fm: { title: 'T', date: '2026-05-22', category: 'Shows', template: 'show' },
    };
    const findings = validateFrontmatter(doc, '2026-05-22');
    assert.ok(!findings.some((f) => f.msg.includes("doesn't match path date")));
});

test('validateFrontmatter: no date finding when fm.date is absent', () => {
    // Missing date triggers missing-field fail, but NOT a date-mismatch fail.
    const doc = { kind: 'show', fm: { title: 'T', category: 'Shows', template: 'show' } };
    const findings = validateFrontmatter(doc, '2026-05-22');
    assert.ok(!findings.some((f) => f.msg.includes("doesn't match path date")));
    assert.ok(findings.some((f) => f.msg.includes('"date"')));
});

test('validateFrontmatter: fails when template is not "show" for show doc', () => {
    const doc = {
        kind: 'show',
        fm: { title: 'T', date: '2026-05-22', category: 'Shows', template: 'segment' },
    };
    const findings = validateFrontmatter(doc, '2026-05-22');
    assert.ok(findings.some((f) => f.level === 'fail' && f.msg.includes('expected template: show')));
});

// ---------------------------------------------------------------------------
// validateFrontmatter — segment docs
// ---------------------------------------------------------------------------

test('validateFrontmatter: no findings for a valid segment doc', () => {
    const doc = {
        kind: 'segment',
        fm: { title: 'A Segment', date: '2026-05-22', category: 'Segments' },
    };
    assert.deepEqual(validateFrontmatter(doc, '2026-05-22'), []);
});

test('validateFrontmatter: fails when segment category is not "Segments"', () => {
    const doc = {
        kind: 'segment',
        fm: { title: 'T', date: '2026-05-22', category: 'Shows' },
    };
    const findings = validateFrontmatter(doc, '2026-05-22');
    assert.ok(findings.some((f) => f.level === 'fail' && f.msg.includes('expected category: Segments')));
});

test('validateFrontmatter: warns on invalid megaphone_id format', () => {
    const doc = {
        kind: 'show',
        fm: { title: 'T', date: '2026-05-22', category: 'Shows', template: 'show', megaphone_id: 'BADFORMAT' },
    };
    const findings = validateFrontmatter(doc, '2026-05-22');
    assert.ok(findings.some((f) => f.level === 'warn' && f.msg.includes('megaphone_id')));
});

test('validateFrontmatter: no warning for valid megaphone_id LOE1234', () => {
    const doc = {
        kind: 'show',
        fm: { title: 'T', date: '2026-05-22', category: 'Shows', template: 'show', megaphone_id: 'LOE1234' },
    };
    const findings = validateFrontmatter(doc, '2026-05-22');
    assert.ok(!findings.some((f) => f.msg.includes('megaphone_id')));
});

test('validateFrontmatter: no warning when megaphone_id is absent', () => {
    const doc = {
        kind: 'show',
        fm: { title: 'T', date: '2026-05-22', category: 'Shows', template: 'show' },
    };
    assert.deepEqual(validateFrontmatter(doc, '2026-05-22'), []);
});

// ---------------------------------------------------------------------------
// extractUrlRefs
// ---------------------------------------------------------------------------

test('extractUrlRefs: picks up image_url from frontmatter', () => {
    const doc = { fm: { image_url: 'https://example.com/photo.jpg' }, body: '' };
    const refs = extractUrlRefs(doc, 'shows/2026/05-22/show.md');
    assert.ok(refs.some((r) => r.url === 'https://example.com/photo.jpg' && r.where.endsWith('#image_url')));
});

test('extractUrlRefs: picks up src= URL inside {% audio %} shortcode', () => {
    const doc = {
        fm: {},
        body: '{% audio src="https://cdn.loe.org/audio/ep.mp3" title="Ep" %}',
    };
    const refs = extractUrlRefs(doc, 'segments/2026/05-22/ep.md');
    assert.ok(refs.some((r) => r.url === 'https://cdn.loe.org/audio/ep.mp3' && r.where.endsWith('#audio')));
});

test('extractUrlRefs: picks up bare https URLs in body text', () => {
    const doc = {
        fm: {},
        body: 'See [this article](https://example.org/story) for details.',
    };
    const refs = extractUrlRefs(doc, 'segments/2026/05-22/seg.md');
    assert.ok(refs.some((r) => r.url === 'https://example.org/story' && r.where.endsWith('#body')));
});

test('extractUrlRefs: strips trailing punctuation from body URLs', () => {
    const doc = { fm: {}, body: 'Visit https://example.com/page.' };
    const refs = extractUrlRefs(doc, 'x.md');
    assert.ok(refs.some((r) => r.url === 'https://example.com/page'));
    assert.ok(!refs.some((r) => r.url.endsWith('.')));
});

test('extractUrlRefs: returns no refs for doc with empty fm and empty body', () => {
    const doc = { fm: {}, body: '' };
    assert.deepEqual(extractUrlRefs(doc, 'empty.md'), []);
});

test('extractUrlRefs: does not include image_url ref when fm.image_url is absent', () => {
    const doc = { fm: {}, body: '' };
    assert.equal(extractUrlRefs(doc, 'x.md').filter((r) => r.where.endsWith('#image_url')).length, 0);
});

// ---------------------------------------------------------------------------
// classify
// ---------------------------------------------------------------------------

test('classify: ok when res.ok is true', () => {
    assert.equal(classify({ ok: true, status: 200 }), 'ok');
});

test('classify: ok for 206 partial content (CDN range response)', () => {
    // The checkUrl function sets ok: true when status===206; classify just sees ok:true.
    assert.equal(classify({ ok: true, status: 206 }), 'ok');
});

test('classify: warn for 403 (bot-blocked)', () => {
    assert.equal(classify({ ok: false, status: 403 }), 'warn');
});

test('classify: warn for 429 (rate-limited)', () => {
    assert.equal(classify({ ok: false, status: 429 }), 'warn');
});

test('classify: fail for 404', () => {
    assert.equal(classify({ ok: false, status: 404 }), 'fail');
});

test('classify: fail for 500', () => {
    assert.equal(classify({ ok: false, status: 500 }), 'fail');
});

test('classify: fail for 0 (network error)', () => {
    assert.equal(classify({ ok: false, status: 0 }), 'fail');
});
