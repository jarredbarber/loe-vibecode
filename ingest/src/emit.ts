import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { cachePathFor } from './fetch.js';
import type { ShowDoc } from './parse-show.js';
import type { SegmentDoc } from './parse-segment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SHOWS_DIR = join(__dirname, '..', '..', 'content', 'shows');
export const SEGMENTS_DIR = join(__dirname, '..', '..', 'content', 'segments');
// Backwards-compat alias used elsewhere.
export const CONTENT_DIR = SHOWS_DIR;

/**
 * Emit proper YAML frontmatter. Pelican is now configured with the
 * `full_yaml_metadata` extension instead of Python-Markdown's Meta reader,
 * so we can write real YAML — quoting, escaping, multi-line values all work.
 *
 * js-yaml chooses quoting style automatically; we just normalize embedded
 * newlines to spaces in scalar values so we don't get unintentional block
 * scalars in summaries.
 */
function frontmatter(fields: Record<string, string | null | undefined>): string {
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
        if (v == null) continue;
        data[k] = String(v).replace(/[\r\n]+/g, ' ').trim();
    }
    const body = yaml.dump(data, { lineWidth: -1, noRefs: true });
    return `---\n${body}---\n`;
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
    // Shows go under content/shows/YYYY/MM-DD/show.md.
    // Segments go under content/segments/YYYY/MM-DD/<slug>.md so the two
    // entity types live in disjoint folders — required for Sveltia CMS to
    // distinguish them as separate collections.
    const showDir = join(SHOWS_DIR, year, `${month}-${day}`);
    const segmentDir = join(SEGMENTS_DIR, year, `${month}-${day}`);

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
        const path = join(segmentDir, filename);

        const fm = frontmatter({
            title: doc.title,
            // Explicit slug ensures Pelican's URL output matches the dedup'd
            // filename, even when two segments on different shows share a
            // title that would otherwise slugify to the same value (e.g.
            // 'Fall Gardening Tips' running in multiple years).
            slug,
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
    const showPath = join(showDir, 'show.md');
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
    // Segments are auto-discovered by the show_segments Pelican plugin from
    // sibling .md files; no need to enumerate them in the show body.
    // segmentEntries is kept above only so emit returns a useful segmentPaths
    // value for callers.
    void segmentEntries;
    const showContent = `${showFm}<!-- source: ${showUrl} -->\n`;
    actions[showPath] = await safeWrite(showPath, showContent, { sourceUrl: showUrl, force: opts.force });

    return { showPath, segmentPaths, actions };
}
