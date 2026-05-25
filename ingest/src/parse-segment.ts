import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { select, selectAll } from 'hast-util-select';
import { toText } from 'hast-util-to-text';
import type { Root, Element, ElementContent } from 'hast';

import { BASE_URL } from './discover.js';

export interface SegmentDoc {
    title: string;
    slug: string;
    megaphoneId: string | null;
    imageUrl: string | null;
    imageCaption: string | null;
    summary: string | null;
    /** Final markdown body (transcript + related links section) */
    body: string;
}

export function slugify(text: string, maxLen = 80): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/[\s-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, maxLen);
}

function absoluteUrl(href: string): string {
    if (!href) return href;
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `${BASE_URL}${href}`;
    return `${BASE_URL}/shows/${href}`;
}

function parseHtml(html: string): Root {
    return unified().use(rehypeParse, { fragment: false }).parse(html) as Root;
}

/** Convert a hast Element/Root to GFM-flavored markdown. */
function hastToMarkdown(node: Element | Root): string {
    const proc = unified()
        .use(rehypeRemark)
        .use(remarkGfm)
        .use(remarkStringify, { bullet: '-', emphasis: '*', strong: '*', fences: true });
    const mdast = proc.runSync(node as never);
    const raw = proc.stringify(mdast as never).toString();
    return fixHardBreaks(unescapeSafe(raw));
}

/**
 * Two post-processing fixes for the markdown remark-stringify emits:
 *
 * 1. `http\://` → `http://`. remark-stringify escapes the colon to prevent
 *    autolink interpretation; safe to undo since we keep the brackets escaped
 *    (see #2) so no `[text](url)` link can form by accident.
 * 2. `\.` after a digit (e.g. `0.06-.10\.`) — never meaningful in markdown.
 *
 * Note: we deliberately KEEP `\[` and `\]` escaped. Pelican's Python-Markdown
 * parser eats unescaped brackets as broken link references, leaving dangling
 * `]` characters in the rendered HTML. The escape survives Pelican as a
 * literal `[`, which is what we want for audio cues like
 * `[Northern Cardinal song, http://...]` in syndicated BirdNote segments.
 *
 * Likewise we keep `\###` etc. — those preserve literal text that would
 * otherwise become an h3 heading.
 */
function unescapeSafe(md: string): string {
    return md
        .replace(/(https?)\\:\/\//g, '$1://')
        .replace(/(\d)\\\./g, '$1.');
}

/**
 * remark-stringify emits CommonMark hard breaks as `\` followed by newline.
 * Pelican's Python-Markdown does not recognize that syntax — it renders the
 * backslash literally. Replace with the two-trailing-spaces form, which both
 * CommonMark and Python-Markdown understand.
 */
function fixHardBreaks(md: string): string {
    return md.replace(/\\\n/g, '  \n');
}

function findMegaphoneId(root: Root): string | null {
    for (const iframe of selectAll('iframe', root)) {
        const src = (iframe.properties?.src as string) ?? '';
        const m = src.match(/[?&]e=([A-Z0-9]+)/);
        if (m) return m[1];
    }
    return null;
}

function findHeadlineTitle(root: Root): string {
    const h = select('[itemprop="headline"]', root);
    if (h) return toText(h).trim();
    const h3 = select('h3', root);
    if (h3) return toText(h3).trim();
    const h2 = select('h2', root);
    if (h2) return toText(h2).trim();
    return 'Untitled';
}

function findHeaderImage(root: Root): { url: string; caption: string | null } | null {
    const img = select('img[itemprop="image"]', root) ?? select('div.left img', root);
    if (!img) return null;
    const src = (img.properties?.src as string) ?? '';
    if (!src || src.endsWith('.gif')) return null;

    let caption: string | null = null;
    const cap = select('p.photocap', root);
    if (cap) caption = toText(cap).trim();
    return { url: absoluteUrl(src), caption };
}

function findSummary(root: Root): string | null {
    // First <strong> inside a <p> that has substantial length.
    for (const p of selectAll('p', root)) {
        const strong = select('strong', p);
        if (!strong) continue;
        const text = toText(strong).trim();
        if (text.length > 40) return text;
    }
    return null;
}

/**
 * Collect transcript content from the page. After parse5 fixes up the malformed
 * HTML, transcript paragraphs are top-level <p class="transcript"> elements,
 * with <div class="imagecenter"> blocks interleaved.
 */
function collectBodyChildren(root: Root): ElementContent[] {
    const out: ElementContent[] = [];
    for (const el of selectAll('p.transcript, div.imagecenter', root)) {
        out.push(el as ElementContent);
    }
    return stripSyndicatedCredits(out);
}

/**
 * Syndicated segments (BirdNote, EarthEar, etc.) end with a `###` divider
 * followed by production credits (bird sounds attribution, Producer/Narrator
 * lines, copyright, internal `ID# ...` codes). Drop the divider and every
 * paragraph after it up to (but not including) the next paragraph that starts
 * with a speaker label like `CURWOOD:` — that's the host outro and should stay.
 *
 * If no speaker line ever follows the divider, drop everything from `###` to
 * the end.
 */
function stripSyndicatedCredits(children: ElementContent[]): ElementContent[] {
    const isDivider = (n: ElementContent) =>
        n.type === 'element' && toText(n as Element).trim() === '###';
    const isSpeakerLine = (n: ElementContent) => {
        if (n.type !== 'element') return false;
        return /^\s*[A-Z][A-Z' ]+:/.test(toText(n as Element));
    };

    const dividerIdx = children.findIndex(isDivider);
    if (dividerIdx === -1) return children;

    let resumeIdx = children.length;
    for (let i = dividerIdx + 1; i < children.length; i++) {
        if (isSpeakerLine(children[i])) {
            resumeIdx = i;
            break;
        }
    }
    return [...children.slice(0, dividerIdx), ...children.slice(resumeIdx)];
}

/**
 * Collect related-links list items. The links section is wrapped in an <h3>Links
 * which parse5 reshapes; we just grab every <a> that follows an <a name="links">
 * anchor.
 */
function collectLinks(root: Root): { href: string; text: string }[] {
    // Find the anchor and gather subsequent <a href> links until a likely cutoff.
    const allAnchors = selectAll('a[name="links"]', root);
    if (allAnchors.length === 0) return [];
    // Easier: just take every <a href> whose parent is inside a span/h3/p near
    // a "Links" header. Heuristic: collect all <a href> after the first <h3>
    // containing the text "Links".
    const links: { href: string; text: string }[] = [];
    for (const h3 of selectAll('h3', root)) {
        if (!toText(h3).trim().toLowerCase().startsWith('links')) continue;
        // gather <a> inside this h3 and its following siblings until end of section
        for (const a of selectAll('a[href]', h3)) {
            const href = (a.properties?.href as string) ?? '';
            const text = toText(a).trim();
            if (href && text) links.push({ href: absoluteUrl(href), text });
        }
        // also <a href> that may have been hoisted out as siblings — rare.
    }
    return links;
}

function absolutizeUrls(node: ElementContent | Element): void {
    if (node.type !== 'element') return;
    const el = node as Element;
    if (el.tagName === 'img' && el.properties) {
        const src = el.properties.src;
        if (typeof src === 'string') el.properties.src = absoluteUrl(src);
    }
    if (el.tagName === 'a' && el.properties) {
        const href = el.properties.href;
        if (typeof href === 'string' && !href.startsWith('#') && !href.startsWith('mailto:')) {
            el.properties.href = absoluteUrl(href);
        }
    }
    for (const child of el.children ?? []) absolutizeUrls(child as ElementContent);
}

function buildBodyMarkdown(
    transcriptChildren: ElementContent[],
    links: { href: string; text: string }[],
): string {
    for (const c of transcriptChildren) absolutizeUrls(c);
    const wrapper: Element = {
        type: 'element',
        tagName: 'div',
        properties: {},
        children: transcriptChildren,
    };
    let md = '';
    if (transcriptChildren.length > 0) {
        md += '## Transcript\n\n' + hastToMarkdown(wrapper).trim() + '\n';
    }
    if (links.length > 0) {
        md += '\n## Related Links\n\n';
        for (const { href, text } of links) {
            md += `- [${text}](${href})\n`;
        }
    }
    return md.trim() + '\n';
}

export function parseSegment(html: string, titleHint?: string): SegmentDoc {
    const root = parseHtml(html);

    const title = findHeadlineTitle(root) || titleHint || 'Untitled';
    const megaphoneId = findMegaphoneId(root);
    const header = findHeaderImage(root);
    const summary = findSummary(root);
    const transcript = collectBodyChildren(root);
    const links = collectLinks(root);

    return {
        title,
        slug: slugify(title),
        megaphoneId,
        imageUrl: header?.url ?? null,
        imageCaption: header?.caption ?? null,
        summary,
        body: buildBodyMarkdown(transcript, links),
    };
}
