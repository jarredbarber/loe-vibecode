#!/usr/bin/env node
// Deterministic pre-publish check for a single show.
// Usage: node scripts/check-show.mjs [--date YYYY-MM-DD] [--quiet]
// Default: latest show in content/shows/.

import { readFileSync, readdirSync, statSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dateArg = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;
const quiet = args.includes('--quiet');
const HEAD_TIMEOUT_MS = 10000;
const CONCURRENCY = 10;

// ---- frontmatter parsing (good enough for our constrained YAML shape) ----
function parseFrontmatter(raw) {
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) return { fm: {}, body: raw };
    const fm = {};
    for (const line of m[1].split('\n')) {
        const kv = line.match(/^([\w-]+):\s*(.*)$/);
        if (!kv) continue;
        let v = kv[2].trim();
        if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
            v = v.slice(1, -1);
        }
        fm[kv[1]] = v;
    }
    return { fm, body: m[2] };
}

// ---- locate target show ----
function findLatestShowDate() {
    const showsDir = join(repoRoot, 'content/shows');
    const years = readdirSync(showsDir).filter((y) => /^\d{4}$/.test(y)).sort();
    for (const year of years.reverse()) {
        const md = readdirSync(join(showsDir, year))
            .filter((d) => /^\d{2}-\d{2}$/.test(d))
            .sort();
        if (md.length) return `${year}-${md[md.length - 1]}`;
    }
    throw new Error('No shows found in content/shows/');
}

const date = dateArg ?? findLatestShowDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`Bad --date: ${date}. Expected YYYY-MM-DD.`);
    process.exit(2);
}
const [year, mm, dd] = date.split('-');
const showPath = join(repoRoot, `content/shows/${year}/${mm}-${dd}/show.md`);
const segmentsDir = join(repoRoot, `content/segments/${year}/${mm}-${dd}`);

if (!existsSync(showPath)) {
    console.error(`No show at ${showPath}`);
    process.exit(2);
}

console.log(`Checking show ${date}`);

// ---- collect docs ----
const docs = [];
docs.push({ kind: 'show', path: showPath, ...parseFrontmatter(readFileSync(showPath, 'utf8')) });
if (existsSync(segmentsDir)) {
    for (const file of readdirSync(segmentsDir).sort()) {
        if (!file.endsWith('.md')) continue;
        const p = join(segmentsDir, file);
        docs.push({ kind: 'segment', path: p, ...parseFrontmatter(readFileSync(p, 'utf8')) });
    }
}
console.log(`  ${docs.length - 1} segment(s) found`);

// ---- findings ----
const findings = []; // { level: 'fail'|'warn', where, msg }
const note = (level, where, msg) => findings.push({ level, where, msg });
const relpath = (p) => p.slice(repoRoot.length + 1);

// ---- structural checks ----
const REQUIRED_SHOW = ['title', 'date', 'category', 'template'];
const REQUIRED_SEGMENT = ['title', 'date', 'category'];

for (const doc of docs) {
    const required = doc.kind === 'show' ? REQUIRED_SHOW : REQUIRED_SEGMENT;
    for (const field of required) {
        if (!doc.fm[field]) note('fail', relpath(doc.path), `missing frontmatter field "${field}"`);
    }
    if (doc.fm.date && doc.fm.date !== date) {
        note('fail', relpath(doc.path), `frontmatter date "${doc.fm.date}" doesn't match path date ${date}`);
    }
    if (doc.fm.megaphone_id && !/^LOE\d+$/.test(doc.fm.megaphone_id)) {
        note('warn', relpath(doc.path), `megaphone_id "${doc.fm.megaphone_id}" doesn't match /^LOE\\d+$/`);
    }
    if (doc.kind === 'show' && doc.fm.template !== 'show') {
        note('fail', relpath(doc.path), `expected template: show, got "${doc.fm.template}"`);
    }
    if (doc.kind === 'segment' && doc.fm.category !== 'Segments') {
        note('fail', relpath(doc.path), `expected category: Segments, got "${doc.fm.category}"`);
    }
}

// ---- URL extraction ----
const urlRefs = []; // { url, where }
const urlRe = /https?:\/\/[^\s)"'<>]+/g;
const audioRe = /\{%\s*audio\s+([^%]+?)%\}/g;
const srcRe = /src\s*=\s*"([^"]+)"/;

for (const doc of docs) {
    const where = relpath(doc.path);
    if (doc.fm.image_url) urlRefs.push({ url: doc.fm.image_url, where: `${where}#image_url` });

    let m;
    audioRe.lastIndex = 0;
    while ((m = audioRe.exec(doc.body)) !== null) {
        const src = m[1].match(srcRe)?.[1];
        if (src) urlRefs.push({ url: src, where: `${where}#audio` });
    }
    urlRe.lastIndex = 0;
    while ((m = urlRe.exec(doc.body)) !== null) {
        urlRefs.push({ url: m[0].replace(/[.,;:\])>]+$/, ''), where: `${where}#body` });
    }
}

// dedupe by URL
const seen = new Map();
for (const ref of urlRefs) {
    if (!seen.has(ref.url)) seen.set(ref.url, ref.where);
}
const uniqueRefs = [...seen.entries()].map(([url, where]) => ({ url, where }));
console.log(`  ${uniqueRefs.length} unique URL(s) to check`);

// ---- HEAD checks ----
async function checkUrl(url) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    try {
        let res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
        // Some CDNs reject HEAD; retry with GET (range-limited)
        if (res.status === 405 || res.status === 403) {
            res = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                redirect: 'follow',
                headers: { Range: 'bytes=0-0' },
            });
        }
        return { ok: res.ok || res.status === 206, status: res.status };
    } catch (err) {
        return { ok: false, status: 0, error: err.name === 'AbortError' ? 'timeout' : err.message };
    } finally {
        clearTimeout(t);
    }
}

async function runWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let i = 0;
    const workers = Array.from({ length: limit }, async () => {
        while (true) {
            const idx = i++;
            if (idx >= items.length) return;
            results[idx] = await fn(items[idx], idx);
        }
    });
    await Promise.all(workers);
    return results;
}

// 403/429 typically mean "bot blocked" rather than broken — downgrade to warn.
const classify = (r) => (r.ok ? 'ok' : r.status === 403 || r.status === 429 ? 'warn' : 'fail');

const results = await runWithConcurrency(uniqueRefs, CONCURRENCY, async (ref) => {
    const r = await checkUrl(ref.url);
    const level = classify(r);
    if (!quiet) {
        const tag = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL' }[level];
        process.stdout.write(`  [${tag}] ${r.status || '---'} ${ref.url}\n`);
    }
    return { ...ref, ...r, level };
});

for (const r of results) {
    if (r.level === 'ok') continue;
    note(r.level, r.where, `URL ${r.status || 'unreachable'} ${r.error ?? ''}: ${r.url}`);
}

// ---- summary ----
const fails = findings.filter((f) => f.level === 'fail');
const warns = findings.filter((f) => f.level === 'warn');
console.log(`\n${fails.length} failure(s), ${warns.length} warning(s)`);
for (const f of [...fails, ...warns]) {
    console.log(`  [${f.level.toUpperCase()}] ${f.where}: ${f.msg}`);
}

// GitHub Actions Job Summary — pinned at the top of the run page.
if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`# Show check: ${date}`, ''];
    lines.push(`${docs.length - 1} segments, ${uniqueRefs.length} URLs checked. **${fails.length} failure(s), ${warns.length} warning(s).**`, '');

    if (warns.length) {
        lines.push('## Warnings — please double-check in a browser', '');
        lines.push('403/429 usually means the host is blocking automated requests but the link still works for humans. Click each to verify.', '');
        lines.push('| Where | URL | Status |', '|---|---|---|');
        for (const w of warns) {
            const url = w.msg.match(/https?:\/\/\S+$/)?.[0] ?? '';
            const status = w.msg.match(/URL (\S+)/)?.[1] ?? '';
            lines.push(`| \`${w.where}\` | [${url}](${url}) | ${status} |`);
        }
        lines.push('');
    }
    if (fails.length) {
        lines.push('## Failures', '');
        lines.push('| Where | Detail |', '|---|---|');
        for (const f of fails) lines.push(`| \`${f.where}\` | ${f.msg.replace(/\|/g, '\\|')} |`);
    }
    if (!fails.length && !warns.length) lines.push('All checks passed.');

    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

process.exit(fails.length ? 1 : 0);
