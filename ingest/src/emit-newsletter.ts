import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cachePathFor } from './fetch.js';
import { slugify } from './parse-segment.js';
import type { NewsletterRef } from './discover-newsletters.js';
import type { NewsletterContent } from './parse-newsletter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const NEWSLETTER_DIR = join(__dirname, '..', '..', 'content', 'newsletters');

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

async function safeWrite(
    path: string,
    content: string,
    sourceUrl: string,
    force: boolean,
): Promise<'wrote' | 'skipped' | 'unchanged'> {
    if (await exists(path)) {
        const existing = await readFile(path, 'utf8');
        if (existing === content) return 'unchanged';
        if (!force) {
            const fileStat = await stat(path);
            const cacheStat = await stat(cachePathFor(sourceUrl)).catch(() => null);
            if (cacheStat && fileStat.mtimeMs > cacheStat.mtimeMs + 1000) return 'skipped';
        }
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
    return 'wrote';
}

export interface EmitNewsletterInput {
    ref: NewsletterRef;
    doc: NewsletterContent;
}

export async function emitNewsletter(
    input: EmitNewsletterInput,
    opts: { force?: boolean } = {},
): Promise<{ path: string; action: 'wrote' | 'skipped' | 'unchanged' }> {
    const { ref, doc } = input;
    // slugify with no truncation, matching the legacy Python output.
    const slug = slugify(ref.title, Number.MAX_SAFE_INTEGER);
    const filename = `${ref.date}-${slug}.md`;
    const path = join(NEWSLETTER_DIR, filename);

    const fm = frontmatter({
        title: ref.title,
        date: ref.date,
        category: 'Newsletter',
        slug,
        summary: `Newsletter from ${ref.date}`,
        template: 'newsletter_article',
    });
    const content = `${fm}${doc.body}`;
    const action = await safeWrite(path, content, ref.url, opts.force ?? false);
    return { path, action };
}
