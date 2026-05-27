#!/usr/bin/env node
/**
 * Build semantic-search embeddings for the LOE content tree.
 *
 * For each segment, show, and newsletter, we embed:
 *   title + summary + first ~200 body words
 *
 * Vectors come back as 768-dim float32 from Gemini's gemini-embedding-001.
 * We L2-normalize, quantize to int8 (×127), and pack one .bin file per
 * year alongside a manifest.json that the client search page reads.
 *
 * Expected cost (per issue #53 comment): ~$1 one-time for the full
 * 1991-2026 backfill (~12k docs × ~500 tokens × $0.15/M tokens).
 *
 * Usage:
 *   set -a && source .env && set +a   # exposes GEMINI_API_KEY
 *   npm run build-embeddings
 *
 * Optional flags:
 *   --since=YYYY     Only (re)build shards for years >= YYYY.
 *   --limit=N        Process at most N docs (smoke test).
 *   --dry-run        Walk + parse but skip API calls and writes.
 *
 * Output:
 *   content/extra/search/<year>.bin       packed int8 vectors
 *   content/extra/search/manifest.json    { dim, quantization, shards, total }
 *
 * The .bin shards are gitignored — commit them in a separate maintainer
 * commit after running this script.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(REPO_ROOT, 'content');
const OUT_DIR = path.join(CONTENT, 'extra', 'search');

const EMBED_MODEL = 'gemini-embedding-001';
const DIM = 768;
const BATCH = 100;
const BODY_WORDS = 200;

const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    }),
);
const SINCE = args.since ? parseInt(args.since, 10) : null;
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const DRY = !!args['dry-run'];

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY && !DRY) {
    console.error('GEMINI_API_KEY not set. `set -a && source .env && set +a` first, or pass --dry-run.');
    process.exit(1);
}

// ---------- walk ----------

async function* walkMd(dir) {
    let ents;
    try {
        ents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walkMd(p);
        else if (e.isFile() && e.name.endsWith('.md')) yield p;
    }
}

// ---------- frontmatter ----------

function parseFrontmatter(src) {
    if (!src.startsWith('---')) return { data: {}, body: src };
    const end = src.indexOf('\n---', 3);
    if (end < 0) return { data: {}, body: src };
    const fm = src.slice(3, end).trim();
    const body = src.slice(end + 4).replace(/^\n/, '');
    const data = {};
    let key = null;
    let buf = '';
    for (const raw of fm.split('\n')) {
        const m = raw.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
        if (m) {
            if (key) data[key] = unquote(buf.trim());
            key = m[1];
            buf = m[2];
        } else {
            buf += ' ' + raw.trim();
        }
    }
    if (key) data[key] = unquote(buf.trim());
    return { data, body };
}

function unquote(s) {
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
        return s.slice(1, -1);
    }
    return s;
}

function slugifyTitle(title) {
    return (title || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function permalinkFor(filePath, data) {
    // Mirror eleventyComputed.permalink in eleventy/.eleventy.js.
    const stem = path.basename(filePath, '.md');
    if (filePath.includes('/pages/')) {
        return `/${data.slug || stem}.html`;
    }
    if (!data.date) return null;
    const d = new Date(data.date);
    if (isNaN(d)) return null;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    let slug = data.slug;
    if (!slug && data.template === 'show') slug = slugifyTitle(data.title);
    if (!slug) slug = stem;
    return `/${yyyy}_${mm}_${dd}_${slug}.html`;
}

function firstWords(body, n) {
    // Strip transcript speaker labels + HTML comments + markdown noise enough
    // for token budgeting. Quality of stripping matters less than determinism.
    const stripped = body
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/^#+\s.*$/gm, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`>#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return stripped.split(' ').slice(0, n).join(' ');
}

// ---------- gather docs ----------

async function gatherDocs() {
    const roots = [
        path.join(CONTENT, 'shows'),
        path.join(CONTENT, 'segments'),
        path.join(CONTENT, 'newsletters'),
        path.join(CONTENT, 'archive', 'shows'),
        path.join(CONTENT, 'archive', 'segments'),
    ];
    const docs = [];
    for (const root of roots) {
        for await (const file of walkMd(root)) {
            const src = await fs.readFile(file, 'utf8');
            const { data, body } = parseFrontmatter(src);
            const url = permalinkFor(file, data);
            if (!url) continue;
            if (!data.date) continue;
            const year = new Date(data.date).getUTCFullYear();
            if (!year || isNaN(year)) continue;
            if (SINCE && year < SINCE) continue;
            const text = [data.title || '', data.summary || '', firstWords(body, BODY_WORDS)]
                .filter(Boolean)
                .join('\n\n')
                .trim();
            if (!text) continue;
            docs.push({
                id: url,
                title: data.title || '',
                date: data.date,
                year,
                summary: data.summary || '',
                doc_text: text,
            });
        }
    }
    // Deterministic order: by year then by id.
    docs.sort((a, b) => (a.year - b.year) || a.id.localeCompare(b.id));
    return LIMIT ? docs.slice(0, LIMIT) : docs;
}

// ---------- Gemini ----------

async function embedBatch(texts) {
    // The Generative Language batch-embed endpoint.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${API_KEY}`;
    const body = {
        requests: texts.map((t) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text: t }] },
            taskType: 'RETRIEVAL_DOCUMENT',
            outputDimensionality: DIM,
        })),
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`Embed API ${res.status}: ${errTxt.slice(0, 500)}`);
    }
    const json = await res.json();
    return json.embeddings.map((e) => e.values);
}

// ---------- quantize ----------

function l2normalize(v) {
    let s = 0;
    for (const x of v) s += x * x;
    const n = Math.sqrt(s) || 1;
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
    return out;
}

function quantizeInt8(v) {
    const out = new Int8Array(v.length);
    for (let i = 0; i < v.length; i++) {
        const q = Math.round(v[i] * 127);
        out[i] = Math.max(-127, Math.min(127, q));
    }
    return out;
}

// ---------- main ----------

async function main() {
    console.error('Walking content tree…');
    const docs = await gatherDocs();
    console.error(`Found ${docs.length} docs.`);
    if (DRY) {
        const byYear = {};
        for (const d of docs) byYear[d.year] = (byYear[d.year] || 0) + 1;
        console.error('Dry run. Per-year counts:', byYear);
        return;
    }

    await fs.mkdir(OUT_DIR, { recursive: true });

    const vectors = new Array(docs.length);
    for (let i = 0; i < docs.length; i += BATCH) {
        const slice = docs.slice(i, i + BATCH);
        process.stderr.write(`Embedding ${i + 1}-${i + slice.length} / ${docs.length}…\r`);
        let attempt = 0;
        for (;;) {
            try {
                const out = await embedBatch(slice.map((d) => d.doc_text));
                for (let j = 0; j < out.length; j++) vectors[i + j] = out[j];
                break;
            } catch (err) {
                attempt++;
                if (attempt > 5) throw err;
                const wait = 1000 * 2 ** attempt;
                console.error(`\n  retry ${attempt} after ${wait}ms: ${err.message}`);
                await new Promise((r) => setTimeout(r, wait));
            }
        }
    }
    console.error();

    // Group by year, write shards.
    const byYear = new Map();
    for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        if (!byYear.has(d.year)) byYear.set(d.year, []);
        byYear.get(d.year).push({ ...d, vector: vectors[i] });
    }

    const shards = [];
    for (const [year, items] of [...byYear.entries()].sort(([a], [b]) => a - b)) {
        const count = items.length;
        const vecBytes = count * DIM;
        const headerJson = JSON.stringify({
            dim: DIM,
            count,
            quantization: 'int8',
            items: items.map((it) => ({
                id: it.id,
                title: it.title,
                date: it.date,
                summary: it.summary,
            })),
        });
        const headerBuf = Buffer.from(headerJson, 'utf8');
        const headerLen = Buffer.alloc(4);
        headerLen.writeUInt32LE(headerBuf.length, 0);

        const vecBuf = Buffer.alloc(vecBytes);
        for (let i = 0; i < count; i++) {
            const q = quantizeInt8(l2normalize(items[i].vector));
            vecBuf.set(new Uint8Array(q.buffer, q.byteOffset, q.byteLength), i * DIM);
        }

        const out = Buffer.concat([headerLen, headerBuf, vecBuf]);
        const outPath = path.join(OUT_DIR, `${year}.bin`);
        await fs.writeFile(outPath, out);
        shards.push({ year, count, bytes: out.length, file: `${year}.bin` });
        console.error(`Wrote ${outPath} (${count} docs, ${out.length} bytes)`);
    }

    const manifest = {
        generated: new Date().toISOString(),
        model: EMBED_MODEL,
        dim: DIM,
        quantization: 'int8',
        normalization: 'l2',
        total: docs.length,
        shards,
    };
    await fs.writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.error('Wrote manifest.json');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
