import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import { select, selectAll } from 'hast-util-select';
import { toText } from 'hast-util-to-text';
import type { Root } from 'hast';

import { BASE_URL, extractShowDate } from './discover.js';

export interface ShowDoc {
    title: string;
    date: string;
    megaphoneId: string | null;
    imageUrl: string | null;
    summary: string | null;
}

function parseHtml(html: string): Root {
    return unified().use(rehypeParse, { fragment: false }).parse(html) as Root;
}

function absoluteUrl(href: string): string {
    if (!href) return href;
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `${BASE_URL}${href}`;
    return `${BASE_URL}/shows/${href}`;
}

export function parseShow(html: string, fallbackDate: string | null = null): ShowDoc {
    const root = parseHtml(html);
    const date = extractShowDate(html) ?? fallbackDate ?? '1970-01-01';

    // Title: "Living on Earth: Month Day, Year" — synthesized from the date so
    // we don't pick up sidebar h2s like "Living on Earth wants to hear from you!"
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const [y, m, d] = date.split('-').map((n) => parseInt(n, 10));
    const title = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
        ? `Living on Earth: ${months[m - 1]} ${d}, ${y}`
        : `Living on Earth: ${date}`;

    let megaphoneId: string | null = null;
    for (const iframe of selectAll('iframe', root)) {
        const src = (iframe.properties?.src as string) ?? '';
        const m = src.match(/[?&]e=([A-Z0-9]+)/);
        if (m) {
            megaphoneId = m[1];
            break;
        }
    }

    let imageUrl: string | null = null;
    const img = select('img[itemprop="image"]', root) ?? select('div.left img', root);
    if (img) {
        const src = (img.properties?.src as string) ?? '';
        if (src && !src.endsWith('.gif')) imageUrl = absoluteUrl(src);
    }

    let summary: string | null = null;
    for (const p of selectAll('p', root)) {
        const strong = select('strong', p);
        if (!strong) continue;
        const text = toText(strong).trim();
        if (text.length > 40) {
            summary = text;
            break;
        }
    }

    return { title, date, megaphoneId, imageUrl, summary };
}
