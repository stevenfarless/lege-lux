#!/usr/bin/env node
// scripts/generate-meta.js
// Generates translations/{ID}/meta.json for every translation folder.
// Reads info.json for metadata and canon, looks up testament assignments
// from canon-registry.json, then counts chapters from canonical book files.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TRANSLATIONS_DIR = join(ROOT, 'translations');
const REGISTRY_PATH = join(__dirname, 'canon-registry.json');

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));

function buildTestamentLookup(canonKey) {
    const canon = registry.canons[canonKey];
    if (!canon) return null;
    const lookup = {};
    for (const section of canon.sections) {
        for (const book of section.books) {
            lookup[book] = section.testament;
        }
    }
    return lookup;
}

function buildCanonOrder(canonKey) {
    const canon = registry.canons[canonKey];
    if (!canon) return [];
    return canon.sections.flatMap(section => section.books);
}

function processTranslation(translationId) {
    const dir = join(TRANSLATIONS_DIR, translationId);
    const infoPath = join(dir, 'info.json');

    let info;
    try {
        info = JSON.parse(readFileSync(infoPath, 'utf8'));
    } catch {
        console.warn(`  [SKIP] ${translationId}: missing or invalid info.json`);
        return;
    }

    const canonKey = info.canon;
    const testamentLookup = buildTestamentLookup(canonKey);
    const canonOrder = buildCanonOrder(canonKey);

    if (!testamentLookup) {
        console.warn(`  [WARN] ${translationId}: unknown canon "${canonKey}" in registry — skipping`);
        return;
    }

    const canonicalFiles = new Map(
        readdirSync(dir)
            .filter(file => file.endsWith('.json'))
            .map(file => [basename(file, '.json'), file])
    );

    const ordered = [];
    for (const bookName of canonOrder) {
        const file = canonicalFiles.get(bookName);
        if (!file) continue;

        try {
            const content = JSON.parse(readFileSync(join(dir, file), 'utf8'));
            ordered.push({
                name: bookName,
                testament: testamentLookup[bookName],
                chapters: Object.keys(content).length
            });
        } catch {
            console.warn(`  [WARN] ${translationId}/${file}: could not parse — skipping book`);
        }
    }

    const meta = { info, books: ordered };
    const outPath = join(dir, 'meta.json');
    writeFileSync(outPath, JSON.stringify(meta, null, 2) + '\n');
    console.log(`  [OK]   ${translationId}: ${ordered.length} books written to meta.json`);
}

const target = process.argv[2];
let translationIds;

if (target) {
    translationIds = [target];
} else {
    translationIds = readdirSync(TRANSLATIONS_DIR).filter(name => {
        const full = join(TRANSLATIONS_DIR, name);
        return statSync(full).isDirectory();
    });
}

console.log(`Generating meta.json for: ${translationIds.join(', ')}\n`);
for (const id of translationIds) {
    processTranslation(id);
}
console.log('\nDone.');
