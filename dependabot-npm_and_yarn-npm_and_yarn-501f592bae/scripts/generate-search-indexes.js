#!/usr/bin/env node
/**
 * generate-search-indexes.js
 *
 * Reads each translation bundle from ./bundles/{T}_bundle.json and writes
 * ./translations/{T}/{T}_search_index.json as an inverted search index.
 *
 * Usage:
 *   node scripts/generate-search-indexes.js [TRANSLATION...]
 *
 * With no arguments, processes all translations found in ./bundles/.
 * With one or more translation codes, processes only those.
 *
 * Examples:
 *   node scripts/generate-search-indexes.js
 *   node scripts/generate-search-indexes.js KJV BSB
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLES_DIR = join(ROOT, 'bundles');
const TRANSLATIONS_DIR = join(ROOT, 'translations');
const SEARCH_INDEX_VERSION = 2;

function normalizeTerm(word) {
    let w = String(word || '').toLowerCase();

    if (w.length > 3) {
        w = w.replace(/[’']s$/, '');
    }

    if (w.length < 3) return w;

    if (w.endsWith('est') && w.length > 5) return normalizeTerm(w.slice(0, -2));
    if (w.endsWith('eth') && w.length > 4) return normalizeTerm(w.slice(0, -3));
    if (w.endsWith('ing') && w.length > 5) return normalizeTerm(w.slice(0, -3));
    if (w.endsWith('ed') && w.length > 4 && !'aeiou'.includes(w[w.length - 3])) return w.slice(0, -2);
    if (w.endsWith('es') && w.length > 4 && !'aeiou'.includes(w[w.length - 3])) return w.slice(0, -2);
    if (w.endsWith('e') && w.length >= 4 && !'aeiou'.includes(w[w.length - 2])) return w.slice(0, -1);
    if (w.endsWith('s') && w.length > 4 && !'aeiou'.includes(w[w.length - 2])) return w.slice(0, -1);
    return w;
}

function tokenizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}']+/u)
        .filter(Boolean);
}

function addPosting(postings, term, verseId) {
    if (!term) return;
    if (!postings[term]) postings[term] = [];
    postings[term].push(verseId);
}

function addVerse(index, reference, text) {
    const verseId = index.refs.length;
    const lowerText = String(text || '').toLowerCase();
    index.refs.push(reference);
    index.texts.push(lowerText);

    const terms = new Set();
    for (const raw of tokenizeSearchText(lowerText)) {
        terms.add(raw);
        terms.add(normalizeTerm(raw));
    }
    for (const term of terms) addPosting(index.postings, term, verseId);
}

function buildIndex(bundle) {
    const index = {
        version: SEARCH_INDEX_VERSION,
        refs: [],
        texts: [],
        postings: {},
    };
    const books = bundle.books ?? {};
    for (const [book, chapters] of Object.entries(books)) {
        if (typeof chapters !== 'object' || chapters === null) continue;
        for (const [ch, verses] of Object.entries(chapters)) {
            if (typeof verses !== 'object' || verses === null) continue;
            for (const [v, text] of Object.entries(verses)) {
                if (typeof text !== 'string') continue;
                if (!/^\d+$/.test(v) || Number(v) <= 0) continue;
                addVerse(index, `${book} ${ch}:${v}`, text);
            }
        }
    }
    return index;
}

function availableTranslations() {
    return readdirSync(BUNDLES_DIR)
        .filter(f => f.endsWith('_bundle.json'))
        .map(f => f.replace('_bundle.json', ''));
}

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : availableTranslations();

for (const t of targets) {
    const bundlePath = join(BUNDLES_DIR, `${t}_bundle.json`);
    let bundle;
    try {
        bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    } catch (e) {
        console.error(`SKIP ${t}: cannot read bundle (${e.message})`);
        continue;
    }

    const index = buildIndex(bundle);
    const outPath = join(TRANSLATIONS_DIR, t, `${t}_search_index.json`);
    const serialized = JSON.stringify(index);
    writeFileSync(outPath, serialized);
    const kb = Math.round(Buffer.byteLength(serialized) / 1024);
    console.log(`${t}: ${index.refs.length.toLocaleString()} verses  ${kb.toLocaleString()} KB  -> ${outPath}`);
}
