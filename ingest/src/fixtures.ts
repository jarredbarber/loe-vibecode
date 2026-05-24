import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cachePathFor, fetchCached } from './fetch.js';
import { extractSegmentUrls } from './discover.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

export interface FixtureManifest {
    date: string;
    show: { url: string; file: string };
    segments: { url: string; file: string }[];
}

/**
 * Snapshot a show + its segments from cache into fixtures/<slug>/.
 * Writes a manifest.json listing URLs and the local filenames.
 */
export async function addFixture(slug: string, showUrl: string, date: string): Promise<FixtureManifest> {
    const dir = join(FIXTURES_DIR, slug);
    await mkdir(dir, { recursive: true });

    const showHtml = await fetchCached(showUrl);
    await copyFile(cachePathFor(showUrl), join(dir, 'show.html'));

    const segUrls = extractSegmentUrls(showHtml);
    const segments: { url: string; file: string }[] = [];
    let i = 0;
    for (const url of segUrls) {
        i++;
        const file = `segment-${String(i).padStart(2, '0')}.html`;
        await fetchCached(url);
        await copyFile(cachePathFor(url), join(dir, file));
        segments.push({ url, file });
    }

    const manifest: FixtureManifest = {
        date,
        show: { url: showUrl, file: 'show.html' },
        segments,
    };
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return manifest;
}
