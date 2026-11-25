#!/usr/bin/env node
// scripts/build-structure.js
//
// Parses BSB USFM files and emits one scaffold JSON per book into
// translations/BSB/BSB_structure/{Book}.json
//
// Usage:
//   node scripts/build-structure.js --usfm-dir /path/to/usfm/files
//
// Output files are committed into the repo on the json-ver branch.
// Running the script again produces identical output (idempotent).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'translations', 'BSB', 'BSB_structure');

// Primary map: mixed-case abbreviations as used in prefixed USFM filenames.
const USFM_TO_BOOK = {
    Gen:  'Genesis',
    Exo:  'Exodus',
    Lev:  'Leviticus',
    Num:  'Numbers',
    Deu:  'Deuteronomy',
    Jos:  'Joshua',
    Jdg:  'Judges',
    Rut:  'Ruth',
    '1Sa': '1 Samuel',
    '2Sa': '2 Samuel',
    '1Ki': '1 Kings',
    '2Ki': '2 Kings',
    '1Ch': '1 Chronicles',
    '2Ch': '2 Chronicles',
    Ezr:  'Ezra',
    Neh:  'Nehemiah',
    Est:  'Esther',
    Job:  'Job',
    Psa:  'Psalm',
    Pro:  'Proverbs',
    Ecc:  'Ecclesiastes',
    Sng:  'Song of Solomon',
    Isa:  'Isaiah',
    Jer:  'Jeremiah',
    Lam:  'Lamentations',
    Ezk:  'Ezekiel',
    Dan:  'Daniel',
    Hos:  'Hosea',
    Jol:  'Joel',
    Amo:  'Amos',
    Oba:  'Obadiah',
    Jon:  'Jonah',
    Mic:  'Micah',
    Nam:  'Nahum',
    Hab:  'Habakkuk',
    Zep:  'Zephaniah',
    Hag:  'Haggai',
    Zec:  'Zechariah',
    Mal:  'Malachi',
    Mat:  'Matthew',
    Mrk:  'Mark',
    Luk:  'Luke',
    Jhn:  'John',
    Act:  'Acts',
    Rom:  'Romans',
    '1Co': '1 Corinthians',
    '2Co': '2 Corinthians',
    Gal:  'Galatians',
    Eph:  'Ephesians',
    Php:  'Philippians',
    Col:  'Colossians',
    '1Th': '1 Thessalonians',
    '2Th': '2 Thessalonians',
    '1Ti': '1 Timothy',
    '2Ti': '2 Timothy',
    Tit:  'Titus',
    Phm:  'Philemon',
    Heb:  'Hebrews',
    Jas:  'James',
    '1Pe': '1 Peter',
    '2Pe': '2 Peter',
    '1Jn': '1 John',
    '2Jn': '2 John',
    '3Jn': '3 John',
    Jud:  'Jude',
    Rev:  'Revelation',
};

// Alternate abbreviations used by some USFM sets.
const USFM_ALT = {
    Exod:   'Exodus',
    Deut:   'Deuteronomy',
    Josh:   'Joshua',
    Judg:   'Judges',
    Ps:     'Psalm',
    Song:   'Song of Solomon',
    Ezek:   'Ezekiel',
    Zeph:   'Zephaniah',
    Zech:   'Zechariah',
    Matt:   'Matthew',
    John:   'John',
    '1Cor': '1 Corinthians',
    '2Cor': '2 Corinthians',
    Phil:   'Philippians',
    '1Thes':'1 Thessalonians',
    '2Thes':'2 Thessalonians',
    '1Tim': '1 Timothy',
    '2Tim': '2 Timothy',
    Phlm:   'Philemon',
    '1Pet': '1 Peter',
    '2Pet': '2 Peter',
    Jude:   'Jude',
};

// Build a combined map that also accepts all-caps variants (GEN, EXO, 1CH, PSA...).
// The bereanbible.com zip uses plain uppercase filenames like GEN.usfm.
const ABBREV_MAP = { ...USFM_TO_BOOK, ...USFM_ALT };
for (const [key, val] of Object.entries(ABBREV_MAP)) {
    const upper = key.toUpperCase();
    if (!ABBREV_MAP[upper]) ABBREV_MAP[upper] = val;
}

function resolveBookName(usfmAbbrev) {
    // Try as-is first, then uppercase fallback.
    return ABBREV_MAP[usfmAbbrev] || ABBREV_MAP[usfmAbbrev.toUpperCase()] || null;
}

/**
 * Parses a single USFM file and returns an array of scaffold events.
 * Each event: { ch, v, type: 'heading'|'para_break', text? }
 * Events fire BEFORE the verse they reference.
 */
function parseUsfm(content) {
    const events = [];
    let ch = 0;
    let pendingHeading = null;
    let pendingBreak = false;

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const chMatch = line.match(/^\\c\s+(\d+)/);
        if (chMatch) {
            ch = parseInt(chMatch[1], 10);
            pendingHeading = null;
            pendingBreak = false;
            continue;
        }

        const sMatch = line.match(/^\\s\d?\s+(.*)/);
        if (sMatch) {
            const text = sMatch[1].replace(/\\[a-z0-9*]+/g, '').replace(/\s+/g, ' ').trim();
            if (text) pendingHeading = text;
            continue;
        }

        if (/^\\b(?:\s|$)/.test(line) || /^\\p(?:\s|$)/.test(line)) {
            pendingBreak = true;
            continue;
        }

        const vMatch = line.match(/^\\v\s+(\d+)/);
        if (vMatch) {
            const v = parseInt(vMatch[1], 10);
            if (pendingHeading !== null) {
                events.push({ ch, v, type: 'heading', text: pendingHeading });
                pendingHeading = null;
            }
            if (pendingBreak) {
                events.push({ ch, v, type: 'para_break' });
                pendingBreak = false;
            }
        }
    }

    events.sort((a, b) => {
        if (a.ch !== b.ch) return a.ch - b.ch;
        if (a.v !== b.v) return a.v - b.v;
        if (a.type === 'heading' && b.type !== 'heading') return -1;
        if (b.type === 'heading' && a.type !== 'heading') return 1;
        return 0;
    });

    return events;
}

/**
 * Extracts the book abbreviation from a USFM filename.
 *
 * Supported patterns (in order):
 *   1. BSB_Bible_JHN.usfm  or  BSBBibleJHN.usfm  → JHN
 *   2. 44JHNBSB.usfm  (repo format: NN + Abbrev + BSB)  → JHN
 *   3. JHN.usfm  (plain abbreviation)  → JHN
 */
function extractAbbrevFromFilename(filename) {
    // Pattern 1: BSB_Bible_ or BSBBible prefix
    let m = filename.match(/(?:BSB_Bible_|BSBBible)([A-Za-z0-9]+)\.usfm$/i);
    if (m) return m[1];

    // Pattern 2: numeric prefix + abbreviation + BSB suffix (e.g. 44JHNBSB.usfm)
    // Strips leading digits and trailing "BSB" to isolate the 3-letter abbreviation.
    m = filename.match(/^\d+([A-Za-z0-9]+?)BSB\.usfm$/i);
    if (m) return m[1];

    // Pattern 3: plain abbreviation filename (e.g. JHN.usfm, GEN.usfm)
    m = filename.match(/^([A-Za-z0-9]+)\.usfm$/i);
    if (m) return m[1];

    return null;
}

function parseArgs() {
    const args = process.argv.slice(2);
    const idx = args.indexOf('--usfm-dir');
    if (idx === -1 || !args[idx + 1]) {
        console.error('Usage: node scripts/build-structure.js --usfm-dir <path>');
        process.exit(1);
    }
    return { usfmDir: args[idx + 1] };
}

async function main() {
    const { usfmDir } = parseArgs();

    if (!fs.existsSync(usfmDir)) {
        console.error(`USFM directory not found: ${usfmDir}`);
        process.exit(1);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const files = fs.readdirSync(usfmDir).filter(f => f.toLowerCase().endsWith('.usfm'));

    if (!files.length) {
        console.error(`No .usfm files found in: ${usfmDir}`);
        process.exit(1);
    }

    let written = 0;
    let skipped = 0;

    for (const file of files) {
        const abbrev = extractAbbrevFromFilename(file);
        if (!abbrev) {
            console.warn(`  SKIP (cannot parse filename): ${file}`);
            skipped++;
            continue;
        }

        const bookName = resolveBookName(abbrev);
        if (!bookName) {
            console.warn(`  SKIP (unknown abbreviation "${abbrev}"): ${file}`);
            skipped++;
            continue;
        }

        const content = fs.readFileSync(path.join(usfmDir, file), 'utf8');
        const events = parseUsfm(content);

        const outPath = path.join(OUT_DIR, `${bookName}.json`);
        fs.writeFileSync(outPath, JSON.stringify(events, null, 2), 'utf8');
        console.log(`  OK  ${bookName} (${events.length} events) -> ${path.relative(REPO_ROOT, outPath)}`);
        written++;
    }

    console.log(`\nDone. ${written} written, ${skipped} skipped.`);
}

main();
