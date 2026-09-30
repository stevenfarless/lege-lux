#!/usr/bin/env node
// flatten-translations.js
// Rewrites per-book JSON files that use the nested shape:
//   { "Info": {...}, "Genesis": { "1": { "1": "text" } } }
// to the flat canonical shape:
//   { "1": { "1": "text" }, "2": {...} }
//
// Files already in the flat shape are left untouched.
// Run once locally, then commit the result.
//
// Usage:
//   node scripts/flatten-translations.js
//   node scripts/flatten-translations.js ESV NIV   (specific translations only)

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRANSLATIONS_DIR = join(__dirname, '..', 'translations');

function isNested(raw) {
    // Nested shape has at least one key that is a book name (not a digit string)
    // and no numeric chapter keys at the top level.
    const keys = Object.keys(raw);
    if (keys.length === 0) return false;
    const hasNumericKey = keys.some(k => /^\d+$/.test(k));
    if (hasNumericKey) return false;
    // Has at least one non-numeric key whose value is an object (book data)
    return keys.some(k => k !== 'Info' && typeof raw[k] === 'object' && !Array.isArray(raw[k]));
}

function flattenFile(filePath) {
    let raw;
    try {
        raw = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`  SKIP (parse error): ${filePath}: ${e.message}`);
        return false;
    }

    if (!isNested(raw)) return false; // already flat

    // Find the book data key (not "Info")
    const bookKey = Object.keys(raw).find(k => k !== 'Info' && typeof raw[k] === 'object');
    if (!bookKey) {
        console.warn(`  SKIP (no book key found): ${filePath}`);
        return false;
    }

    const flat = raw[bookKey];
    writeFileSync(filePath, JSON.stringify(flat, null, 2), 'utf8');
    return true;
}

function getTranslations(args) {
    if (args.length) return args;
    return readdirSync(TRANSLATIONS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
}

const args = process.argv.slice(2);
const translations = getTranslations(args);
let totalFlattened = 0;
let totalSkipped = 0;

for (const t of translations) {
    const dir = join(TRANSLATIONS_DIR, t);
    if (!existsSync(dir)) {
        console.warn(`Translation directory not found: ${dir}`);
        continue;
    }

    const files = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'meta.json');
    let tFlattened = 0;

    for (const file of files) {
        const filePath = join(dir, file);
        const changed = flattenFile(filePath);
        if (changed) tFlattened++;
    }

    if (tFlattened > 0) {
        console.log(`✅  ${t}: flattened ${tFlattened} file(s)`);
        totalFlattened += tFlattened;
    } else {
        console.log(`—   ${t}: already flat, no changes`);
        totalSkipped++;
    }
}

console.log(`\nDone. ${totalFlattened} file(s) rewritten, ${totalSkipped} translation(s) already flat.`);
