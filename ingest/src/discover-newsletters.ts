import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import { selectAll, select } from 'hast-util-select';
import { toText } from 'hast-util-to-text';
import type { Root, Element } from 'hast';

import { fetchCached } from './fetch.js';

export const ARCHIVE_URL =
    'https://us3.campaign-archive.com/home/?u=9f9ebdcfa232a532a7e70746b&id=2383d76cae';

export interface NewsletterRef {
    /** ISO date YYYY-MM-DD */
    date: string;
    title: string;
    url: string;
}

const DATE_RE = /(\d{2})\/(\d{2})\/(\d{4})\s*-/;

/**
 * Scrape the Mailchimp archive index. Each entry is a <li> whose text starts
 * with `MM/DD/YYYY -` followed by an <a> with the newsletter title + URL.
 * Dedup by title (keep first occurrence) — Mailchimp resends + corrections
 * sometimes share a title with a different date.
 */
export async function discoverNewsletters(): Promise<NewsletterRef[]> {
    const html = await fetchCached(ARCHIVE_URL);
    const root = unified().use(rehypeParse, { fragment: false }).parse(html) as Root;

    const found: NewsletterRef[] = [];
    for (const li of selectAll('li', root)) {
        const text = toText(li as Element);
        const m = text.match(DATE_RE);
        if (!m) continue;
        const a = select('a', li as Element);
        if (!a) continue;
        const title = toText(a as Element).trim();
        const href = ((a as Element).properties?.href as string) ?? '';
        if (!title || !href) continue;
        const date = `${m[3]}-${m[1]}-${m[2]}`;
        found.push({ date, title, url: href });
    }

    const seen = new Set<string>();
    const unique: NewsletterRef[] = [];
    for (const item of found) {
        if (seen.has(item.title)) continue;
        seen.add(item.title);
        unique.push(item);
    }
    return unique;
}
