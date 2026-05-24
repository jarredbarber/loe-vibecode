import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(__dirname, '..', 'cache');

const USER_AGENT = 'loe-ingest/0.1 (+https://vibingon.earth)';
const DEFAULT_DELAY_MS = 500;

let lastFetchAt = 0;

function cachePath(url: string): string {
    const hash = createHash('sha1').update(url).digest('hex');
    return join(CACHE_DIR, `${hash}.html`);
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

async function politeDelay(minMs: number): Promise<void> {
    const elapsed = Date.now() - lastFetchAt;
    if (elapsed < minMs) {
        await new Promise((r) => setTimeout(r, minMs - elapsed));
    }
    lastFetchAt = Date.now();
}

export interface FetchOptions {
    force?: boolean;
    delayMs?: number;
}

/**
 * Fetch a URL, caching the response body to disk by sha1(url).
 * Subsequent calls return the cached copy unless `force` is set.
 */
export async function fetchCached(url: string, opts: FetchOptions = {}): Promise<string> {
    const path = cachePath(url);
    if (!opts.force && (await exists(path))) {
        return readFile(path, 'utf8');
    }

    await mkdir(CACHE_DIR, { recursive: true });
    await politeDelay(opts.delayMs ?? DEFAULT_DELAY_MS);

    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
        throw new Error(`fetch ${url} → ${res.status} ${res.statusText}`);
    }
    const body = await res.text();
    await writeFile(path, body, 'utf8');
    return body;
}

export function cachePathFor(url: string): string {
    return cachePath(url);
}
