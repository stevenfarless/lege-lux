// bible-api.js
import { FIREBASE_DB_URL } from './firebase-config.js';
import { normaliseBookAlias } from './book-aliases.js';
import {
    idbGetBook, idbPutBook,
    idbGetSearchIndex, idbPutSearchIndex,
    idbIsDownloaded, idbMarkDownloaded,
    idbDeleteTranslation,
} from './translation-store.js';

const FIREBASE_TRANSLATIONS_ENABLED = false;

const PAGE_SIZE = 100;
const SEARCH_CONCURRENCY = 5;
const PREFIX_MATCH_MIN_LENGTH = 6;
const TEXT_MATCH_NONE = 0;
const TEXT_MATCH_PREFIX = 1;
const TEXT_MATCH_EXACT = 2;

export const PRECACHED_TRANSLATIONS = new Set([
    "BSB", "KJV",
]);

export const LOCAL_TRANSLATIONS = new Set([
    "ASV", "BLB", "BSB", "BST", "CSB", "ESV", "ISV", "KJV", "LEB",
    "MEV", "MSB", "NASB95", "NET", "NIV", "NKJV", "NLT", "NRSVUE", "WEB",
]);

const REPO_TRANSLATIONS = new Set([
    "ASV", "BLB", "BSB", "BST", "CSB", "ESV", "ISV", "KJV", "LEB",
    "MEV", "MSB", "NASB95", "NET", "NIV", "NKJV", "NLT", "NRSVUE", "WEB",
]);

const BOOK_LOAD_ORDER = [
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
    'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
    '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
    'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs',
    'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
    'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
    'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
    'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke',
    'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians',
    'Galatians', 'Ephesians', 'Philippians', 'Colossians',
    '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy',
    'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter',
    '1 John', '2 John', '3 John', 'Jude', 'Revelation',
    // Deuterocanon
    'Additions to Esther', 'Bel and the Dragon', 'Prayer of Manasseh', 'Letter of Jeremiah',
    'Prayer of Azariah', 'Wisdom of Solomon', '2 Maccabees', '4 Maccabees',
    '3 Maccabees', '1 Maccabees', 'Psalm 151', '1 Esdras',
    '2 Esdras', 'Susanna', 'Sirach', 'Baruch',
    'Judith', 'Tobit',
];

const REFERENCE_PATTERN_RE = /^(?:\*|(?:[1-3]\s+)?[A-Za-z][A-Za-z ]*?)\s+(?:\*|\d+)(?::(?:\*|\d+))?$/i;

// Canonical position map for cross-book sort.
const BOOK_ORDER_INDEX = new Map(BOOK_LOAD_ORDER.map((b, i) => [b, i]));

const BOOK_LOAD_ORDER_BY_LENGTH = [...BOOK_LOAD_ORDER].sort((a, b) => b.length - a.length);

const BOOK_KEY_ALIASES = {
    'Song of Solomon': 'Song of Solomon',
};


function _resolveBookKey(bible, canonicalName) {
    if (bible[canonicalName] !== undefined) return canonicalName;
    const alias = BOOK_KEY_ALIASES[canonicalName];
    if (alias !== undefined && bible[alias] !== undefined) return alias;
    return null;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

function _buildWordRegex(q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i');
}

function _escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _looksLikeReferencePattern(query) {
    const normalized = String(query || '').trim().replace(/\s+/g, ' ');
    return REFERENCE_PATTERN_RE.test(normalized);
}

function _buildReferenceRegex(query) {
    const normalized = String(query || '').trim().replace(/\s+/g, ' ');
    const match = normalized.match(/^(.*?)\s+(\*|\d+)(?::(\*|\d+))?$/);
    if (!match) return null;

    const rawBook = match[1].trim();
    const rawChapter = match[2];
    const rawVerse = match[3] ?? null;

    const bookPart = rawBook === '*'
        ? '.+?'
        : _escapeRegex(normaliseBookAlias(rawBook)).replace(/\\\*/g, '.+?');
    const chapterPart = rawChapter === '*' ? '\\d+' : _escapeRegex(rawChapter);
    const versePart = rawVerse === null ? null : (rawVerse === '*' ? '\\d+' : _escapeRegex(rawVerse));

    return new RegExp(
        `^${bookPart}\\s+${chapterPart}${versePart !== null ? `:${versePart}` : ''}$`,
        'i'
    );
}

function _buildWildcardTextRegex(query) {
    const parts = String(query || '').trim().split('*').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) return null;

    const tokenPatterns = parts.map((part) => {
        const tokens = part.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
        if (tokens.length === 0) return '';
        return tokens.map((token) => {
            const stem = _normalizeTerm(token.toLowerCase());
            const escapedStem = _escapeRegex(stem);
            return `\\b${escapedStem}\\w*`;
        }).join('\\s+');
    }).filter(Boolean);

    if (tokenPatterns.length === 0) return null;
    return new RegExp(tokenPatterns.join('(?:\\W+\\w+){0,40}?\\W+'), 'i');
}

function _classifySearchQuery(query) {
    const normalized = String(query || '').trim();
    if (!normalized) return 'empty';
    if (_looksLikeReferencePattern(normalized)) return 'reference';
    if (normalized.includes('*')) return 'wildcardText';
    return 'text';
}

/**
 * Builds a stem-expanded regex for `q` so that a search for "love" also
 * matches "loves", "loved", "loveth", "loving", etc. — matching the
 * _normalizeTerm behaviour used elsewhere.
 *
 * Strategy: stem the query term, then match any token that starts with that
 * stem and is bounded by a word boundary on both sides.
 */
function _tokenizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}']+/u)
        .filter(Boolean);
}

function _buildSearchToken(token) {
    return {
        raw: token,
        normalized: _normalizeTerm(token),
    };
}

function _termMatchRank(term, token) {
    if (token.raw === term.raw || token.normalized === term.normalized) return TEXT_MATCH_EXACT;
    if (term.raw.length >= PREFIX_MATCH_MIN_LENGTH && token.raw.startsWith(term.raw)) return TEXT_MATCH_PREFIX;
    if (term.normalized.length >= PREFIX_MATCH_MIN_LENGTH && token.normalized.startsWith(term.normalized)) return TEXT_MATCH_PREFIX;
    return TEXT_MATCH_NONE;
}

function _buildTextMatcher(query) {
    const terms = _tokenizeSearchText(query)
        .map((term) => _buildSearchToken(term))
        .filter((term) => term.raw || term.normalized);

    return (value) => {
        const tokens = _tokenizeSearchText(value)
            .map((token) => _buildSearchToken(token))
            .filter((token) => token.raw || token.normalized);
        let overallRank = TEXT_MATCH_EXACT;

        for (const term of terms) {
            let termRank = TEXT_MATCH_NONE;

            for (const token of tokens) {
                const rank = _termMatchRank(term, token);
                if (rank > termRank) termRank = rank;
                if (termRank === TEXT_MATCH_EXACT) break;
            }

            if (termRank === TEXT_MATCH_NONE) return TEXT_MATCH_NONE;
            if (termRank < overallRank) overallRank = termRank;
        }

        return overallRank;
    };
}


export async function loadTranslationIndex() {
    if (!FIREBASE_TRANSLATIONS_ENABLED) return [];
    const url = `${FIREBASE_DB_URL}/translationIndex.json`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') return Object.values(data);
        return [];
    } catch (err) {
        console.error('BibleApi: failed to load translation index from RTDB', err);
        return [];
    }
}


function _normalizeTerm(word) {
    let w = word.toLowerCase();

    if (w.length > 3) {
        w = w.replace(/[’']s$/, '');
    }

    if (w.length < 3) return w;

    if (w.endsWith('est') && w.length > 5) {
        return _normalizeTerm(w.slice(0, -2));
    }
    if (w.endsWith('eth') && w.length > 4) {
        return _normalizeTerm(w.slice(0, -3));
    }
    if (w.endsWith('ing') && w.length > 5) {
        return _normalizeTerm(w.slice(0, -3));
    }
    if (w.endsWith('ed') && w.length > 4 && !'aeiou'.includes(w[w.length - 3])) {
        return w.slice(0, -2);
    }
    if (w.endsWith('es') && w.length > 4 && !'aeiou'.includes(w[w.length - 3])) {
        return w.slice(0, -2);
    }
    if (w.endsWith('e') && w.length >= 4 && !'aeiou'.includes(w[w.length - 2])) {
        return w.slice(0, -1);
    }
    if (w.endsWith('s') && w.length > 4 && !'aeiou'.includes(w[w.length - 2])) {
        return w.slice(0, -1);
    }
    return w;
}

export class BibleApi {
    constructor(translation = 'ESV') {
        this._translation = translation;
        this._bookCache = new Map();
        this._shallowIndexCache = new Map();
        this._searchIndexCache = new Map();
        this._localBookFetchPromise = new Map();
        this._searchIndexFetchPromise = new Map();
        this._translationBookLists = new Map();
    }

    setTranslation(translation) {
        this._translation = translation;
    }

    get translation() {
        return this._translation;
    }

    setBookList(translation, bookNames) {
        if (!translation || !Array.isArray(bookNames) || bookNames.length === 0) return;
        this._translationBookLists.set(translation, bookNames);
    }

    async _getShallowIndex(translation) {
        if (!FIREBASE_TRANSLATIONS_ENABLED) return new Map();
        if (this._shallowIndexCache.has(translation)) {
            return this._shallowIndexCache.get(translation);
        }
        const index = new Map();
        try {
            const url = `${FIREBASE_DB_URL}/translations/${encodeURIComponent(translation)}.json?shallow=true`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && typeof data === 'object') {
                    for (const key of Object.keys(data)) {
                        index.set(key.toLowerCase(), key);
                    }
                }
            }
        } catch (err) {
            console.warn(`BibleApi: shallow index fetch failed for ${translation}`, err);
        }
        this._shallowIndexCache.set(translation, index);
        return index;
    }

    async _loadBook(translation, book) {
        const cacheKey = `${translation}/${book}`;
        if (this._bookCache.has(cacheKey)) {
            return this._bookCache.get(cacheKey);
        }

        if (REPO_TRANSLATIONS.has(translation)) {
            if (this._localBookFetchPromise.has(cacheKey)) {
                return this._localBookFetchPromise.get(cacheKey);
            }

            const fetchBookFromNetwork = async (filename) => {
                const url = `./translations/${translation}/${encodeURIComponent(filename)}.json`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            };

            const promise = (async () => {
                try {
                    if (!PRECACHED_TRANSLATIONS.has(translation)) {
                        const cached = await idbGetBook(translation, book);
                        if (cached !== null) {
                            this._bookCache.set(cacheKey, cached);
                            return cached;
                        }
                        this._bookCache.delete(cacheKey);
                        return null;
                    }

                    const filename = BOOK_KEY_ALIASES[book] ?? book;
                    const data = await fetchBookFromNetwork(filename);
                    this._bookCache.set(cacheKey, data);
                    if (filename !== book) {
                        this._bookCache.set(`${translation}/${filename}`, data);
                    }
                    return data;
                } catch (err) {
                    console.error(`BibleApi: failed to load ${translation}/${this._sanitizeForLog(book)}`, err);
                    this._bookCache.delete(cacheKey);
                    return null;
                } finally {
                    this._localBookFetchPromise.delete(cacheKey);
                }
            })();

            this._localBookFetchPromise.set(cacheKey, promise);
            return promise;
        }

        if (!FIREBASE_TRANSLATIONS_ENABLED) {
            console.warn(`BibleApi: Firebase translations disabled — cannot load ${translation}/${this._sanitizeForLog(book)}`);
            return null;
        }

        const fetchNode = async (nodeKey) => {
            const url = `${FIREBASE_DB_URL}/translations/${encodeURIComponent(translation)}/${encodeURIComponent(nodeKey)}.json`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
            const data = await res.json();
            return (data && typeof data === 'object') ? data : null;
        };

        try {
            let bookData = await fetchNode(book);
            if (bookData === null) {
                const alias = BOOK_KEY_ALIASES[book];
                if (alias) bookData = await fetchNode(alias);
            }
            if (bookData === null) {
                const shallowIndex = await this._getShallowIndex(translation);
                const exactKey = shallowIndex.get(book.toLowerCase());
                if (exactKey && exactKey !== book) bookData = await fetchNode(exactKey);
            }
            if (bookData !== null) {
                this._bookCache.set(cacheKey, bookData);
            } else {
                this._bookCache.delete(cacheKey);
            }
            return bookData;
        } catch (err) {
            console.error(`BibleApi: failed to load ${translation}/${book} from RTDB`, err);
            this._bookCache.delete(cacheKey);
            return null;
        }
    }

    async _loadSearchIndex(translation) {
        if (this._searchIndexCache.has(translation)) {
            return this._searchIndexCache.get(translation);
        }

        if (this._searchIndexFetchPromise.has(translation)) {
            return this._searchIndexFetchPromise.get(translation);
        }

        const promise = (async () => {
            try {
                const isRepo = REPO_TRANSLATIONS.has(translation);
                if (!isRepo && !FIREBASE_TRANSLATIONS_ENABLED) {
                    this._searchIndexCache.set(translation, null);
                    return null;
                }

                if (isRepo && !PRECACHED_TRANSLATIONS.has(translation)) {
                    const installed = await idbIsDownloaded(translation);
                    if (!installed) {
                        this._searchIndexCache.set(translation, null);
                        return null;
                    }

                    const cached = await idbGetSearchIndex(translation);
                    if (cached !== null && typeof cached === 'object' && Object.keys(cached).length > 0) {
                        this._searchIndexCache.set(translation, cached);
                        return cached;
                    }
                }

                const url = isRepo
                    ? `./translations/${translation}/${translation}_search_index.json`
                    : `${FIREBASE_DB_URL}/searchIndex/${encodeURIComponent(translation)}.json`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const index = (data && typeof data === 'object' && Object.keys(data).length > 0) ? data : null;
                this._searchIndexCache.set(translation, index);
                if (isRepo && !PRECACHED_TRANSLATIONS.has(translation) && index !== null) {
                    idbPutSearchIndex(translation, index).catch((error) => {
                        console.warn(`BibleApi: failed to persist search index for ${translation}`, error);
                    });
                }
                return index;
            } catch (err) {
                console.warn(`BibleApi: search index unavailable for ${translation}, falling back to book fetches`, err);
                this._searchIndexCache.set(translation, null);
                return null;
            } finally {
                this._searchIndexFetchPromise.delete(translation);
            }
        })();

        this._searchIndexFetchPromise.set(translation, promise);
        return promise;
    }

    async downloadTranslation(translation, bookList, onProgress) {
        const books = bookList?.length ? bookList : BOOK_LOAD_ORDER;
        const total = books.length;
        const failedBooks = [];
        let done = 0;

        const fetchAndStore = async (book) => {
            const cacheKey = `${translation}/${book}`;

            try {
                let data = this._bookCache.get(cacheKey) ?? null;
                if (data === null) {
                    const filename = BOOK_KEY_ALIASES[book] ?? book;
                    const url =
                        `./translations/${encodeURIComponent(translation)}/` +
                        `${encodeURIComponent(filename)}.json`;
                    const response = await fetch(url);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    data = await response.json();
                    if (!data || typeof data !== 'object') {
                        throw new Error('Invalid book data');
                    }
                    this._bookCache.set(cacheKey, data);
                }

                const stored = await idbPutBook(translation, book, data);
                if (!stored) throw new Error('IndexedDB write failed');
            } catch (error) {
                failedBooks.push(book);
                console.error(
                    `Translation download failed for ${translation}/${book}`,
                    error
                );
            } finally {
                done++;
                onProgress?.(done, total);
            }
        };

        const batchSize = 4;
        for (let index = 0; index < books.length; index += batchSize) {
            await Promise.all(
                books.slice(index, index + batchSize).map(fetchAndStore)
            );
        }

        if (failedBooks.length > 0) {
            await idbDeleteTranslation(translation);
            this.evictTranslation(translation);
            throw new Error(
                `Failed to download ${failedBooks.length} books: ` +
                failedBooks.join(', ')
            );
        }

        try {
            const url =
                `./translations/${encodeURIComponent(translation)}/` +
                `${encodeURIComponent(translation)}_search_index.json`;
            const response = await fetch(url);

            if (response.ok) {
                const index = await response.json();
                await idbPutSearchIndex(translation, index);
                this._searchIndexCache.set(translation, index);
            }
        } catch (error) {
            console.warn(`Search index unavailable for ${translation}`, error);
        }

        const marked = await idbMarkDownloaded(translation);
        if (!marked) {
            await idbDeleteTranslation(translation);
            this.evictTranslation(translation);
            throw new Error(`Could not mark ${translation} installed`);
        }

        if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'TRANSLATION_INSTALLED',
                translation,
            });
        }
    }

    evictTranslation(translation) {
        const prefix = `${translation}/`;
        for (const key of [...this._bookCache.keys()]) {
            if (key.startsWith(prefix)) this._bookCache.delete(key);
        }
        this._searchIndexCache.delete(translation);
        this._shallowIndexCache.delete(translation);
        this._translationBookLists.delete(translation);
    }

    _parseReference(reference) {
        const raw = String(reference || '').trim();
        const str = normaliseBookAlias(raw);

        for (const name of BOOK_LOAD_ORDER_BY_LENGTH) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(
                '^(' + escaped + ')\\s+(\\d+)(?:[:\\s](\\d+)(?:-(\\d+))?)?$',
                'i'
            );
            const m = str.match(re);
            if (m) {
                return {
                    book: name,
                    chapter: parseInt(m[2], 10),
                    verseStart: m[3] ? parseInt(m[3], 10) : null,
                    verseEnd: m[4] ? parseInt(m[4], 10) : null,
                };
            }
        }

        const m = str.match(/^((?:[1-3]\s+)?[A-Za-z ]+?)\s+(\d+)(?:[:\s](\d+)(?:-(\d+))?)?$/);
        if (!m) return null;
        return {
            book: m[1].trim(),
            chapter: parseInt(m[2], 10),
            verseStart: m[3] ? parseInt(m[3], 10) : null,
            verseEnd: m[4] ? parseInt(m[4], 10) : null,
        };
    }

    _sanitizeForLog(value) {
        return String(value ?? '').replace(/[\r\n]/g, '');
    }

    _buildPassageHtml(chapter, chapterData, verseStart, verseEnd, scaffoldEvents = [], showHeadings = true) {
        const prologueHtml = (chapterData['0'] && verseStart === null)
            ? `<div class="passage-prologue">${escapeHtml(chapterData['0'])}</div>`
            : '';

        const verseNums = Object.keys(chapterData)
            .filter((v) => /^[1-9]\d*(?:[a-z]+|-[1-9]\d*[a-z]*)?$/i.test(v))
            .map((v) => /^\d+$/.test(v) ? Number(v) : v)
            .sort(compareVerseLabels)
            .filter((v) => {
                const base = parseInt(v, 10);
                if (verseStart !== null && base < verseStart) return false;
                if (verseEnd !== null && base > verseEnd) return false;
                return true;
            });

        if (!verseNums.length) return null;

        const hasScaffold = scaffoldEvents.length > 0;

        if (!hasScaffold) {
            const spans = [];
            for (const v of verseNums) {
                const text = chapterData[String(v)] || '';
                spans.push(
                    `<span class="verse" data-verse="${v}" id="v${chapter}-${v}">` +
                    `<sup class="verse-num">${v}</sup>` +
                    `<span class="verse-text">${escapeHtml(text)}</span> ` +
                    `</span>`
                );
            }
            return prologueHtml + `<p class="passage-para">${spans.join('')}</p>`;
        }

        const eventMap = new Map();
        for (const evt of scaffoldEvents) {
            if (!eventMap.has(evt.v)) eventMap.set(evt.v, []);
            eventMap.get(evt.v).push(evt);
        }

        const headingEvents = scaffoldEvents
            .filter((evt) => evt.type === 'heading' && evt.v !== undefined && evt.v !== null)
            .sort((a, b) => compareVerseLabels(a.v, b.v));

        const headingRangeEndByStart = new Map();

        for (let i = 0; i < headingEvents.length; i++) {
            const startVerse = headingEvents[i].v;
            const nextHeadingVerse = headingEvents[i + 1]?.v ?? null;
            const versesInRange = verseNums.filter((v) => (
                compareVerseLabels(v, startVerse) >= 0 &&
                (nextHeadingVerse === null || compareVerseLabels(v, nextHeadingVerse) < 0)
            ));
            const endVerse = versesInRange[versesInRange.length - 1];

            if (endVerse !== undefined) {
                headingRangeEndByStart.set(String(startVerse), endVerse);
            }
        }

        const parts = [];
        let inParagraph = false;

        const openP = () => { parts.push('<p class="passage-para">'); inParagraph = true; };
        const closeP = () => { if (inParagraph) { parts.push('</p>'); inParagraph = false; } };

        for (const v of verseNums) {
            const eventsHere = eventMap.get(v) || [];
            for (const evt of eventsHere) {
                if (evt.type === 'heading') {
                    if (showHeadings) {
                        closeP();

                    const endVerse = headingRangeEndByStart.get(String(evt.v));
                    const rangeAttrs = endVerse !== undefined
                        ? ` role="button" tabindex="0" data-start-verse="${evt.v}" data-end-verse="${endVerse}" aria-label="Select section: ${escapeHtml(evt.text)}"`
                        : '';

                    parts.push(`<h3 class="pericope-heading"${rangeAttrs}>${escapeHtml(evt.text)}</h3>`);
}
                } else if (evt.type === 'para_break') {
                    closeP();
                }
            }
            if (!inParagraph) openP();
            const text = chapterData[String(v)] || '';
            parts.push(
                `<span class="verse" data-verse="${v}" id="v${chapter}-${v}">` +
                `<sup class="verse-num">${v}</sup>` +
                `<span class="verse-text">${escapeHtml(text)}</span> ` +
                `</span>`
            );
        }
        closeP();
        return prologueHtml + parts.join('');
    }

    async fetchPassage(reference, scaffoldEvents = [], showHeadings = true) {
        const parsed = this._parseReference(reference);
        if (!parsed) {
            console.error(`BibleApi: cannot parse reference "${this._sanitizeForLog(reference)}"`);
            return null;
        }

        const { book, chapter, verseStart, verseEnd } = parsed;
        const bookData = await this._loadBook(this._translation, book);
        if (!bookData) {
            console.error(`BibleApi: book "${this._sanitizeForLog(book)}" not found in ${this._translation}`);
            return null;
        }

        const resolvedKey = _resolveBookKey(bookData, book);
        const resolvedBookData = resolvedKey ? bookData[resolvedKey] ?? bookData : bookData;

        const chapterData = resolvedBookData[String(chapter)];
        if (!chapterData) {
            console.error(`BibleApi: chapter ${chapter} not found in "${this._sanitizeForLog(book)}"`);
            return null;
        }

        const normalizedVerseEnd = verseStart !== null ? (verseEnd ?? verseStart) : null;
        const html = this._buildPassageHtml(chapter, chapterData, verseStart, normalizedVerseEnd, scaffoldEvents, showHeadings);
        if (!html) return null;

        const canonical = verseStart !== null
            ? `${book} ${chapter}:${verseStart}${normalizedVerseEnd !== verseStart ? `-${normalizedVerseEnd}` : ''}`
            : `${book} ${chapter}`;

        return { passages: [html], canonical };
    }

    _compareSearchMatches(a, b) {
        const rankDelta = (b.searchRank ?? TEXT_MATCH_EXACT) - (a.searchRank ?? TEXT_MATCH_EXACT);
        if (rankDelta !== 0) return rankDelta;
        const bookDelta = (BOOK_ORDER_INDEX.get(a.book) ?? 999) - (BOOK_ORDER_INDEX.get(b.book) ?? 999);
        if (bookDelta !== 0) return bookDelta;
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.verse - b.verse;
    }

    _scanSearchIndex(searchIndex, matcher, mode = 'text') {
        const matched = [];
        for (const ref of Object.keys(searchIndex)) {
            const target = mode === 'reference' ? ref : searchIndex[ref];
            const matchRank = matcher(target);
            if (!matchRank) continue;
            const colonIdx = ref.lastIndexOf(':');
            const spaceIdx = ref.lastIndexOf(' ', colonIdx);
            matched.push({
                ref,
                book: ref.slice(0, spaceIdx),
                chapter: Number(ref.slice(spaceIdx + 1, colonIdx)),
                verse: Number(ref.slice(colonIdx + 1)),
                searchRank: typeof matchRank === 'number' ? matchRank : TEXT_MATCH_EXACT,
            });
        }
        matched.sort((a, b) => this._compareSearchMatches(a, b));
        return matched;
    }

    async searchPassages(query, onBatchResults = null) {
        const q = String(query || '').trim();
        if (!q) return { results: [], total_results: 0, page_size: PAGE_SIZE };

        const normalizedQ = q.toLowerCase();
        const mode = _classifySearchQuery(q);
        const queryTerms = normalizedQ.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
        const normalizedQueryTerms = queryTerms.map((term) => _normalizeTerm(term));
        const textMatcher = mode === 'text' ? _buildTextMatcher(normalizedQ) : null;
        const wildcardTextRegex = mode === 'wildcardText' ? _buildWildcardTextRegex(q) : null;
        const referenceRegex = mode === 'reference' ? _buildReferenceRegex(q) : null;

        const matcher = mode === 'reference'
            ? (value) => referenceRegex?.test(value) ?? false
            : mode === 'wildcardText'
                ? (value) => wildcardTextRegex?.test(String(value || '')) ?? false
                : (value) => textMatcher?.(value) ?? false;

        const scanMode = mode === 'reference' ? 'reference' : 'text';

        const debugSearch = (engine, matchedRefs) => {
            const topRefs = matchedRefs.slice(0, 5);
            const hasJohn316 = matchedRefs.includes('John 3:16');
            console.debug('BibleApi.searchPassages', {
                engine,
                translation: this._translation,
                query: normalizedQ,
                mode,
                queryTerms,
                normalizedQueryTerms,
                totalHits: matchedRefs.length,
                hasJohn316,
                topRefs,
            });
        };

        const searchIndex = await this._loadSearchIndex(this._translation);

        if (searchIndex !== null) {
            const matches = this._scanSearchIndex(searchIndex, matcher, scanMode);
            debugSearch(`${mode}Scan`, matches.map((m) => m.ref));

            const uniqueBooks = [...new Set(matches.map((m) => m.book))];
            const bookDataMap = new Map();

            for (let i = 0; i < uniqueBooks.length; i += SEARCH_CONCURRENCY) {
                const chunk = uniqueBooks.slice(i, i + SEARCH_CONCURRENCY);
                const entries = await Promise.all(
                    chunk.map(async (book) => [book, await this._loadBook(this._translation, book)])
                );
                for (const [book, data] of entries) bookDataMap.set(book, data);

                if (typeof onBatchResults === 'function') {
                    const partial = [];
                    for (const { ref, book, chapter, verse } of matches) {
                        if (!bookDataMap.has(book)) continue;
                        const bookData = bookDataMap.get(book);
                        const resolvedKey = bookData ? _resolveBookKey(bookData, book) : null;
                        const resolvedBookData = resolvedKey ? bookData[resolvedKey] ?? bookData : bookData;
                        const originalText = resolvedBookData?.[String(chapter)]?.[String(verse)];
                        const text = originalText != null ? String(originalText) : searchIndex[ref];
                        partial.push({ reference: ref, content: text, book, chapter, verse, text });
                    }
                    if (partial.length > 0) onBatchResults(partial);
                }
            }

            const results = [];
            for (const { ref, book, chapter, verse } of matches) {
                const bookData = bookDataMap.get(book);
                const resolvedKey = bookData ? _resolveBookKey(bookData, book) : null;
                const resolvedBookData = resolvedKey ? bookData[resolvedKey] ?? bookData : bookData;
                const originalText = resolvedBookData?.[String(chapter)]?.[String(verse)];
                const text = originalText != null ? String(originalText) : searchIndex[ref];
                results.push({ reference: ref, content: text, book, chapter, verse, text });
            }

            return { results, total_results: results.length, page_size: PAGE_SIZE };
        }

        console.debug('BibleApi.searchPassages', {
            engine: 'bookScan',
            translation: this._translation,
            query: normalizedQ,
            mode,
            queryTerms,
            normalizedQueryTerms,
            searchIndexAvailable: false,
        });
        const bookList = this._translationBookLists.get(this._translation) ?? BOOK_LOAD_ORDER;
        const allResults = [];

        for (let i = 0; i < bookList.length; i += SEARCH_CONCURRENCY) {
            const batch = bookList.slice(i, i + SEARCH_CONCURRENCY);
            const bookDataList = await Promise.all(
                batch.map((book) => this._loadBook(this._translation, book))
            );
            const batchResults = [];
            for (let j = 0; j < batch.length; j++) {
                const book = batch[j];
                const bookData = bookDataList[j];
                if (!bookData) continue;
                const resolvedKey = _resolveBookKey(bookData, book);
                const resolvedBookData = resolvedKey ? bookData[resolvedKey] ?? bookData : bookData;
                const chapterEntries = Object.entries(resolvedBookData)
                    .sort((a, b) => Number(a[0]) - Number(b[0]));
                for (const [chapterStr, chapterData] of chapterEntries) {
                    if (!chapterData || typeof chapterData !== 'object') continue;
                    const verseEntries = Object.entries(chapterData)
                        .filter(([verseStr]) => Number(verseStr) > 0)
                        .sort((a, b) => Number(a[0]) - Number(b[0]));
                    for (const [verseStr, text] of verseEntries) {
                        const verseText = String(text || '');
                        const reference = `${book} ${chapterStr}:${verseStr}`;
                        const matchRank = mode === 'reference'
                            ? matcher(reference)
                            : matcher(verseText);
                        if (!matchRank) continue;
                        batchResults.push({
                            reference,
                            content: verseText,
                            book,
                            chapter: Number(chapterStr),
                            verse: Number(verseStr),
                            text: verseText,
                            searchRank: typeof matchRank === 'number' ? matchRank : TEXT_MATCH_EXACT,
                        });
                    }
                }
            }
            if (batchResults.length > 0) {
                allResults.push(...batchResults);
                if (typeof onBatchResults === 'function') {
                    onBatchResults(batchResults.map(({ searchRank, ...result }) => result));
                }
            }
        }

        allResults.sort((a, b) => this._compareSearchMatches(a, b));
        const results = allResults.map(({ searchRank, ...result }) => result);
        return { results, total_results: results.length, page_size: PAGE_SIZE };
    }

    async searchPassagesAllTranslations(query, knownRefs) {
        const q = String(query || '').trim();
        if (q.length < 3) return [];

        const activeTranslation = this._translation;
        const candidates = [...LOCAL_TRANSLATIONS].filter((t) => t !== activeTranslation);

        if (candidates.length === 0) return [];

        const mode = _classifySearchQuery(q);
        const textMatcher = mode === 'text' ? _buildTextMatcher(q.toLowerCase()) : null;
        const wildcardTextRegex = mode === 'wildcardText' ? _buildWildcardTextRegex(q) : null;
        const referenceRegex = mode === 'reference' ? _buildReferenceRegex(q) : null;
        const matcher = mode === 'reference'
            ? (value) => referenceRegex?.test(value) ?? false
            : mode === 'wildcardText'
                ? (value) => wildcardTextRegex?.test(String(value || '')) ?? false
                : (value) => textMatcher?.(value) ?? false;
        const scanMode = mode === 'reference' ? 'reference' : 'text';

        const seen = new Set(
            [...knownRefs].map((ref) => `${activeTranslation}::${ref}`)
        );
        const supplemental = [];

        await Promise.all(candidates.map(async (translation) => {
            const searchIndex = await this._loadSearchIndex(translation);

            if (searchIndex !== null) {
                const matches = this._scanSearchIndex(searchIndex, matcher, scanMode);

                const filteredMatches = [];
                for (const m of matches) {
                    const seenKey = `${translation}::${m.ref}`;
                    if (!seen.has(seenKey)) filteredMatches.push({ ...m, seenKey });
                }

                const uniqueBooks = [...new Set(filteredMatches.map((m) => m.book))];
                const bookDataMap = new Map(
                    await Promise.all(
                        uniqueBooks.map(async (book) => [book, await this._loadBook(translation, book)])
                    )
                );

                for (const { ref, seenKey, book, chapter, verse } of filteredMatches) {
                    if (seen.has(seenKey)) continue;
                    seen.add(seenKey);
                    const bookData = bookDataMap.get(book);
                    const resolvedKey = bookData ? _resolveBookKey(bookData, book) : null;
                    const resolvedBookData = resolvedKey ? bookData[resolvedKey] ?? bookData : bookData;
                    const originalText = resolvedBookData?.[String(chapter)]?.[String(verse)];
                    const text = originalText != null ? String(originalText) : searchIndex[ref];
                    supplemental.push({
                        reference: ref,
                        content: text,
                        book,
                        chapter,
                        verse,
                        text,
                        sourceTranslation: translation,
                    });
                }
                return;
            }

            for (const book of BOOK_LOAD_ORDER) {
                const bookData = this._bookCache.get(`${translation}/${book}`)
                    ?? this._bookCache.get(`${translation}/${BOOK_KEY_ALIASES[book]}`);
                if (!bookData) continue;
                const resolvedKey = _resolveBookKey(bookData, book);
                const resolvedBookData = resolvedKey ? bookData[resolvedKey] ?? bookData : bookData;
                for (const [chapterStr, chapterData] of Object.entries(resolvedBookData)) {
                    if (!chapterData || typeof chapterData !== 'object') continue;
                    for (const [verseStr, text] of Object.entries(chapterData)) {
                        if (Number(verseStr) <= 0) continue;
                        const verseText = String(text || '');
                        const ref = `${book} ${chapterStr}:${verseStr}`;
                        const isMatch = mode === 'reference'
                            ? matcher(ref)
                            : matcher(verseText);
                        if (!isMatch) continue;
                        const seenKey = `${translation}::${ref}`;
                        if (seen.has(seenKey)) continue;
                        seen.add(seenKey);
                        supplemental.push({
                            reference: ref,
                            content: verseText,
                            book,
                            chapter: Number(chapterStr),
                            verse: Number(verseStr),
                            text: verseText,
                            sourceTranslation: translation,
                        });
                    }
                }
            }
        }));

        supplemental.sort((a, b) => {
            const bi = (BOOK_ORDER_INDEX.get(a.book) ?? 999) - (BOOK_ORDER_INDEX.get(b.book) ?? 999);
            if (bi !== 0) return bi;
            if (a.chapter !== b.chapter) return a.chapter - b.chapter;
            if (a.verse !== b.verse) return a.verse - b.verse;
            return String(a.sourceTranslation || '').localeCompare(String(b.sourceTranslation || ''));
        });

        return supplemental;
    }
}
