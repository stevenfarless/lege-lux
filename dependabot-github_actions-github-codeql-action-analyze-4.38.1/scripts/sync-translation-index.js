#!/usr/bin/env node
// scripts/sync-translation-index.js
//
// Reads every subdirectory of translations/ that contains a meta.json,
// sorts them alphabetically by id, and writes translations/index.json.
//
// Usage:
//   node scripts/sync-translation-index.js
//
// Run this any time a translation folder is added or its meta.json changes.
// Commit the resulting translations/index.json alongside the new translation.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const translationsDir = join(__dirname, '..', 'translations');
const outputPath = join(translationsDir, 'index.json');

const entries = readdirSync(translationsDir)
    .filter(name => {
        const full = join(translationsDir, name);
        return statSync(full).isDirectory();
    })
    .flatMap(name => {
        const metaPath = join(translationsDir, name, 'meta.json');
        try {
            const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
            if (!meta.id || !meta.label) {
                console.warn(`Skipping ${name}: meta.json missing id or label`);
                return [];
            }
            return [meta];
        } catch {
            console.warn(`Skipping ${name}: no valid meta.json`);
            return [];
        }
    })
    .sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(outputPath, JSON.stringify({ translations: entries }, null, 2) + '\n', 'utf8');
console.log(`Wrote ${entries.length} translation(s) to translations/index.json`);
entries.forEach(t => console.log(`  ${t.id}: ${t.label}`));
