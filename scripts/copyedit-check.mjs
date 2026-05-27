#!/usr/bin/env node
// Advisory LLM copyedit pass over a single show + its segments.
// Usage: node scripts/copyedit-check.mjs [--date YYYY-MM-DD] [--quiet]
// Always exits 0 — output is suggestions, never a hard failure.
//
// Catches things check-show.mjs can't:
//   - Typos, awkward phrasing
//   - Inconsistent speaker labels (e.g. "O'NEILL:" vs "O'Neil:")
//   - Date sanity ("next Tuesday" in a show dated on a Wednesday)
//   - Internal contradictions across segments
//
// Env:
//   GEMINI_API_KEY  required
//   LLM_MODEL       optional, default 'gemini-2.5-flash'

import { readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dateArg = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;
const quiet = args.includes('--quiet');
const modelName = process.env.LLM_MODEL || 'gemini-3.1-flash-lite';

if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error('GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) not set.');
    process.exit(2);
}
// Vercel AI SDK looks for GOOGLE_GENERATIVE_AI_API_KEY by default.
process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= process.env.GEMINI_API_KEY;

// ---- locate target show (reused from check-show.mjs) ----
function findLatestShowDate() {
    const showsDir = join(repoRoot, 'content/shows');
    const years = readdirSync(showsDir).filter((y) => /^\d{4}$/.test(y)).sort();
    for (const year of years.reverse()) {
        const md = readdirSync(join(showsDir, year))
            .filter((d) => /^\d{2}-\d{2}$/.test(d))
            .sort();
        if (md.length) return `${year}-${md[md.length - 1]}`;
    }
    throw new Error('No shows found.');
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

const relpath = (p) => p.slice(repoRoot.length + 1);

// ---- bundle ----
const dayOfWeek = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
});

let bundle = `# Living on Earth show: ${date} (${dayOfWeek})\n\n`;
bundle += `## ${relpath(showPath)}\n\n${readFileSync(showPath, 'utf8')}\n\n`;

const segments = existsSync(segmentsDir)
    ? readdirSync(segmentsDir).filter((f) => f.endsWith('.md')).sort()
    : [];
for (const f of segments) {
    const p = join(segmentsDir, f);
    bundle += `## ${relpath(p)}\n\n${readFileSync(p, 'utf8')}\n\n`;
}

console.log(`Reviewing ${date} (${dayOfWeek}) — show + ${segments.length} segment(s), ${(bundle.length / 1000).toFixed(1)}k chars`);
console.log(`Model: ${modelName}\n`);

// ---- schema ----
const FindingsSchema = z.object({
    findings: z.array(
        z.object({
            severity: z.enum(['info', 'suggestion', 'warning']).describe(
                "warning: likely-broken (date wrong, contradicting facts); suggestion: would improve (awkward phrasing, mild inconsistency); info: minor observation.",
            ),
            where: z.string().describe(
                'Relative file path + a hint at the section, e.g. "content/segments/2026/05-22/cancer-and-cafos.md / transcript paragraph 4".',
            ),
            category: z.enum([
                'typo',
                'phrasing',
                'consistency',
                'date',
                'speaker-label',
                'fact-check',
                'other',
            ]),
            message: z.string().describe('What you observed.'),
            suggestion: z.string().optional().describe('A concrete fix the editor could apply.'),
        }),
    ),
});

const systemPrompt = `You are a copy editor for Living on Earth, a weekly public-radio environmental news program. You review the markdown source of a single show and its segments before publication.

**Aim for high precision.** It is much better to report 3 real issues than 30 maybes. If you're unsure whether something is a problem, omit it. Empty findings arrays are a perfectly fine outcome.

The bodies are **broadcast transcripts of real speech**. Spoken-style phrasing — incomplete sentences, contractions, sentence fragments, repetitions, filler words ("you know", "so", "I mean"), informal register, run-on sentences in the speaker's voice — is intentional and **must not be flagged**. Only flag phrasing if it looks like a transcription error or scanno (e.g. "the they're thinking" — a clearly broken word stream that the speaker didn't actually say).

What to look for:
- Hard typos (misspelled words, broken HTML entities, doubled words like "the the").
- Speaker-label inconsistency within or across segments: "O'NEILL" vs "ONEILL" vs "O’NEILL", "Curwood" vs "CURWOOD" mid-segment.
- Frontmatter problems: date in frontmatter ≠ ${date}, mangled summary, title/slug mismatch.
- Date sanity in the body: the show airs ${date} (${dayOfWeek}). Flag relative-date references ("this Tuesday", "next week") that contradict that.
- Cross-segment factual contradictions in the same show (segment A says 23 calves; segment B says 18).

Do NOT do:
- Stylistic preferences (capitalization conventions, comma style, contractions).
- Real-world fact-checking. **Your training data is older than this show's air date** — don't flag political appointments, current officials, statistics, or recent events as wrong. If you find yourself writing "as of [year]", stop and omit the finding.
- Audio shortcodes ({% audio %}, {% cue %}), frontmatter image_url, megaphone_id — those are validated by scripts/check-show.mjs.
- Suggesting prose tightening of speakers' words.

Be terse. One sentence per finding plus a concrete suggestion when obvious.`;

// ---- call ----
let result;
try {
    result = await generateObject({
        model: google(modelName),
        schema: FindingsSchema,
        system: systemPrompt,
        prompt: bundle,
        temperature: 0.2,
    });
} catch (err) {
    console.error('LLM call failed:', err.message || err);
    process.exit(0); // advisory — never block
}

const findings = result.object.findings || [];

// ---- output ----
console.log(`${findings.length} finding(s):\n`);
const tag = { warning: 'WARN', suggestion: 'SUGG', info: 'INFO' };
for (const f of findings) {
    if (!quiet) {
        console.log(`  [${tag[f.severity]}] (${f.category}) ${f.where}`);
        console.log(`    ${f.message}`);
        if (f.suggestion) console.log(`    → ${f.suggestion}`);
        console.log();
    }
}

if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
        `# Copyedit check: ${date}`,
        '',
        `${segments.length} segments reviewed via ${modelName}. **${findings.length} finding(s)** — all advisory; verify in context before applying.`,
        '',
    ];
    if (findings.length) {
        lines.push('| Severity | Category | Where | Note | Suggestion |');
        lines.push('|---|---|---|---|---|');
        for (const f of findings) {
            const esc = (s) => (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
            lines.push(
                `| ${f.severity} | ${f.category} | \`${esc(f.where)}\` | ${esc(f.message)} | ${esc(f.suggestion)} |`,
            );
        }
    } else {
        lines.push('No findings. The pass returned a clean review.');
    }
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

process.exit(0);
