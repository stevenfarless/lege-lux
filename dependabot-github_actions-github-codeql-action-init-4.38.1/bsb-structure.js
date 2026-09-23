// Passage structure loader.
// BSB/WEB scaffolds serve ordinary translations; BST uses structure generated
// directly from the Brenton USFM so headings and paragraph breaks stay aligned
// with native Septuagint versification.

import { PROTESTANT_BOOKS } from './bible-structure.js';

const _cache = new Map();
const _fetchPromise = new Map();

function sanitizeForLog(value) {
    return String(value).replace(/[\r\n]/g, '');
}

function structureUrl(bookName, translation) {
    if (translation === 'BST') {
        return `./translations/BST/BST_structure/${encodeURIComponent(bookName)}.json`;
    }

    const folder = PROTESTANT_BOOKS.has(bookName)
        ? 'BSB/BSB_structure'
        : 'WEB/WEB_structure';
    return `./translations/${folder}/${encodeURIComponent(bookName)}.json`;
}

function verseSortKey(value) {
    const match = String(value).match(/^(\d+)([a-z]*)(?:-(\d+)([a-z]*))?$/i);
    if (!match) return [Number.MAX_SAFE_INTEGER, '', Number.MAX_SAFE_INTEGER, ''];
    return [
        Number(match[1]),
        match[2] || '',
        match[3] ? Number(match[3]) : Number(match[1]),
        match[4] || '',
    ];
}

function compareVerseLabels(a, b) {
    const av = verseSortKey(a);
    const bv = verseSortKey(b);
    return av[0] - bv[0]
        || av[1].localeCompare(bv[1])
        || av[2] - bv[2]
        || av[3].localeCompare(bv[3]);
}

export async function loadStructure(bookName, translation = null) {
    const url = structureUrl(bookName, translation);
    if (_cache.has(url)) return _cache.get(url);
    if (_fetchPromise.has(url)) return _fetchPromise.get(url);

    const promise = (async () => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const events = Array.isArray(data) ? data : [];
            _cache.set(url, events);
            return events;
        } catch (err) {
            console.warn(
                'passage-structure: could not load scaffold for "%s" (%s)',
                sanitizeForLog(bookName),
                sanitizeForLog(translation || 'default'),
                err
            );
            _cache.set(url, []);
            return [];
        } finally {
            _fetchPromise.delete(url);
        }
    })();

    _fetchPromise.set(url, promise);
    return promise;
}

export function eventsForChapter(events, chapter) {
    return events
        .filter((event) => Number(event.ch) === Number(chapter))
        .sort((a, b) => compareVerseLabels(a.v, b.v));
}
