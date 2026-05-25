import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { select, selectAll } from 'hast-util-select';
import type { Root, Element, ElementContent } from 'hast';

export interface NewsletterContent {
    body: string;
}

/**
 * Mailchimp source separates paragraphs with <br> rather than <p>. After we
 * unwrap layout tables those <br>s end up adrift inside a single block and the
 * markdown output collapses to one line. Pre-process the raw HTML to convert
 * each <br> into a paragraph boundary so the structure survives the conversion.
 */
function preprocessBrs(html: string): string {
    return html.replace(/<br\s*\/?>/gi, '</p><p>');
}

function parseHtml(html: string): Root {
    return unified().use(rehypeParse, { fragment: false }).parse(preprocessBrs(html)) as Root;
}

function hastToMarkdown(node: Element): string {
    const proc = unified()
        .use(rehypeRemark)
        .use(remarkGfm)
        .use(remarkStringify, { bullet: '-', emphasis: '*', strong: '*', fences: true });
    const mdast = proc.runSync(node as never);
    return proc.stringify(mdast as never).toString();
}

/**
 * Mailchimp newsletters are built on nested layout tables. Unwrap every
 * <table>/<tbody>/<thead>/<tr>/<td>/<th> by replacing them with their children,
 * then drop the now-empty `<colgroup>`/`<col>` shells. This mirrors the
 * legacy Python `markdownify(..., strip=["table","tbody","tr","td", ...])`,
 * which discarded the tags but kept their textual content.
 */
/**
 * Mailchimp emails wrap everything in nested layout tables, <font>, <center>,
 * etc. Rather than trying to retag them (which still leaves rehype-remark
 * treating the contents as table cells), we flatten the entire subtree into a
 * single <div> of block-level children — paragraphs, headings, lists, images.
 * This mirrors what `markdownify(..., strip=["table","tr","td","span","div"])`
 * effectively did in the legacy Python scraper.
 *
 * Walk strategy: depth-first traversal collecting block elements (p, h1-h6,
 * ul, ol, blockquote, hr, pre, figure). Standalone images get wrapped in a
 * paragraph so they render with surrounding blank lines. Comments, scripts,
 * and styles are dropped.
 */
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'hr', 'pre', 'figure']);
const DROP_TAGS = new Set(['script', 'style', 'meta', 'link', 'head']);

function flattenBlocks(node: Element | Root): ElementContent[] {
    const out: ElementContent[] = [];
    const visit = (el: Element | Root): void => {
        for (const c of el.children ?? []) {
            if (c.type === 'comment') continue;
            if (c.type !== 'element') continue; // drop stray inline text between blocks
            const child = c as Element;
            if (DROP_TAGS.has(child.tagName)) continue;

            if (BLOCK_TAGS.has(child.tagName)) {
                out.push(child);
                continue;
            }
            if (child.tagName === 'img') {
                // Wrap orphan images in a <p> so they get their own paragraph.
                out.push({
                    type: 'element',
                    tagName: 'p',
                    properties: {},
                    children: [child],
                } as Element);
                continue;
            }
            // Recurse into containers (div, table, td, span, center, font, a, etc.)
            visit(child);
        }
    };
    visit(node);
    return out;
}

function hasClass(el: Element, cls: string): boolean {
    const c = el.properties?.className;
    if (Array.isArray(c)) return c.includes(cls);
    if (typeof c === 'string') return c.split(/\s+/).includes(cls);
    return false;
}

/**
 * Recursively strip out Mailchimp footer / preview / unsubscribe blocks.
 * Operates on the hast tree (so we don't have to regex markdown afterward).
 */
function stripJunk(el: Element): void {
    const junkClasses = new Set([
        'mcnPreviewText',
        'start-link',
        'footer-content',
        'mcnFollowBlock',
        'mcnFollowContent',
        'utilityBar',
        'preheaderContainer',
    ]);
    el.children = (el.children ?? []).filter((c) => {
        if (c.type !== 'element') return true;
        const child = c as Element;
        for (const cls of junkClasses) if (hasClass(child, cls)) return false;
        // id-based junk
        const id = child.properties?.id as string | undefined;
        if (id && (id === 'templateFooter' || id === 'templatePreheader')) return false;
        return true;
    });
    for (const c of el.children) if (c.type === 'element') stripJunk(c as Element);
}

/**
 * Strip trailing footer text (View email in browser / unsubscribe / preferences)
 * from the bottom of the markdown output. The hast strip catches structured
 * footers; this catches stragglers in the inline content area.
 */
function stripFooterText(md: string): string {
    const patterns = [
        /View email in browser[\s\S]*$/i,
        /update your preferences[\s\S]*$/i,
        /^\s*unsubscribe[\s\S]*$/im,
    ];
    let out = md;
    for (const p of patterns) out = out.replace(p, '');
    return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Find the main content container for a Mailchimp newsletter.
 * Order: #templateBody → #bodyContainer → all .mceText blocks wrapped → <body>.
 */
function hasBlockContent(el: Element): boolean {
    const found = { yes: false };
    const visit = (n: Element): void => {
        if (found.yes) return;
        for (const c of n.children ?? []) {
            if (c.type !== 'element') continue;
            const child = c as Element;
            if (BLOCK_TAGS.has(child.tagName) || child.tagName === 'img') {
                found.yes = true;
                return;
            }
            visit(child);
        }
    };
    visit(el);
    return found.yes;
}

function findContent(root: Root): Element | null {
    // Try the named template containers first.
    for (const sel of ['#templateBody', '#bodyContainer']) {
        const el = select(sel, root) as Element | null;
        if (el && hasBlockContent(el)) return el;
    }
    // Some Mailchimp templates leave #templateBody empty and put text in
    // sibling containers (templateHeader, templateLowerBody, etc.). Fall back
    // to gathering every .mceText block.
    const mceBlocks = selectAll('.mceText', root) as Element[];
    if (mceBlocks.length > 0) {
        return {
            type: 'element',
            tagName: 'div',
            properties: {},
            children: mceBlocks as unknown as ElementContent[],
        };
    }
    return (select('body', root) as Element | null) ?? null;
}

export function parseNewsletter(html: string): NewsletterContent {
    const root = parseHtml(html);
    const content = findContent(root);
    if (!content) return { body: 'Content extraction failed.\n' };

    stripJunk(content);
    const blocks = flattenBlocks(content);
    const wrapper: Element = {
        type: 'element',
        tagName: 'div',
        properties: {},
        children: blocks,
    };
    let md = hastToMarkdown(wrapper);
    md = stripFooterText(md);
    // Collapse any 3+ newline runs that remark-stringify may emit between blocks.
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return { body: md + '\n' };
}
