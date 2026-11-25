#!/usr/bin/env node
// dev-scripts/build-cross-refs.js
//
// Reads cross_references.txt (tab-separated: from_verse, to_verse, votes)
// and writes data/cross_references.json keyed by canonical verse address.
//
// Output format:
//   { "Genesis.1.1": [{ "v": "John.1.1", "r": 12 }, ...], ... }
//
// Keys use full canonical book names to match what bible-api.js expects.
// Each array is sorted by vote count (r) descending.
//
// Usage: node dev-scripts/build-cross-refs.js

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Same alias table as book-aliases.js — duplicated here so the script runs
// standalone without an ESM host that can resolve the app module.
const BOOK_ALIASES = {
    'Gen': 'Genesis', 'Gn': 'Genesis',
    'Ex': 'Exodus', 'Exo': 'Exodus', 'Exod': 'Exodus',
    'Lev': 'Leviticus', 'Lv': 'Leviticus',
    'Num': 'Numbers', 'Nm': 'Numbers', 'Nu': 'Numbers',
    'Deut': 'Deuteronomy', 'Deu': 'Deuteronomy', 'Dt': 'Deuteronomy',
    'Josh': 'Joshua', 'Jos': 'Joshua',
    'Judg': 'Judges', 'Jdg': 'Judges', 'Jg': 'Judges',
    'Rth': 'Ruth',
    '1Sam': '1 Samuel', '1Sa': '1 Samuel',
    '2Sam': '2 Samuel', '2Sa': '2 Samuel',
    '1Kgs': '1 Kings', '1Ki': '1 Kings', '1Kin': '1 Kings',
    '2Kgs': '2 Kings', '2Ki': '2 Kings', '2Kin': '2 Kings',
    '1Chr': '1 Chronicles', '1Ch': '1 Chronicles', '1Chron': '1 Chronicles',
    '2Chr': '2 Chronicles', '2Ch': '2 Chronicles', '2Chron': '2 Chronicles',
    'Ezr': 'Ezra',
    'Neh': 'Nehemiah',
    'Est': 'Esther', 'Esth': 'Esther',
    'Jb': 'Job',
    'Ps': 'Psalm', 'Psa': 'Psalm', 'Psalms': 'Psalm',
    'Prov': 'Proverbs', 'Pro': 'Proverbs', 'Prv': 'Proverbs',
    'Eccl': 'Ecclesiastes', 'Ecc': 'Ecclesiastes', 'Qoh': 'Ecclesiastes',
    'Song': 'Song of Solomon', 'SOS': 'Song of Solomon', 'SS': 'Song of Solomon',
    'Cant': 'Song of Solomon',
    'Isa': 'Isaiah', 'Is': 'Isaiah',
    'Jer': 'Jeremiah',
    'Lam': 'Lamentations',
    'Ezek': 'Ezekiel', 'Eze': 'Ezekiel', 'Ezk': 'Ezekiel',
    'Dan': 'Daniel', 'Dn': 'Daniel',
    'Hos': 'Hosea',
    'Jl': 'Joel',
    'Am': 'Amos',
    'Obad': 'Obadiah', 'Ob': 'Obadiah',
    'Jon': 'Jonah',
    'Mic': 'Micah',
    'Nah': 'Nahum',
    'Hab': 'Habakkuk',
    'Zeph': 'Zephaniah', 'Zep': 'Zephaniah',
    'Hag': 'Haggai',
    'Zech': 'Zechariah', 'Zec': 'Zechariah',
    'Mal': 'Malachi',
    'Matt': 'Matthew', 'Mt': 'Matthew',
    'Mk': 'Mark', 'Mrk': 'Mark',
    'Lk': 'Luke', 'Luk': 'Luke',
    'Jn': 'John', 'Jhn': 'John',
    'Act': 'Acts',
    'Rom': 'Romans', 'Rm': 'Romans',
    '1Cor': '1 Corinthians', '1Co': '1 Corinthians',
    '2Cor': '2 Corinthians', '2Co': '2 Corinthians',
    'Gal': 'Galatians',
    'Eph': 'Ephesians',
    'Phil': 'Philippians', 'Php': 'Philippians',
    'Col': 'Colossians',
    '1Thess': '1 Thessalonians', '1Th': '1 Thessalonians', '1Thes': '1 Thessalonians',
    '2Thess': '2 Thessalonians', '2Th': '2 Thessalonians', '2Thes': '2 Thessalonians',
    '1Tim': '1 Timothy', '1Ti': '1 Timothy',
    '2Tim': '2 Timothy', '2Ti': '2 Timothy',
    'Tit': 'Titus',
    'Phlm': 'Philemon', 'Phm': 'Philemon',
    'Heb': 'Hebrews',
    'Jas': 'James', 'Jm': 'James',
    '1Pet': '1 Peter', '1Pe': '1 Peter',
    '2Pet': '2 Peter', '2Pe': '2 Peter',
    '1Jn': '1 John', '1Jo': '1 John',
    '2Jn': '2 John', '2Jo': '2 John',
    '3Jn': '3 John', '3Jo': '3 John',
    'Jud': 'Jude',
    'Rev': 'Revelation', 'Rv': 'Revelation',
};

// Parses a dotted verse address like "Gen.1.1" or "1Sam.3.4-6" into a
// canonical key "Genesis.1.1". Verse ranges use the start verse only.
function toCanonicalKey(raw) {
    const dotIdx = raw.indexOf('.');
    if (dotIdx === -1) return null;

    const bookAbbr = raw.slice(0, dotIdx);
    const rest = raw.slice(dotIdx + 1); // "chapter.verse" or "chapter.verse-endVerse"

    const canonical = BOOK_ALIASES[bookAbbr] ?? bookAbbr;

    // Strip end-of-range on verse (e.g. "1-3" → "1")
    const parts = rest.split('.');
    if (parts.length < 2) return null;
    const chapter = parts[0];
    const verse = parts[1].split('-')[0];

    return `${canonical}.${chapter}.${verse}`;
}

const srcPath = resolve(ROOT, 'cross_references.txt');
const outDir  = resolve(ROOT, 'data');
const outPath = resolve(outDir, 'cross_references.json');

console.log('Reading', srcPath);
const raw = readFileSync(srcPath, 'utf8');
const lines = raw.split('\n');

const index = {};
let skipped = 0;
let total = 0;

for (const line of lines) {
    const trimmed = line.trim();
    // Skip header and blank lines
    if (!trimmed || trimmed.startsWith('From Verse')) continue;

    const [fromRaw, toRaw, votesRaw] = trimmed.split('\t');
    if (!fromRaw || !toRaw) { skipped++; continue; }

    const from  = toCanonicalKey(fromRaw.trim());
    const to    = toCanonicalKey(toRaw.trim());
    const votes = parseInt(votesRaw?.trim() ?? '0', 10) || 0;

    if (!from || !to) { skipped++; continue; }

    if (!index[from]) index[from] = [];
    index[from].push({ v: to, r: votes });
    total++;
}

// Sort each verse's refs by vote count descending
for (const key of Object.keys(index)) {
    index[key].sort((a, b) => b.r - a.r);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(index), 'utf8');

const verseCount = Object.keys(index).length;
console.log(`Done. ${total} refs across ${verseCount} verses → data/cross_references.json`);
if (skipped > 0) console.warn(`Skipped ${skipped} malformed lines.`);
