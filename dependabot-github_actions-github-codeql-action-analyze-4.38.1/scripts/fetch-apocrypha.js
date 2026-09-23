#!/usr/bin/env node
// scripts/fetch-apocrypha.js
// Fetches apocryphal/deuterocanonical books for WEB and KJV from bible-api.com
// and formats each book as { chapter: { verse: text } } matching the structure
// used by all other book files in this repo.
//
// Output:
//   translations/WEB-Apocrypha/{BookName}.json
//   translations/KJV-Apocrypha/{BookName}.json
//
// Books are written to staging folders so you can review before merging
// into the main translation folders. To merge:
//   1. Copy files into translations/WEB/ or translations/KJV/
//   2. Update info.json: set "canon" to "catholic" or add a custom canon
//      entry in scripts/canon-registry.json
//   3. Push — the workflow regenerates meta.json automatically
//
// Usage:
//   node scripts/fetch-apocrypha.js          # fetch both WEB and KJV
//   node scripts/fetch-apocrypha.js WEB      # fetch WEB only
//   node scripts/fetch-apocrypha.js KJV      # fetch KJV only
//
// Requires Node 18+ (built-in fetch).

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Rate limit: bible-api.com allows roughly 1 req/sec safely.
const DELAY_MS = 1200;

// ─── Book definitions ────────────────────────────────────────────────────────
// Each entry: { name, apiName, chapters }
// name     = filename used in the repo (BookName.json)
// apiName  = query string sent to bible-api.com
// chapters = expected chapter count (used to detect partial/missing responses)

const WEB_APOCRYPHA = [
    { name: 'Tobit',                 apiName: 'Tobit',               chapters: 14 },
    { name: 'Judith',                apiName: 'Judith',              chapters: 16 },
    { name: 'Wisdom of Solomon',     apiName: 'Wisdom of Solomon',   chapters: 19 },
    { name: 'Sirach',                apiName: 'Sirach',              chapters: 51 },
    { name: 'Baruch',                apiName: 'Baruch',              chapters: 6  },
    { name: 'Letter of Jeremiah',    apiName: 'Letter of Jeremiah',  chapters: 1  },
    { name: '1 Maccabees',           apiName: '1 Maccabees',         chapters: 16 },
    { name: '2 Maccabees',           apiName: '2 Maccabees',         chapters: 15 },
    { name: 'Prayer of Manasseh',    apiName: 'Prayer of Manasseh',  chapters: 1  },
    { name: 'Psalm 151',             apiName: 'Psalm 151',           chapters: 1  },
    { name: '1 Esdras',              apiName: '1 Esdras',            chapters: 9  },
    { name: '2 Esdras',              apiName: '2 Esdras',            chapters: 16 },
    { name: '3 Maccabees',           apiName: '3 Maccabees',         chapters: 7  },
    { name: '4 Maccabees',           apiName: '4 Maccabees',         chapters: 18 },
];

// KJV 1611 Apocrypha. Includes the Daniel additions and Rest of Esther
// as standalone books, matching their placement in the 1611 printing.
const KJV_APOCRYPHA = [
    { name: '1 Esdras',                    apiName: '1 Esdras',                    chapters: 9  },
    { name: '2 Esdras',                    apiName: '2 Esdras',                    chapters: 16 },
    { name: 'Tobit',                       apiName: 'Tobit',                       chapters: 14 },
    { name: 'Judith',                      apiName: 'Judith',                      chapters: 16 },
    { name: 'Rest of Esther',              apiName: 'Rest of Esther',              chapters: 1  },
    { name: 'Wisdom of Solomon',           apiName: 'Wisdom of Solomon',           chapters: 19 },
    { name: 'Sirach',                      apiName: 'Sirach',                      chapters: 51 },
    { name: 'Baruch',                      apiName: 'Baruch',                      chapters: 6  },
    { name: 'Letter of Jeremiah',          apiName: 'Letter of Jeremiah',          chapters: 1  },
    { name: 'Song of the Three Children',  apiName: 'Song of the Three Children',  chapters: 1  },
    { name: 'Susanna',                     apiName: 'Susanna',                     chapters: 1  },
    { name: 'Bel and the Dragon',          apiName: 'Bel and the Dragon',          chapters: 1  },
    { name: 'Prayer of Manasseh',          apiName: 'Prayer of Manasseh',          chapters: 1  },
    { name: '1 Maccabees',                 apiName: '1 Maccabees',                 chapters: 16 },
    { name: '2 Maccabees',                 apiName: '2 Maccabees',                 chapters: 15 },
];

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchChapter(apiName, chapter, translation) {
    const query = encodeURIComponent(`${apiName} ${chapter}`);
    const url = `https://bible-api.com/${query}?translation=${translation}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.verses || data.verses.length === 0) return null;
    const verses = {};
    for (const v of data.verses) {
        verses[String(v.verse)] = v.text.trim();
    }
    return verses;
}

async function fetchBook(book, translation) {
    const bookData = {};
    let available = true;

    for (let ch = 1; ch <= book.chapters; ch++) {
        try {
            const verses = await fetchChapter(book.apiName, ch, translation);
            if (!verses) {
                available = false;
                break;
            }
            bookData[String(ch)] = verses;
            process.stdout.write(`    chapter ${ch}/${book.chapters}\r`);
        } catch (err) {
            console.error(`\n    [ERROR] ${book.name} ch.${ch}: ${err.message}`);
            available = false;
            break;
        }
        await sleep(DELAY_MS);
    }

    return available ? bookData : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function fetchSet(books, translation, outSubdir) {
    const outDir = join(ROOT, 'translations', outSubdir);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    console.log(`\n── ${translation} Apocrypha → translations/${outSubdir}/`);

    const skipped = [];

    for (const book of books) {
        process.stdout.write(`  Fetching ${book.name} (${book.chapters} ch)...\n`);
        const data = await fetchBook(book, translation.toLowerCase());

        if (!data) {
            skipped.push(book.name);
            console.log(`  [SKIP] ${book.name} — not available via bible-api.com for ${translation}`);
            continue;
        }

        const outPath = join(outDir, `${book.name}.json`);
        // lgtm[js/http-to-file-access] -- intentional data pipeline: fetches public domain Bible text from known API
        writeFileSync(outPath, JSON.stringify(data) + '\n');
        console.log(`  [OK]   ${book.name}`);
    }

    if (skipped.length) {
        console.log(`\n  Not available via bible-api.com (${translation}):`);
        for (const s of skipped) console.log(`    - ${s}`);
        console.log(`\n  Fallback source for missing books:`);
        if (translation === 'WEB') {
            console.log(`    https://ebible.org/Scriptures/eng-web_readaloud.zip`);
            console.log(`    Full WEB text in USFM format including all apocryphal books.`);
        } else {
            console.log(`    https://ebible.org/Scriptures/eng-kjv_readaloud.zip`);
            console.log(`    Full 1611 KJV text in USFM format including the Apocrypha.`);
        }
        console.log(`    A USFM parser will be needed for those files.`);
    }

    return skipped;
}

async function main() {
    const target = (process.argv[2] || '').toUpperCase();
    const runWEB = !target || target === 'WEB';
    const runKJV = !target || target === 'KJV';

    if (target && target !== 'WEB' && target !== 'KJV') {
        console.error(`Unknown target "${process.argv[2]}". Use WEB, KJV, or omit for both.`);
        process.exit(1);
    }

    const allSkipped = {};

    if (runWEB) {
        allSkipped.WEB = await fetchSet(WEB_APOCRYPHA, 'WEB', 'WEB-Apocrypha');
    }
    if (runKJV) {
        allSkipped.KJV = await fetchSet(KJV_APOCRYPHA, 'KJV', 'KJV-Apocrypha');
    }

    console.log('\n── Complete.\n');

    const totalSkipped = Object.values(allSkipped).flat();
    if (totalSkipped.length === 0) {
        console.log('All books fetched successfully.');
    } else {
        console.log('Summary of books requiring manual fetch from eBible.org USFM source:');
        for (const [t, skipped] of Object.entries(allSkipped)) {
            if (skipped.length) {
                console.log(`  ${t}: ${skipped.join(', ')}`);
            }
        }
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
