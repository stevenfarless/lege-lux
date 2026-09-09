import { BibleApi, LOCAL_TRANSLATIONS } from './bible-api.js';
import { normaliseBookAlias } from './book-aliases.js';

const PAGE_SIZE = 100;
const PREFIX_MATCH_MIN_LENGTH = 6;
const SEARCH_INDEX_VERSION = 2;
const TEXT_MATCH_NONE = 0;
const TEXT_MATCH_PREFIX = 1;
const TEXT_MATCH_EXACT = 2;
const INSTALLED = Symbol.for('legeLux.invertedSearchIndexInstalled');
const REFERENCE_PATTERN_RE = /^(?:\*|(?:[1-3]\s+)?[A-Za-z][A-Za-z ]*?)\s+(?:\*|\d+)(?::(?:\*|\d+))?$/i;
const BOOK_LOAD_ORDER = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation', 'Additions to Esther', 'Bel and the Dragon', 'Prayer of Manasseh', 'Letter of Jeremiah', 'Prayer of Azariah', 'Wisdom of Solomon', '2 Maccabees', '4 Maccabees', '3 Maccabees', '1 Maccabees', 'Psalm 151', '1 Esdras', '2 Esdras', 'Susanna', 'Sirach', 'Baruch', 'Judith', 'Tobit'];
const BOOK_ORDER_INDEX = new Map(BOOK_LOAD_ORDER.map((book, index) => [book, index]));
const BOOK_KEY_ALIASES = { 'Song of Solomon': 'Song of Solomon' };
const normalizedIndexCache = new WeakMap();

function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function normalizeTerm(word) {
    let w = String(word || '').toLowerCase();
    if (w.length > 3) w = w.replace(/[’']s$/, '');
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
function tokenizeSearchText(value) { return String(value || '').toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean); }
function buildSearchToken(token) { return { raw: token, normalized: normalizeTerm(token) }; }
function termMatchRank(term, token) {
    if (token.raw === term.raw || token.normalized === term.normalized) return TEXT_MATCH_EXACT;
    if (term.raw.length >= PREFIX_MATCH_MIN_LENGTH && token.raw.startsWith(term.raw)) return TEXT_MATCH_PREFIX;
    if (term.normalized.length >= PREFIX_MATCH_MIN_LENGTH && token.normalized.startsWith(term.normalized)) return TEXT_MATCH_PREFIX;
    return TEXT_MATCH_NONE;
}
function buildTextMatcher(query) {
    const terms = tokenizeSearchText(query).map(buildSearchToken).filter((term) => term.raw || term.normalized);
    return (value) => {
        const tokens = tokenizeSearchText(value).map(buildSearchToken).filter((token) => token.raw || token.normalized);
        let overallRank = TEXT_MATCH_EXACT;
        for (const term of terms) {
            let termRank = TEXT_MATCH_NONE;
            for (const token of tokens) {
                const rank = termMatchRank(term, token);
                if (rank > termRank) termRank = rank;
                if (termRank === TEXT_MATCH_EXACT) break;
            }
            if (termRank === TEXT_MATCH_NONE) return TEXT_MATCH_NONE;
            if (termRank < overallRank) overallRank = termRank;
        }
        return overallRank;
    };
}
function classifySearchQuery(query) {
    const normalized = String(query || '').trim();
    if (!normalized) return 'empty';
    if (REFERENCE_PATTERN_RE.test(normalized.replace(/\s+/g, ' '))) return 'reference';
    if (normalized.includes('*')) return 'wildcardText';
    return 'text';
}
function buildReferenceRegex(query) {
    const match = String(query || '').trim().replace(/\s+/g, ' ').match(/^(.*?)\s+(\*|\d+)(?::(\*|\d+))?$/);
    if (!match) return null;
    const bookPart = match[1].trim() === '*' ? '.+?' : escapeRegex(normaliseBookAlias(match[1].trim())).replace(/\\\*/g, '.+?');
    const chapterPart = match[2] === '*' ? '\\d+' : escapeRegex(match[2]);
    const versePart = match[3] == null ? null : (match[3] === '*' ? '\\d+' : escapeRegex(match[3]));
    return new RegExp(`^${bookPart}\\s+${chapterPart}${versePart !== null ? `:${versePart}` : ''}$`, 'i');
}
function buildWildcardTextRegex(query) {
    const tokenPatterns = String(query || '').trim().split('*').map((part) => part.trim()).filter(Boolean).map((part) => {
        const tokens = part.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
        return tokens.map((token) => `\\b${escapeRegex(normalizeTerm(token.toLowerCase()))}\\w*`).join('\\s+');
    }).filter(Boolean);
    if (tokenPatterns.length === 0) return null;
    return new RegExp(tokenPatterns.join('(?:\\W+\\w+){0,40}?\\W+'), 'i');
}
function parseIndexedReference(ref) {
    const colonIdx = ref.lastIndexOf(':');
    const spaceIdx = ref.lastIndexOf(' ', colonIdx);
    if (colonIdx === -1 || spaceIdx === -1) return null;
    const chapter = Number(ref.slice(spaceIdx + 1, colonIdx));
    const verse = Number(ref.slice(colonIdx + 1));
    if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
    return { ref, book: ref.slice(0, spaceIdx), chapter, verse };
}
function addPosting(postings, term, verseId) {
    if (!term) return;
    if (!postings[term]) postings[term] = [];
    postings[term].push(verseId);
}
export function buildInvertedSearchIndex(flatIndex) {
    const refs = [];
    const texts = [];
    const postings = {};
    for (const [ref, rawText] of Object.entries(flatIndex || {})) {
        const parsed = parseIndexedReference(ref);
        if (!parsed || parsed.verse <= 0) continue;
        const verseId = refs.length;
        const text = String(rawText || '').toLowerCase();
        refs.push(ref);
        texts.push(text);
        const terms = new Set();
        for (const raw of tokenizeSearchText(text)) {
            terms.add(raw);
            terms.add(normalizeTerm(raw));
        }
        for (const term of terms) addPosting(postings, term, verseId);
    }
    return { version: SEARCH_INDEX_VERSION, refs, texts, postings };
}
export function isInvertedSearchIndex(searchIndex) {
    return searchIndex?.version === SEARCH_INDEX_VERSION && Array.isArray(searchIndex.refs) && Array.isArray(searchIndex.texts) && searchIndex.postings && typeof searchIndex.postings === 'object';
}
export function normalizeSearchIndex(searchIndex) {
    if (!searchIndex || typeof searchIndex !== 'object') return null;
    if (isInvertedSearchIndex(searchIndex)) return searchIndex;
    const cached = normalizedIndexCache.get(searchIndex);
    if (cached) return cached;
    const normalized = buildInvertedSearchIndex(searchIndex);
    normalizedIndexCache.set(searchIndex, normalized);
    return normalized;
}
function idsForPostingTerm(searchIndex, term, target) {
    const ids = searchIndex.postings[term];
    if (!Array.isArray(ids)) return;
    for (const id of ids) target.add(id);
}
function idsForPostingPrefix(searchIndex, prefix, target) {
    if (!prefix || prefix.length < PREFIX_MATCH_MIN_LENGTH) return;
    for (const term of Object.keys(searchIndex.postings)) {
        if (term.startsWith(prefix)) idsForPostingTerm(searchIndex, term, target);
    }
}
function candidateIdsForTerm(searchIndex, term) {
    const ids = new Set();
    idsForPostingTerm(searchIndex, term.raw, ids);
    idsForPostingTerm(searchIndex, term.normalized, ids);
    idsForPostingPrefix(searchIndex, term.raw, ids);
    idsForPostingPrefix(searchIndex, term.normalized, ids);
    return ids;
}
function candidateIdsForTextTerms(searchIndex, rawTerms) {
    const sets = rawTerms.map(buildSearchToken).filter((term) => term.raw || term.normalized).map((term) => candidateIdsForTerm(searchIndex, term));
    if (sets.length === 0) return null;
    sets.sort((a, b) => a.size - b.size);
    const result = new Set(sets[0]);
    for (let i = 1; i < sets.length; i += 1) {
        for (const id of result) if (!sets[i].has(id)) result.delete(id);
        if (result.size === 0) break;
    }
    return result;
}
function compareSearchMatches(a, b) {
    const rankDelta = (b.searchRank ?? TEXT_MATCH_EXACT) - (a.searchRank ?? TEXT_MATCH_EXACT);
    if (rankDelta !== 0) return rankDelta;
    const bookDelta = (BOOK_ORDER_INDEX.get(a.book) ?? 999) - (BOOK_ORDER_INDEX.get(b.book) ?? 999);
    if (bookDelta !== 0) return bookDelta;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
}
export function searchNormalizedIndex(searchIndex, query) {
    const q = String(query || '').trim();
    const normalizedQ = q.toLowerCase();
    const mode = classifySearchQuery(q);
    const queryTerms = tokenizeSearchText(normalizedQ);
    const normalizedQueryTerms = queryTerms.map(normalizeTerm);
    const matches = [];
    if (mode === 'reference') {
        const referenceRegex = buildReferenceRegex(q);
        for (let id = 0; id < searchIndex.refs.length; id += 1) {
            if (!referenceRegex?.test(searchIndex.refs[id])) continue;
            const parsed = parseIndexedReference(searchIndex.refs[id]);
            if (parsed) matches.push({ ...parsed, id, searchRank: TEXT_MATCH_EXACT });
        }
    } else if (mode === 'wildcardText') {
        const wildcardTextRegex = buildWildcardTextRegex(q);
        const candidateIds = candidateIdsForTextTerms(searchIndex, queryTerms) ?? new Set(searchIndex.refs.map((_, id) => id));
        for (const id of candidateIds) {
            if (!wildcardTextRegex?.test(String(searchIndex.texts[id] || ''))) continue;
            const parsed = parseIndexedReference(searchIndex.refs[id]);
            if (parsed) matches.push({ ...parsed, id, searchRank: TEXT_MATCH_EXACT });
        }
    } else {
        const textMatcher = buildTextMatcher(normalizedQ);
        for (const id of candidateIdsForTextTerms(searchIndex, queryTerms) ?? new Set()) {
            const searchRank = textMatcher(searchIndex.texts[id]);
            if (!searchRank) continue;
            const parsed = parseIndexedReference(searchIndex.refs[id]);
            if (parsed) matches.push({ ...parsed, id, searchRank });
        }
    }
    matches.sort(compareSearchMatches);
    return { matches, mode, queryTerms, normalizedQueryTerms };
}
function resolveBookKey(bible, canonicalName) {
    if (bible?.[canonicalName] !== undefined) return canonicalName;
    const alias = BOOK_KEY_ALIASES[canonicalName];
    if (alias !== undefined && bible?.[alias] !== undefined) return alias;
    return null;
}
function cachedVerseText(api, translation, searchIndex, match) {
    const alias = BOOK_KEY_ALIASES[match.book];
    const bookData = api._bookCache.get(`${translation}/${match.book}`) ?? (alias ? api._bookCache.get(`${translation}/${alias}`) : null);
    const resolvedKey = resolveBookKey(bookData, match.book);
    const resolvedBookData = resolvedKey ? bookData[resolvedKey] ?? bookData : bookData;
    const originalText = resolvedBookData?.[String(match.chapter)]?.[String(match.verse)];
    return originalText != null ? String(originalText) : searchIndex.texts[match.id];
}
function buildResultsFromMatches(api, translation, searchIndex, matches, onBatchResults = null, sourceTranslation = null) {
    const results = matches.map((match) => {
        const text = cachedVerseText(api, translation, searchIndex, match);
        const result = { reference: match.ref, content: text, book: match.book, chapter: match.chapter, verse: match.verse, text };
        if (sourceTranslation) result.sourceTranslation = sourceTranslation;
        return result;
    });
    if (results.length > 0 && typeof onBatchResults === 'function') onBatchResults(results);
    return results;
}
function searchDebugEnabled() {
    return typeof window !== 'undefined' && window.__LEGE_LUX_SEARCH_DEBUG__ === true;
}
function debugIndexedSearch(api, engine, query, mode, queryTerms, normalizedQueryTerms, matches) {
    if (!searchDebugEnabled()) return;
    const matchedRefs = matches.map((match) => match.ref);
    console.debug('BibleApi.searchPassages', { engine, translation: api.translation, query, mode, queryTerms, normalizedQueryTerms, totalHits: matchedRefs.length, hasJohn316: matchedRefs.includes('John 3:16'), topRefs: matchedRefs.slice(0, 5) });
}
function buildRuntimeMatcher(query, mode) {
    if (mode === 'reference') {
        const referenceRegex = buildReferenceRegex(query);
        return (value) => referenceRegex?.test(value) ?? false;
    }
    if (mode === 'wildcardText') {
        const wildcardTextRegex = buildWildcardTextRegex(query);
        return (value) => wildcardTextRegex?.test(String(value || '')) ?? false;
    }
    const textMatcher = buildTextMatcher(String(query || '').toLowerCase());
    return (value) => textMatcher(value) ?? false;
}
function sortSupplementalResults(results) {
    results.sort((a, b) => {
        const bookDelta = (BOOK_ORDER_INDEX.get(a.book) ?? 999) - (BOOK_ORDER_INDEX.get(b.book) ?? 999);
        if (bookDelta !== 0) return bookDelta;
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        if (a.verse !== b.verse) return a.verse - b.verse;
        return String(a.sourceTranslation || '').localeCompare(String(b.sourceTranslation || ''));
    });
}
export function installInvertedSearchIndexEngine() {
    const proto = BibleApi?.prototype;
    if (!proto || proto[INSTALLED]) return;
    const originalSearchPassages = proto.searchPassages;
    Object.defineProperty(proto, INSTALLED, { value: true, enumerable: false, configurable: false });
    proto.searchPassages = async function searchPassages(query, onBatchResults = null) {
        const q = String(query || '').trim();
        if (!q) return { results: [], total_results: 0, page_size: PAGE_SIZE };
        const rawSearchIndex = await this._loadSearchIndex(this._translation);
        const searchIndex = normalizeSearchIndex(rawSearchIndex);
        if (searchIndex === null) return originalSearchPassages.call(this, query, onBatchResults);
        if (searchIndex !== rawSearchIndex) this._searchIndexCache.set(this._translation, searchIndex);
        const { matches, mode, queryTerms, normalizedQueryTerms } = searchNormalizedIndex(searchIndex, q);
        const engine = mode === 'reference' ? 'referenceIndex' : mode === 'wildcardText' ? 'wildcardInvertedIndex' : 'textInvertedIndex';
        debugIndexedSearch(this, engine, q.toLowerCase(), mode, queryTerms, normalizedQueryTerms, matches);
        const results = buildResultsFromMatches(this, this._translation, searchIndex, matches, onBatchResults);
        return { results, total_results: results.length, page_size: PAGE_SIZE };
    };
    proto.searchPassagesAllTranslations = async function searchPassagesAllTranslations(query, knownRefs) {
        const q = String(query || '').trim();
        if (q.length < 3) return [];
        const activeTranslation = this._translation;
        const candidates = [...LOCAL_TRANSLATIONS].filter((translation) => translation !== activeTranslation);
        const mode = classifySearchQuery(q);
        const matcher = buildRuntimeMatcher(q, mode);
        const seen = new Set([...(knownRefs ?? [])].map((ref) => `${activeTranslation}::${ref}`));
        const supplemental = [];
        await Promise.all(candidates.map(async (translation) => {
            const rawSearchIndex = await this._loadSearchIndex(translation);
            const searchIndex = normalizeSearchIndex(rawSearchIndex);
            if (searchIndex !== null) {
                if (searchIndex !== rawSearchIndex) this._searchIndexCache.set(translation, searchIndex);
                const filteredMatches = searchNormalizedIndex(searchIndex, q).matches.filter((match) => !seen.has(`${translation}::${match.ref}`));
                const results = buildResultsFromMatches(this, translation, searchIndex, filteredMatches, null, translation);
                for (const result of results) {
                    const seenKey = `${translation}::${result.reference}`;
                    if (seen.has(seenKey)) continue;
                    seen.add(seenKey);
                    supplemental.push(result);
                }
                return;
            }
            for (const book of BOOK_LOAD_ORDER) {
                const alias = BOOK_KEY_ALIASES[book];
                const bookData = this._bookCache.get(`${translation}/${book}`) ?? (alias ? this._bookCache.get(`${translation}/${alias}`) : null);
                if (!bookData) continue;
                const resolvedKey = resolveBookKey(bookData, book);
                const resolvedBookData = resolvedKey ? bookData[resolvedKey] ?? bookData : bookData;
                for (const [chapterStr, chapterData] of Object.entries(resolvedBookData)) {
                    if (!chapterData || typeof chapterData !== 'object') continue;
                    for (const [verseStr, text] of Object.entries(chapterData)) {
                        if (Number(verseStr) <= 0) continue;
                        const verseText = String(text || '');
                        const ref = `${book} ${chapterStr}:${verseStr}`;
                        const isMatch = mode === 'reference' ? matcher(ref) : matcher(verseText);
                        if (!isMatch) continue;
                        const seenKey = `${translation}::${ref}`;
                        if (seen.has(seenKey)) continue;
                        seen.add(seenKey);
                        supplemental.push({ reference: ref, content: verseText, book, chapter: Number(chapterStr), verse: Number(verseStr), text: verseText, sourceTranslation: translation });
                    }
                }
            }
        }));
        sortSupplementalResults(supplemental);
        return supplemental;
    };
}

installInvertedSearchIndexEngine();
