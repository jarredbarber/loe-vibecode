#!/usr/bin/env node
import { Command } from 'commander';
import { discoverYear } from './discover.js';
import { fetchCached } from './fetch.js';
import { addFixture } from './fixtures.js';
import { parseSegment } from './parse-segment.js';
import { parseShow } from './parse-show.js';
import { emitShow } from './emit.js';

const program = new Command();
program.name('ingest').description('LOE content ingest pipeline. See ../INGEST.md.');

program
    .command('discover')
    .description('List all shows for a year (with date + segment URLs) from loe.org')
    .requiredOption('--year <year>', 'year to scan', (v) => parseInt(v, 10))
    .action(async ({ year }: { year: number }) => {
        const shows = await discoverYear(year);
        console.log(`Found ${shows.length} shows for ${year}`);
        for (const s of shows) {
            console.log(`  ${s.date ?? '????-??-??'}  ${s.programId}  (${s.segments.length} segments)`);
        }
    });

program
    .command('fetch')
    .description('Fetch and cache every show + segment page for a year')
    .requiredOption('--year <year>', 'year to fetch', (v) => parseInt(v, 10))
    .option('--force', 'refetch even if cached', false)
    .action(async ({ year, force }: { year: number; force: boolean }) => {
        const shows = await discoverYear(year);
        console.log(`Fetching ${shows.length} shows for ${year}...`);
        let i = 0;
        for (const s of shows) {
            i++;
            const label = `[${i}/${shows.length}] ${s.date ?? 'no-date'} ${s.programId}`;
            try {
                if (force) await fetchCached(s.url, { force: true });
                let segOk = 0;
                let segErr = 0;
                for (const segUrl of s.segments) {
                    try {
                        await fetchCached(segUrl, { force });
                        segOk++;
                    } catch (e) {
                        segErr++;
                        console.log(`    ✗ ${segUrl}: ${(e as Error).message}`);
                    }
                }
                console.log(`  ${label} ✓ ${segOk}/${s.segments.length} segments${segErr ? ` (${segErr} failed)` : ''}`);
            } catch (e) {
                console.log(`  ${label} ✗ ${(e as Error).message}`);
            }
        }
    });

program
    .command('emit')
    .description('Parse cached HTML and emit markdown to content/shows/')
    .requiredOption('--year <year>', 'year to emit', (v) => parseInt(v, 10))
    .option('--force', 'overwrite even if file looks hand-edited', false)
    .action(async ({ year, force }: { year: number; force: boolean }) => {
        const shows = (await discoverYear(year)).filter((s) => s.date);
        let wrote = 0;
        let skipped = 0;
        let unchanged = 0;
        for (const s of shows) {
            const showHtml = await fetchCached(s.url);
            const showDoc = parseShow(showHtml, s.date);
            const segments = [];
            for (const segUrl of s.segments) {
                const segHtml = await fetchCached(segUrl);
                segments.push({ doc: parseSegment(segHtml), url: segUrl });
            }
            const result = await emitShow({ show: showDoc, showUrl: s.url, segments }, { force });
            for (const a of Object.values(result.actions)) {
                if (a === 'wrote') wrote++;
                else if (a === 'skipped') skipped++;
                else unchanged++;
            }
            console.log(`  ${s.date} ${s.programId}: ${segments.length} segments → ${result.showPath}`);
        }
        console.log(`\n${wrote} wrote, ${unchanged} unchanged, ${skipped} skipped (hand-edited; use --force)`);
    });

program
    .command('emit-fixture')
    .description('Parse one cached show and emit to a temp dir for inspection')
    .requiredOption('--url <url>', 'show URL (must be cached)')
    .requiredOption('--out <dir>', 'output dir')
    .action(async ({ url, out }: { url: string; out: string }) => {
        const { writeFile, mkdir } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const showHtml = await fetchCached(url);
        const showDoc = parseShow(showHtml);
        const refs = (await discoverYear(parseInt(showDoc.date.slice(0, 4), 10))).find((s) => s.url === url);
        if (!refs) throw new Error(`url not in discovered set: ${url}`);
        await mkdir(out, { recursive: true });
        let i = 0;
        for (const segUrl of refs.segments) {
            i++;
            const segHtml = await fetchCached(segUrl);
            const doc = parseSegment(segHtml);
            await writeFile(join(out, `segment-${String(i).padStart(2, '0')}-${doc.slug}.md`),
                `<!-- ${segUrl} -->\n# ${doc.title}\n\nmegaphone: ${doc.megaphoneId}\nimage: ${doc.imageUrl}\ncaption: ${doc.imageCaption}\nsummary: ${doc.summary}\n\n---\n\n${doc.body}`, 'utf8');
        }
        await writeFile(join(out, 'show.md'),
            `# ${showDoc.title}\n\ndate: ${showDoc.date}\nmegaphone: ${showDoc.megaphoneId}\nimage: ${showDoc.imageUrl}\nsummary: ${showDoc.summary}\n`, 'utf8');
        console.log(`Wrote ${i + 1} files to ${out}`);
    });

program
    .command('fixture-add-random')
    .description('Pick N random shows from a year and snapshot them as fixtures')
    .requiredOption('--year <year>', 'year to draw from', (v) => parseInt(v, 10))
    .option('--count <n>', 'how many to pick', (v) => parseInt(v, 10), 4)
    .option('--seed <s>', 'PRNG seed for reproducibility', '42')
    .action(async ({ year, count, seed }: { year: number; count: number; seed: string }) => {
        const shows = (await discoverYear(year)).filter((s) => s.date);
        // Deterministic shuffle: mulberry32 seeded from string hash.
        let h = 2166136261;
        for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
        let state = h >>> 0;
        const rand = () => {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const shuffled = [...shows].sort(() => rand() - 0.5);
        const picks = shuffled.slice(0, count);
        for (const s of picks) {
            const slug = `${s.date}-${s.programId}`;
            const m = await addFixture(slug, s.url, s.date!);
            console.log(`  + ${slug}  (${m.segments.length} segments)`);
        }
    });

program.parseAsync().catch((err) => {
    console.error(err);
    process.exit(1);
});
