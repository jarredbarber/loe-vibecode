import { fetchCached } from './fetch.js';

export const BASE_URL = 'https://loe.org';

export interface ShowRef {
    programId: string;
    url: string;
    /** ISO date (YYYY-MM-DD) parsed from the show page, or null if not found */
    date: string | null;
    /** Absolute URLs of every segment page linked from the show */
    segments: string[];
}

const MONTHS: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/**
 * Extract YYYY-MM-DD from a show page. Looks for "Month Day, Year" in any <h2>
 * or in a paragraph containing "Air Date:".
 */
export function extractShowDate(html: string): string | null {
    const dateRe = /([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/;
    const candidates: string[] = [];

    for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)) candidates.push(m[1]);
    for (const m of html.matchAll(/Air Date:[\s\S]{0,200}/gi)) candidates.push(m[0]);

    for (const c of candidates) {
        const text = c.replace(/<[^>]+>/g, ' ');
        const m = text.match(dateRe);
        if (!m) continue;
        const month = MONTHS[m[1].toLowerCase()];
        if (!month) continue;
        const day = m[2].padStart(2, '0');
        return `${m[3]}-${month}-${day}`;
    }
    return null;
}

/**
 * Extract every segment URL linked from a show page. Segments are identified by
 * the `segmentID=` query param.
 */
export function extractSegmentUrls(html: string): string[] {
    const out = new Set<string>();
    const hrefRe = /href=["']([^"']*segmentID=[^"']+)["']/gi;
    for (const m of html.matchAll(hrefRe)) {
        const raw = m[1];
        const absolute = raw.startsWith('http')
            ? raw
            : raw.startsWith('/')
              ? `${BASE_URL}${raw}`
              : `${BASE_URL}/shows/${raw}`;
        out.add(absolute);
    }
    return [...out];
}

/**
 * Scan a year's TOC, then fetch each show page (cached) to enrich with date +
 * segment URLs. All fetches are cached, so subsequent calls are offline.
 */
export async function discoverYear(year: number): Promise<ShowRef[]> {
    const tocUrl = `${BASE_URL}/shows/toc.html?year=${year}`;
    const html = await fetchCached(tocUrl);

    const hrefRe = /href=["']([^"']+programID=[^"']+)["']/gi;
    // programID values are like "26-P13-00021" — require at least one digit so
    // that malformed entries on older TOCs (e.g. `programID=--`) don't match.
    const programIdRe = /programID=(\d[0-9A-Za-z-]*)/;
    const seen = new Map<string, string>();

    for (const match of html.matchAll(hrefRe)) {
        const rawHref = match[1];
        const programMatch = rawHref.match(programIdRe);
        if (!programMatch) continue;
        const programId = programMatch[1];

        const absolute = rawHref.startsWith('http')
            ? rawHref
            : rawHref.startsWith('/')
              ? `${BASE_URL}${rawHref}`
              : `${BASE_URL}/shows/${rawHref}`;

        const existing = seen.get(programId);
        if (!existing || (existing.includes('segmentID=') && !absolute.includes('segmentID='))) {
            seen.set(programId, absolute);
        }
    }

    const refs: ShowRef[] = [];
    for (const [programId, url] of seen) {
        try {
            const showHtml = await fetchCached(url);
            refs.push({
                programId,
                url,
                date: extractShowDate(showHtml),
                segments: extractSegmentUrls(showHtml),
            });
        } catch (e) {
            // One broken link on the TOC shouldn't kill the whole year.
            console.warn(`  ! skipping ${programId}: ${(e as Error).message}`);
        }
    }
    return refs;
}
