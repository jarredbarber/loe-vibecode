#!/usr/bin/env node
// Deterministic pre-publish check for a single show.
// Usage: node scripts/check-show.mjs [--date YYYY-MM-DD] [--quiet]
// Default: latest show in content/shows/.

import { readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(__filename), '..');

// True when this file is the entry point (node scripts/check-show.mjs …).
// False when imported as a module (e.g. by tests).
const isMain = process.argv[1] === __filename;

const args = process.argv.slice(2);
const dateArg = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;
const quiet = args.includes('--quiet');
const HEAD_TIMEOUT_MS = 10000;
const CONCURRENCY = 10;

// ---- frontmatter parsing (good enough for our constrained YAML shape) ----
export function parseFrontmatter(raw) {
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

// ---- structural checks ----
export const REQUIRED_SHOW = ['title', 'date', 'category', 'template'];
export const REQUIRED_SEGMENT = ['title', 'date', 'category'];

/**
 * Validate a single doc's frontmatter against structural rules.
 * Returns an array of { level, msg } findings (no `where` — caller adds that).
 * @param {{ kind: 'show'|'segment', fm: Record<string,string> }} doc
 * @param {string} expectedDate  YYYY-MM-DD date inferred from the file path
 */
export function validateFrontmatter(doc, expectedDate) {
    const findings = [];
    const required = doc.kind === 'show' ? REQUIRED_SHOW : REQUIRED_SEGMENT;
    for (const field of required) {
        if (!doc.fm[field]) findings.push({ level: 'fail', msg: `missing frontmatter field "${field}"` });
    }
    if (doc.fm.date && doc.fm.date !== expectedDate) {
        findings.push({ level: 'fail', msg: `frontmatter date "${doc.fm.date}" doesn't match path date ${expectedDate}` });
    }
    if (doc.fm.megaphone_id && !/^LOE\d+$/.test(doc.fm.megaphone_id)) {
        findings.push({ level: 'warn', msg: `megaphone_id "${doc.fm.megaphone_id}" doesn't match /^LOE\\d+$/` });
    }
    if (doc.kind === 'show' && doc.fm.template !== 'show') {
        findings.push({ level: 'fail', msg: `expected template: show, got "${doc.fm.template}"` });
    }
    if (doc.kind === 'segment' && doc.fm.category !== 'Segments') {
        findings.push({ level: 'fail', msg: `expected category: Segments, got "${doc.fm.category}"` });
    }
    return findings;
}

// ---- URL extraction ----
export const urlRe = /https?:\/\/[^\s)"'<>]+/g;
export const audioRe = /\{%\s*audio\s+([^%]+?)%\}/g;
export const srcRe = /src\s*=\s*"([^"]+)"/;

/**
 * Extract all URL references from a doc's frontmatter and body.
 * Returns an array of { url, where } objects. `where` is a label string
 * (typically the relative file path with an optional #fragment).
 * @param {{ fm: Record<string,string>, body: string }} doc
 * @param {string} where  base label for this doc (e.g. relative file path)
 */
export function extractUrlRefs(doc, where) {
    const refs = [];
    if (doc.fm.image_url) refs.push({ url: doc.fm.image_url, where: `${where}#image_url` });

    let m;
    const audioReLocal = new RegExp(audioRe.source, audioRe.flags);
    while ((m = audioReLocal.exec(doc.body)) !== null) {
        const src = m[1].match(srcRe)?.[1];
        if (src) refs.push({ url: src, where: `${where}#audio` });
    }
    const urlReLocal = new RegExp(urlRe.source, urlRe.flags);
    while ((m = urlReLocal.exec(doc.body)) !== null) {
        refs.push({ url: m[0].replace(/[.,;:\])>]+$/, ''), where: `${where}#body` });
    }
    return refs;
}

// 403/429 typically mean "bot blocked" rather than broken — downgrade to warn.
export const classify = (r) => (r.ok ? 'ok' : r.status === 403 || r.status === 429 ? 'warn' : 'fail');

// ---- HEAD check helpers (used only when running as main script) ----

const RETRY_BACKOFF_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One-shot fetch with timeout. Returns { res } on HTTP response (any status),
// or { error } on network failure / timeout.
async function fetchOnce(url, options) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
        return { res };
    } catch (err) {
        return { error: err.name === 'AbortError' ? 'timeout' : err.message };
    } finally {
        clearTimeout(t);
    }
}

// Retry once on transient failure: network error, timeout, or 5xx.
// 4xx responses are treated as stable and not retried.
async function fetchWithRetry(url, options) {
    let attempt = await fetchOnce(url, options);
    const transient = attempt.error || (attempt.res && attempt.res.status >= 500);
    if (transient) {
        await sleep(RETRY_BACKOFF_MS);
        attempt = await fetchOnce(url, options);
    }
    return attempt;
}

async function checkUrl(url) {
    let attempt = await fetchWithRetry(url, { method: 'HEAD' });
    if (attempt.error) return { ok: false, status: 0, error: attempt.error };
    let res = attempt.res;
    // Some CDNs reject HEAD; retry with GET (range-limited)
    if (res.status === 405 || res.status === 403) {
        const getAttempt = await fetchWithRetry(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
        });
        if (getAttempt.error) return { ok: false, status: 0, error: getAttempt.error };
        res = getAttempt.res;
    }
    return { ok: res.ok || res.status === 206, status: res.status };
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

// ---- main: only runs when invoked directly ----
if (isMain) {
    (async () => {
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

        for (const doc of docs) {
            const docFindings = validateFrontmatter(doc, date);
            for (const f of docFindings) note(f.level, relpath(doc.path), f.msg);
        }

        // ---- URL extraction ----
        const urlRefs = [];
        for (const doc of docs) {
            urlRefs.push(...extractUrlRefs(doc, relpath(doc.path)));
        }

        // dedupe by URL
        const seen = new Map();
        for (const ref of urlRefs) {
            if (!seen.has(ref.url)) seen.set(ref.url, ref.where);
        }
        const uniqueRefs = [...seen.entries()].map(([url, where]) => ({ url, where }));
        console.log(`  ${uniqueRefs.length} unique URL(s) to check`);

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
            lines.push(
                `${docs.length - 1} segments, ${uniqueRefs.length} URLs checked. **${fails.length} failure(s), ${warns.length} warning(s).**`,
                '',
            );

            // Non-URL findings (frontmatter shape, date mismatches, etc.).
            const structural = [...fails, ...warns].filter((f) => !f.msg.startsWith('URL '));
            if (structural.length) {
                lines.push('## Structural findings', '');
                lines.push('| | Where | Detail |', '|---|---|---|');
                for (const f of structural) {
                    const dot = f.level === 'fail' ? '🔴' : '🟡';
                    lines.push(`| ${dot} | \`${f.where}\` | ${f.msg.replace(/\|/g, '\\|')} |`);
                }
                lines.push('');
            }

            // Every URL with a colored status dot. Sorted so failures/warnings
            // float to the top.
            lines.push('## URL checks', '');
            lines.push('🟢 reachable · 🟡 reachable but bot-blocked (verify in a browser) · 🔴 broken', '');
            lines.push('| | Code | Where | URL |', '|---|---|---|---|');
            const dot = { ok: '🟢', warn: '🟡', fail: '🔴' };
            const order = { fail: 0, warn: 1, ok: 2 };
            const sorted = [...results].sort((a, b) => order[a.level] - order[b.level]);
            for (const r of sorted) {
                const url = r.url.replace(/\|/g, '%7C');
                lines.push(`| ${dot[r.level]} | ${r.status || '---'} | \`${r.where}\` | [${url}](${url}) |`);
            }

            appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
        }

        process.exit(fails.length ? 1 : 0);
    })();
}
