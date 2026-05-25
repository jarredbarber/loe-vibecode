import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cachePathFor } from './fetch.js';
import type { ShowDoc } from './parse-show.js';
import type { SegmentDoc } from './parse-segment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CONTENT_DIR = join(__dirname, '..', '..', 'content', 'shows');

/**
 * Pelican parses frontmatter with Python-Markdown's Meta extension, NOT YAML.
 * Meta is plain `key: value` per line — quotes are taken literally and there's
 * no escaping syntax. So we emit raw values with one normalization: collapse
 * any embedded newlines/CRs to spaces, since Meta treats indented continuation
 * lines as part of the value (we don't want surprises).
 */
function metaValue(v: string): string {
    return v.replace(/[\r\n]+/g, ' ').trim();
}

function frontmatter(fields: Record<string, string | null | undefined>): string {
    const lines = ['---'];
    for (const [k, v] of Object.entries(fields)) {
        if (v == null) continue;
        lines.push(`${k}: ${metaValue(String(v))}`);
    }
    lines.push('---', '');
    return lines.join('\n');
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

interface WriteOpts {
    sourceUrl: string;
    force?: boolean;
}

/**
 * Idempotency guard: refuse to overwrite a file whose mtime is newer than the
 * cached source HTML's mtime (suggesting a hand-edit). `--force` overrides.
 */
async function safeWrite(path: string, content: string, opts: WriteOpts): Promise<'wrote' | 'skipped' | 'unchanged'> {
    if (await exists(path)) {
        const existing = await readFile(path, 'utf8');
        if (existing === content) return 'unchanged';
        if (!opts.force) {
            const fileStat = await stat(path);
            const cacheStat = await stat(cachePathFor(opts.sourceUrl)).catch(() => null);
            if (cacheStat && fileStat.mtimeMs > cacheStat.mtimeMs + 1000) {
                return 'skipped';
            }
        }
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
    return 'wrote';
}

export interface EmitShowInput {
    show: ShowDoc;
    showUrl: string;
    segments: { doc: SegmentDoc; url: string }[];
}

export async function emitShow(input: EmitShowInput, opts: { force?: boolean } = {}): Promise<{
    showPath: string;
    segmentPaths: string[];
    actions: Record<string, 'wrote' | 'skipped' | 'unchanged'>;
}> {
    const { show, showUrl, segments } = input;
    const [year, month, day] = show.date.split('-');
    const outDir = join(CONTENT_DIR, year, `${month}-${day}`);

    const actions: Record<string, 'wrote' | 'skipped' | 'unchanged'> = {};

    // De-duplicate segment slugs by suffixing.
    const slugCounts = new Map<string, number>();
    const segmentPaths: string[] = [];
    const segmentEntries: { title: string; filename: string }[] = [];

    for (const { doc, url } of segments) {
        const n = (slugCounts.get(doc.slug) ?? 0) + 1;
        slugCounts.set(doc.slug, n);
        const slug = n === 1 ? doc.slug : `${doc.slug}-${n}`;
        const filename = `${slug}.md`;
        const path = join(outDir, filename);

        const fm = frontmatter({
            title: doc.title,
            date: show.date,
            category: 'Segments',
            megaphone_id: doc.megaphoneId,
            image_url: doc.imageUrl,
            image_caption: doc.imageCaption,
            summary: doc.summary,
        });
        const content = `${fm}<!-- source: ${url} -->\n\n${doc.body}`;
        actions[path] = await safeWrite(path, content, { sourceUrl: url, force: opts.force });
        segmentPaths.push(path);
        segmentEntries.push({ title: doc.title, filename });
    }

    // show.md — fall back to the first segment's summary if the show has none.
    const showPath = join(outDir, 'show.md');
    const showSummary = show.summary ?? segments[0]?.doc.summary ?? null;
    const showImage = show.imageUrl ?? segments[0]?.doc.imageUrl ?? null;
    const showFm = frontmatter({
        title: show.title,
        date: show.date,
        category: 'Shows',
        template: 'show',
        megaphone_id: show.megaphoneId,
        image_url: showImage,
        summary: showSummary,
    });
    const segmentsList = segmentEntries
        .map(({ title, filename }) => `### [${title}]({filename}${filename})\n`)
        .join('\n');
    const showContent = `${showFm}<!-- source: ${showUrl} -->\n\n## Segments\n\n${segmentsList}`;
    actions[showPath] = await safeWrite(showPath, showContent, { sourceUrl: showUrl, force: opts.force });

    return { showPath, segmentPaths, actions };
}
