#!/usr/bin/env node
/**
 * Auto-tag segments against the controlled vocabulary in
 * `content/admin/tag-vocab.yml` using Gemini.
 *
 * Usage:
 *   node scripts/tag-segments.mjs [--limit N] [--dry-run] [--include-archive]
 *
 *   --limit N           Only consider the N most recent untagged segments.
 *   --dry-run           Don't write anything; print intended tags.
 *   --include-archive   Also walk `content/archive/segments/`.
 *
 * Skips segments that already have a non-empty `tags:` frontmatter array
 * (unless that array is exactly `["auto"]`, which is treated as a marker
 * for re-tagging).
 *
 * Requires GEMINI_API_KEY in env. Designed for prototype usage — one call
 * per segment, with a small delay between calls.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const VOCAB_PATH = path.join(REPO_ROOT, 'content/admin/tag-vocab.yml');

// --- CLI parsing -----------------------------------------------------------

const argv = process.argv.slice(2);
const opts = { limit: Infinity, dryRun: false, includeArchive: false };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--include-archive') opts.includeArchive = true;
    else if (a === '--limit') {
        opts.limit = parseInt(argv[++i], 10);
        if (Number.isNaN(opts.limit)) opts.limit = Infinity;
    } else if (a.startsWith('--limit=')) {
        opts.limit = parseInt(a.split('=')[1], 10);
        if (Number.isNaN(opts.limit)) opts.limit = Infinity;
    } else {
        console.error(`Unknown arg: ${a}`);
        process.exit(2);
    }
}

// --- Vocabulary load -------------------------------------------------------

const vocabRaw = fs.readFileSync(VOCAB_PATH, 'utf8');
const grouped = yaml.load(vocabRaw) || {};
const vocab = [];
for (const tags of Object.values(grouped)) {
    if (Array.isArray(tags)) vocab.push(...tags);
}
const vocabSet = new Set(vocab);

console.log(`Loaded vocabulary: ${vocab.length} tags across ${Object.keys(grouped).length} domains.`);
for (const [domain, tags] of Object.entries(grouped)) {
    console.log(`  ${domain}: ${tags.length}`);
}

// --- Walk segments ---------------------------------------------------------

function walk(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (entry.isFile() && p.endsWith('.md')) out.push(p);
    }
    return out;
}

const segmentRoots = [path.join(REPO_ROOT, 'content/segments')];
if (opts.includeArchive) segmentRoots.push(path.join(REPO_ROOT, 'content/archive/segments'));

const allSegments = segmentRoots.flatMap(walk);

function needsTagging(fm) {
    // Presence of the `tags` key (even if empty) means we've taken a pass
    // at this segment — skip on subsequent runs. Sentinel `tags: ["auto"]`
    // explicitly requests a re-tag.
    const t = fm.tags;
    if (t === undefined) return true;
    if (Array.isArray(t) && t.length === 1 && t[0] === 'auto') return true;
    return false;
}

// Parse + filter
const candidates = [];
// gray-matter delegates to js-yaml; default behavior auto-parses ISO dates
// into Date objects AND wraps long strings at column 80 on stringify, which
// would churn every segment's frontmatter. Pin both ends to preserve format:
// strings stay strings on parse, lines stay long on stringify, only quote
// values when YAML strictly requires it.
const noLineWrap = (obj) => yaml.dump(obj, {
    lineWidth: -1,
    quotingType: "'",
    forceQuotes: false,
    noCompatMode: true,
    schema: yaml.JSON_SCHEMA, // dates stay as strings
});
const matterOpts = {
    language: 'yaml',
    engines: {
        yaml: {
            parse: (s) => yaml.load(s, { schema: yaml.JSON_SCHEMA }),
            stringify: noLineWrap,
        },
    },
};

for (const file of allSegments) {
    let parsed;
    try {
        parsed = matter.read(file, matterOpts);
    } catch (e) {
        console.warn(`skip (parse error): ${file}`);
        continue;
    }
    if (!needsTagging(parsed.data)) continue;
    candidates.push({ file, parsed });
}

// Sort newest-first by date frontmatter, untagged-only.
candidates.sort((a, b) => {
    const ad = Date.parse(a.parsed.data.date || '') || 0;
    const bd = Date.parse(b.parsed.data.date || '') || 0;
    return bd - ad;
});

const targets = candidates.slice(0, opts.limit);

console.log(`Found ${allSegments.length} segment files; ${candidates.length} need tagging; processing ${targets.length}.`);

if (targets.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
}

// --- LLM client ------------------------------------------------------------

// Lazily import the AI SDK only if we actually plan to make calls. This
// keeps `--dry-run --limit 0` (smoke test) fast and key-less.
let generateObject = null;
let google = null;
let z = null;
if (!opts.dryRun) {
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.error('Missing GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) in env.');
        process.exit(1);
    }
    // Vercel AI SDK reads GOOGLE_GENERATIVE_AI_API_KEY; bridge from GEMINI_API_KEY.
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= process.env.GEMINI_API_KEY;
    ({ generateObject } = await import('ai'));
    ({ google } = await import('@ai-sdk/google'));
    ({ z } = await import('zod'));
}

const MODEL_ID = 'gemini-2.5-flash-lite';

function buildPrompt(seg) {
    const { data, content } = seg.parsed;
    const groupedText = Object.entries(grouped)
        .map(([g, ts]) => `  ${g}: ${ts.join(', ')}`)
        .join('\n');
    return [
        `You tag Living on Earth radio show segments using a controlled vocabulary.`,
        ``,
        `VOCABULARY (grouped by domain; tags are flat — return tag strings only):`,
        groupedText,
        ``,
        `Rules:`,
        `- Pick 3 to 7 tags that best describe THIS segment.`,
        `- Only use tags from the vocabulary above. Never invent tags.`,
        `- Prefer topical tags over format tags unless the format is central.`,
        ``,
        `SEGMENT TITLE: ${data.title || ''}`,
        `SUMMARY: ${data.summary || ''}`,
        ``,
        `BODY:`,
        (content || '').slice(0, 12000),
    ].join('\n');
}

// Gemini's structured-output backend rejects schemas where a single enum
// has too many values (we hit "too much branching" with 90 tags). Use a
// plain string array and validate post-hoc against the vocab.
async function classify(seg) {
    const schema = z.object({
        tags: z.array(z.string()).min(3).max(7).describe(
            'Lowercase-hyphenated tags drawn ONLY from the controlled vocabulary listed in the prompt.'
        ),
    });
    const res = await generateObject({
        model: google(MODEL_ID),
        schema,
        prompt: buildPrompt(seg),
    });
    return { tags: res.object.tags, usage: res.usage || {} };
}

// --- Process loop ----------------------------------------------------------

let totalIn = 0;
let totalOut = 0;
let tagged = 0;

// Pricing (USD per 1M tokens) — gemini-2.5-flash-lite as of issue comment.
const PRICE_IN = 0.075 / 1_000_000;
const PRICE_OUT = 0.30 / 1_000_000;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

for (const seg of targets) {
    const rel = path.relative(REPO_ROOT, seg.file);
    if (opts.dryRun) {
        console.log(`[dry-run] would tag ${rel}`);
        continue;
    }
    try {
        const { tags, usage } = await classify(seg);
        // Vocab is the only quality gate. Whatever the model proposes that's
        // in-vocab gets written, even if that's 0 or 1 tag — segments that
        // don't fit the taxonomy shouldn't be skipped (they'd just keep
        // getting re-attempted on every run).
        const clean = tags.filter((t) => vocabSet.has(t));
        seg.parsed.data.tags = clean;
        const next = matter.stringify(seg.parsed.content, seg.parsed.data, matterOpts);
        fs.writeFileSync(seg.file, next);
        tagged++;
        totalIn += usage.inputTokens || usage.promptTokens || 0;
        totalOut += usage.outputTokens || usage.completionTokens || 0;
        const tail = clean.length ? `→ [${clean.join(', ')}]` : `→ [] (no in-vocab tags)`;
        console.log(`tagged ${rel} ${tail}`);
    } catch (e) {
        console.warn(`  error on ${rel}: ${e.message}`);
    }
    await sleep(150);
}

const cost = totalIn * PRICE_IN + totalOut * PRICE_OUT;
console.log('---');
console.log(`Done. Tagged ${tagged} segments.`);
console.log(`Tokens: ${totalIn} in / ${totalOut} out.`);
console.log(`Estimated cost: $${cost.toFixed(4)} (gemini-2.5-flash-lite).`);
