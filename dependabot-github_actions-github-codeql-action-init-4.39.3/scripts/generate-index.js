#!/usr/bin/env node
// scripts/generate-index.js
// Regenerates translations/index.json from each translation's info.json.
// The index is what the app fetches on load to populate the translation
// selector. It contains display fields only — no book data.
//
// Run: node scripts/generate-index.js

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TRANSLATIONS_DIR = join(ROOT, 'translations');
const INDEX_PATH = join(TRANSLATIONS_DIR, 'index.json');

// Fields included in the index (kept small — fetched on every app load).
const INDEX_FIELDS = ['id', 'label', 'abbreviation', 'language', 'textDirection', 'year', 'canon', 'philosophy', 'copyright'];

const translationDirs = readdirSync(TRANSLATIONS_DIR).filter(name => {
    const full = join(TRANSLATIONS_DIR, name);
    return statSync(full).isDirectory();
});

const translations = [];

for (const id of translationDirs) {
    const infoPath = join(TRANSLATIONS_DIR, id, 'info.json');
    let info;
    try {
        info = JSON.parse(readFileSync(infoPath, 'utf8'));
    } catch {
        console.warn(`  [SKIP] ${id}: missing or invalid info.json`);
        continue;
    }

    const entry = {};
    for (const field of INDEX_FIELDS) {
        if (info[field] !== undefined) entry[field] = info[field];
    }
    translations.push(entry);
    console.log(`  [OK]   ${id}`);
}

// Sort alphabetically by id for stable output.
translations.sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(INDEX_PATH, JSON.stringify({ translations }, null, 2) + '\n');
console.log(`\nWrote ${translations.length} entries to translations/index.json`);
