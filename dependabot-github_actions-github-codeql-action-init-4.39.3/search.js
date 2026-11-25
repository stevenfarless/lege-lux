// search.js
// All search-related logic for BibleApp.
// Every function accepts an `app` instance as its first argument.

import { normaliseBookAlias } from './book-aliases.js';

// Canonical book order for cross-book sort — must stay in sync with
// BOOK_LOAD_ORDER in bible-api.js.
const CANON_BOOK_ORDER = [
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
    'Additions to Esther', 'Bel and the Dragon', 'Prayer of Manasseh', 'Letter of Jeremiah',
    'Prayer of Azariah', 'Wisdom of Solomon', '2 Maccabees', '4 Maccabees',
    '3 Maccabees', '1 Maccabees', 'Psalm 151', '1 Esdras',
    '2 Esdras', 'Susanna', 'Sirach', 'Baruch',
    'Judith', 'Tobit',
];
const CANON_BOOK_INDEX = new Map(CANON_BOOK_ORDER.map((b, i) => [b, i]));

// ─── Utilities ──────────────────────────────────────────────────────────────────────────────

export function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function stripHTML(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

export function highlightSearchTerm(text, term) {
    if (text == null) return '';

    const escapedText = escapeHtml(text);
    const rawTerm = term == null ? '' : String(term).trim();

    if (!rawTerm) return escapedText;

    try {
        const escapedTerm = escapeHtml(rawTerm);
        const regex = new RegExp(escapeRegExp(escapedTerm), 'gi');
        return escapedText.replace(regex, (match) => `<strong>${match}</strong>`);
    } catch (err) {
        console.warn('highlightSearchTerm failed', err);
        return escapedText;
    }
}


// ─── Reference parsing ────────────────────────────────────────────────────────────────────

export function parseReference(reference, bookList) {
    const raw = String(reference || '').trim();
    const cleaned = normaliseBookAlias(raw);

    if (Array.isArray(bookList) && bookList.length > 0) {
        const sorted = [...bookList].sort((a, b) => b.length - a.length);
        for (const name of sorted) {
            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const prefixRe = new RegExp(
                '^(' + escapedName + ')\\s+([\\d]+)(?:[:\\s]([\\d]+[a-z]?))?$',
                'i'
            );
            const m = cleaned.match(prefixRe);
            if (m) {
                const chapter = parseInt(m[2], 10);
                const verse = m[3] ? (/^[0-9]+$/.test(m[3]) ? parseInt(m[3], 10) : m[3].toLowerCase()) : null;
                if (!Number.isFinite(chapter)) continue;
                if (verse !== null && typeof verse === 'number' && !Number.isFinite(verse)) continue;
                return { book: name, chapter, verse };
            }
        }
        return null;
    }

    const match = cleaned.match(/^((?:\d\s+)?[A-Za-z][A-Za-z ]*?)\s+([\d]+)(?:[:\s]([\d]+[a-z]?))?$/i);
    if (!match) return null;

    const book = match[1].trim();
    const chapter = parseInt(match[2], 10);
    const verse = match[3] ? (/^[0-9]+$/.test(match[3]) ? parseInt(match[3], 10) : match[3].toLowerCase()) : null;

    if (!book || !Number.isFinite(chapter)) return null;
    if (verse !== null && typeof verse === 'number' && !Number.isFinite(verse)) return null;

    return { book, chapter, verse };
}

// Returns true when the query should be routed through the reference/wildcard-
// reference path rather than the keyword search path.
//
// Recognised patterns:
//   Concrete refs   — "John 3", "John 3:16", "1 Cor 6:7"
//   Wildcard book   — "* 6:7", "* 6:*", "* *:16"
//   Wildcard chap   — "John *", "John *:*"
//   Wildcard verse  — "John 3:*"
export function isPassageReference(query) {
    const q = query.trim();
    // Wildcard-book patterns: "* ch", "* ch:v", "* ch:*", "* *:v", "* *:*"
    if (/^\*\s+[\d*]+(?:[:]\s*[\d*]+)?$/i.test(q)) return true;
    // Concrete or wildcard-verse/chapter patterns for named books
    const patterns = [
        /^[1-3]?\s*[a-z]+\s+\d+/i,
        /^[1-3]?\s*[a-z]+\s+\d+:\d+/i,
        /^[1-3]?\s*[a-z]+\s+\*(?::\s*[\d*]+)?$/i,
        /^[1-3]?\s*[a-z]+\s+\d+:\s*\*$/i,
    ];
    return patterns.some((p) => p.test(q));
}

export async function loadPassageFromReference(app, reference, source = 'search-reference') {
    const allBooks = app.getAllBooks();
    const parsed = parseReference(reference, allBooks);
    if (!parsed) return;
    const { book, chapter, verse } = parsed;
    app._dbgEvent?.('search reference selected: ' + book + ' ' + chapter + (verse ? ':' + verse : '') + ' source=' + source);

    app.state.selectedVerse = verse || null;
    await app.loadPassage(book, chapter, false, source);
    if (verse) {
        requestAnimationFrame(() => app.scrollToVerse(verse));
    }
}

// ─── Delegated event handler ───────────────────────────────────────────────────────────

export function initSearchResultsDelegate(app) {
    if (app._searchDelegateAttached) return;
    app._searchDelegateAttached = true;

    let scrollTopAtTouchStart = 0;

    app.searchResults.addEventListener('touchstart', () => {
        scrollTopAtTouchStart = app.searchResults.scrollTop;
    }, { passive: true });

    function handleTap(e) {
        const target = e.target;
        const insideResultsList = app.searchResults.contains(target);

        if (e.type === 'touchend') {
            if (insideResultsList && Math.abs(app.searchResults.scrollTop - scrollTopAtTouchStart) > 2) return;
            app._searchTouchHandled = true;
        }

        if (e.type === 'click' && app._searchTouchHandled) {
            app._searchTouchHandled = false;
            return;
        }

        const query = app.searchLastQuery || '';

        // ── Expand / collapse all ─────────────────────────────────────────
        const expandBtn = target.closest('.search-expand-collapse-btn');
        if (expandBtn) {
            e.preventDefault();
            const action = expandBtn.dataset.action;
            app._dbgUserAction(`search expandCollapse: ${action} all`);
            const liveGroups = groupSearchResultsByCanon(app, app.currentSearchResults);
            if (action === 'expand') {
                for (const g of liveGroups) {
                    app.searchExpandedTestaments.add(g.heading);
                    for (const b of g.books) app.searchExpandedBooks.add(b.book);
                }
            } else {
                app.searchExpandedTestaments.clear();
                app.searchExpandedBooks.clear();
            }
            displaySearchResults(app, app.currentSearchResults, query);
            app._dbgUserAction(`search expandCollapse: ${action} all — done`);
            return;
        }

        // ── Testament heading ────────────────────────────────────────────
        const groupHeading = target.closest('.search-group-heading');
        if (groupHeading) {
            e.preventDefault();
            const testament = groupHeading.getAttribute('data-testament');
            if (!testament) return;
            const nowExpanded = !app.searchExpandedTestaments.has(testament);
            if (nowExpanded) {
                app.searchExpandedTestaments.add(testament);
            } else {
                app.searchExpandedTestaments.delete(testament);
            }
            app._dbgUserAction(`search toggle testament: "${testament}" → ${nowExpanded ? 'expanded' : 'collapsed'}`);
            displaySearchResults(app, app.currentSearchResults, query);
            return;
        }

        // ── Book heading ───────────────────────────────────────────────
        const bookHeading = target.closest('.search-book-heading');
        if (bookHeading) {
            e.preventDefault();
            const book = bookHeading.getAttribute('data-book');
            if (!book) return;
            const nowExpanded = !app.searchExpandedBooks.has(book);
            if (nowExpanded) {
                app.searchExpandedBooks.add(book);
            } else {
                app.searchExpandedBooks.delete(book);
            }
            app._dbgUserAction(`search toggle book: "${book}" → ${nowExpanded ? 'expanded' : 'collapsed'}`);
            displaySearchResults(app, app.currentSearchResults, query);
            return;
        }

        // ── Translation badge (multi-translation) ────────────────────────
        const badge = target.closest('.search-result-translation-badge[data-translation-id]');
        if (badge) {
            e.preventDefault();
            e.stopPropagation();
            const card = badge.closest('.search-result-item');
            if (!card) return;
            const translationId = badge.dataset.translationId;
            app._dbgUserAction?.('search translation badge selected: ' + translationId + ' for ' + (card.dataset.reference || 'unknown'));
            const translationContent = badge.dataset.translationContent;
            card.dataset.activeTranslation = translationId;
            card.querySelector('.search-result-content').innerHTML =
                highlightSearchTerm(translationContent, query);
            card.querySelectorAll('.search-result-translation-badge[data-translation-id]').forEach((b) => {
                b.classList.toggle('active', b.dataset.translationId === translationId);
            });
            return;
        }

        // ── Result item ────────────────────────────────────────────────
        const resultItem = target.closest('.search-result-item');
        if (resultItem) {
            e.preventDefault();
            const activeTrans = resultItem.dataset.activeTranslation || null;
            const ref = resultItem.dataset.reference;
            const activationSource = app._searchActivationSource || e.type;
            app._dbgUserAction?.('search result selected: ' + ref + ' source=' + activationSource + (activeTrans ? ' translation=' + activeTrans : ''));
            app._dbgEvent?.('search result navigation: ' + ref + ' source=' + activationSource + (activeTrans ? ' translation=' + activeTrans : ''));
            closeSearch(app);
            (async () => {
                if (activeTrans && activeTrans !== app.bibleApi.translation) {
                    await app.changeTranslation(activeTrans);
                }
                await loadPassageFromReference(app, ref, 'search-result-' + activationSource);
            })();
            return;
        }
    }

    app.searchContainer.addEventListener('touchend', handleTap, { passive: false });
    app.searchContainer.addEventListener('click', handleTap);
}

// ─── UI state ────────────────────────────────────────────────────────────────────────────────

export function toggleSearch(app) {
    app.searchContainer.classList.toggle('active');
    if (app.searchContainer.classList.contains('active')) {
        initSearchResultsDelegate(app);
        app.searchInput.focus();
    } else {
        app.searchInput.value = '';
        app.searchResults.innerHTML = '';
        app.searchSelectedIndex = -1;
        app.searchResultItems = [];
        if (app.searchResultsSummary) app.searchResultsSummary.remove();
        app.searchResultsSummary = null;
    }
}

export function closeSearch(app) {
    app.searchContainer.classList.remove('active');
    app.searchInput.value = '';
    app.searchResults.innerHTML = '';
    app.searchSelectedIndex = -1;
    app.searchResultItems = [];
    if (app.searchResultsSummary) app.searchResultsSummary.remove();
    app.searchResultsSummary = null;
}

function ensureSearchSummaryHost(app) {
    if (app.searchResultsSummary && app.searchResultsSummary.isConnected) return app.searchResultsSummary;

    let summary = app.searchContainer.querySelector('.search-results-summary');
    if (!summary) {
        summary = document.createElement('div');
        summary.className = 'search-results-summary';
        summary.innerHTML = `
            <span class="search-results-count"></span>
            <span class="search-results-actions">
                <button class="search-expand-collapse-btn" data-action="expand">expand all</button>
                <span class="search-results-divider">·</span>
                <button class="search-expand-collapse-btn" data-action="collapse">collapse all</button>
            </span>
        `;
        app.searchContainer.insertBefore(summary, app.searchResults);
    }

    app.searchResultsSummary = summary;
    return summary;
}

// ─── Input handling ─────────────────────────────────────────────────────────────────────

export function handleSearch(app, query) {
    clearTimeout(app.searchTimeout);
    app.searchLastQuery = query;
    app.currentSearchResults = [];

    if (!query.trim()) {
        app.searchResults.innerHTML = '';
        app.searchSelectedIndex = -1;
        app.searchResultItems = null;
        if (app.searchResultsSummary) app.searchResultsSummary.remove();
        app.searchResultsSummary = null;
        return;
    }

    app.searchTimeout = setTimeout(async () => {
        if (isPassageReference(query)) {
            await handlePassageReference(app, query);
        } else {
            await performKeywordSearch(app, query);
        }
    }, 300);
}

export function handleSearchKeydown(app, e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch(app);
        return;
    }

    if (!app.searchResultItems || app.searchResultItems.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchSelectedIndex(app, Math.min(app.searchSelectedIndex + 1, app.searchResultItems.length - 1), true);
        return;
    }

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchSelectedIndex(app, Math.max(app.searchSelectedIndex - 1, 0), true);
        return;
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        if (app.searchSelectedIndex >= 0) {
            activateSelectedSearchResult(app);
        } else {
            app.searchInput?.blur();
        }
    }
}

// ─── Result list selection ─────────────────────────────────────────────────────────────────

export function refreshSearchResultItems(app, autoSelectFirst = false) {
    app.searchResultItems = Array.from(
        app.searchResults.querySelectorAll('.search-result-item')
    );

    if (!app.searchResultItems.length) {
        app.searchSelectedIndex = -1;
        return;
    }

    if (autoSelectFirst) {
        setSearchSelectedIndex(app, 0, false);
    } else {
        if (app.searchSelectedIndex < 0 || app.searchSelectedIndex >= app.searchResultItems.length) {
            app.searchSelectedIndex = -1;
        } else {
            setSearchSelectedIndex(app, app.searchSelectedIndex, false);
        }
    }
}

export function setSearchSelectedIndex(app, index, scrollIntoView = false) {
    if (!app.searchResultItems || app.searchResultItems.length === 0) {
        app.searchSelectedIndex = -1;
        return;
    }

    const clamped = Math.max(0, Math.min(index, app.searchResultItems.length - 1));
    app.searchSelectedIndex = clamped;

    app.searchResultItems.forEach((el, i) => {
        el.classList.toggle('selected', i === clamped);
    });

    if (scrollIntoView) {
        app.searchResultItems[clamped]?.scrollIntoView({ block: 'nearest' });
    }
}

export function activateSelectedSearchResult(app) {
    if (!app.searchResultItems || app.searchSelectedIndex < 0 || app.searchSelectedIndex >= app.searchResultItems.length) return;
    const item = app.searchResultItems[app.searchSelectedIndex];
    app._dbgUserAction?.('search result keyboard activation: ' + (item?.dataset.reference || 'unknown'));
    app._searchActivationSource = 'keyboard';
    item?.click();
    app._searchActivationSource = null;
}

// ─── API calls ───────────────────────────────────────────────────────────────────────────────

export async function handlePassageReference(app, reference) {
    const q = reference.trim();
    app._dbgEvent?.('search mode: reference lookup for "' + q + '"');
    // Wildcard reference patterns bypass the passage-fetch API and go directly
    // to keyword search, which now handles them in bible-api.js.
    if (/^\*/.test(q) || /\*/.test(q.replace(/^[^:]+/, ''))) {
        await performKeywordSearch(app, reference);
        return;
    }

    const data = await app.bibleApi.fetchPassage(reference);

    if (data && data.passages && data.passages.length > 0) {
        const safeCanonical = escapeHtml(data.canonical || '');
        const preview = escapeHtml(stripHTML(data.passages[0]).substring(0, 200));

        app.searchResults.innerHTML =
            '<div class="search-result-item" data-reference="' + safeCanonical + '">' +
            '<div class="search-result-reference">' + safeCanonical + '</div>' +
            '<div class="search-result-content">' + preview + '...</div>' +
            '</div>';

        refreshSearchResultItems(app, true);
        ensureSearchSummaryHost(app);
        app.searchResultsSummary.querySelector('.search-results-count').textContent = '1 verse in 1 book';
        app.searchResultsSummary.querySelector('.search-results-actions').style.display = 'none';
    } else {
        await performKeywordSearch(app, reference);
    }
}

export async function fetchAllSearchResults(app, query, onBatch) {
    app.currentSearchResults = [];
    await app.bibleApi.searchPassages(query, (batchResults) => {
        app.currentSearchResults.push(...batchResults);
        if (typeof onBatch === 'function') onBatch(app.currentSearchResults.slice());
    });
    return app.currentSearchResults;
}

// ─── Megasearch ─────────────────────────────────────────────────────────────────────────────

export async function runMegasearch(app, query) {
    const q = (query || '').trim();
    if (q.length < 3) return;
    if (app.searchLastQuery !== query) return;

    app._dbgUserAction(`megasearch: activated for "${q}"`);

    const activeTranslation = app.bibleApi.translation;
    const knownRefs = new Set(
        app.currentSearchResults.map((r) => r.reference)
    );

    let supplemental;
    try {
        supplemental = await app.bibleApi.searchPassagesAllTranslations(query, knownRefs);
    } catch (err) {
        console.warn('megasearch failed', err);
        app._dbgUserAction(`megasearch: failed — ${err.message}`);
        return;
    }

    if (app.searchLastQuery !== query) return;
    if (!supplemental || supplemental.length === 0) {
        app._dbgUserAction('megasearch: no supplemental results');
        return;
    }

    const combined = [...app.currentSearchResults, ...supplemental];
    combined.sort((a, b) => {
        const bi = (CANON_BOOK_INDEX.get(a.book) ?? 999) - (CANON_BOOK_INDEX.get(b.book) ?? 999);
        if (bi !== 0) return bi;
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.verse - b.verse;
    });
    app.currentSearchResults = combined;
    app._dbgUserAction(`megasearch: added ${supplemental.length} supplemental results (total: ${combined.length})`);
    displaySearchResults(app, combined, query);
}

// ─── Grouping & display ───────────────────────────────────────────────────────────────────

// Merges results with the same reference into one object. The active
// translation's text becomes the default displayed content; supplemental
// translations are collected into a translations array for the inline badges.
function mergeResultsByReference(results, activeTranslation) {
    const seen = new Map(); // reference → merged result

    for (const r of results) {
        const ref = r.reference;
        if (!seen.has(ref)) {
            seen.set(ref, {
                reference: r.reference,
                book: r.book,
                chapter: r.chapter,
                verse: r.verse,
                content: r.content,
                activeTranslation: r.sourceTranslation || activeTranslation,
                translations: [],
            });
        }
        const merged = seen.get(ref);
        const tid = r.sourceTranslation || activeTranslation;

        // Promote active translation to primary content.
        if (!r.sourceTranslation) {
            merged.content = r.content;
            merged.activeTranslation = activeTranslation;
        }

        // Avoid duplicate badges for the same translation.
        if (!merged.translations.some((t) => t.id === tid)) {
            merged.translations.push({ id: tid, content: r.content });
        }
    }

    return [...seen.values()];
}

export function groupSearchResultsByCanon(app, results) {
    if (!Array.isArray(results)) return [];

    const activeTranslation = app.bibleApi.translation;
    const merged = mergeResultsByReference(results, activeTranslation);

    const allBooks = app.getAllBooks();
    const otBooks = Object.keys(app.bibleBooks['Old Testament'] || {});
    const ntBooks = Object.keys(app.bibleBooks['New Testament'] || {});
    const dcBooks = Object.keys(app.bibleBooks['Deuterocanon'] || {});
    const otGroups = new Map();
    const ntGroups = new Map();
    const dcGroups = new Map();

    for (const result of merged) {
        const parsed = parseReference(result.reference, allBooks);
        if (!parsed) continue;
        const { book } = parsed;
        const testament = app.getTestament?.(book);

        if (testament === 'Old Testament') {
            if (!otGroups.has(book)) otGroups.set(book, []);
            otGroups.get(book).push(result);
        } else if (testament === 'New Testament') {
            if (!ntGroups.has(book)) ntGroups.set(book, []);
            ntGroups.get(book).push(result);
        } else if (testament === 'Deuterocanon') {
            if (!dcGroups.has(book)) dcGroups.set(book, []);
            dcGroups.get(book).push(result);
        }
    }

    const grouped = [];

    if (otGroups.size) {
        grouped.push({
            heading: 'Old Testament',
            books: otBooks.filter((b) => otGroups.has(b)).map((book) => ({ book, results: otGroups.get(book) })),
        });
    }

    if (dcGroups.size) {
        grouped.push({
            heading: 'Deuterocanon',
            books: dcBooks.filter((b) => dcGroups.has(b)).map((book) => ({ book, results: dcGroups.get(book) })),
        });
    }

    if (ntGroups.size) {
        grouped.push({
            heading: 'New Testament',
            books: ntBooks.filter((b) => ntGroups.has(b)).map((book) => ({ book, results: ntGroups.get(book) })),
        });
    }

    return grouped;
}

export async function performKeywordSearch(app, query) {
    app._dbgEvent?.('search mode: keyword for "' + query + '" translation=' + app.bibleApi.translation);
    app.searchResults.innerHTML = '<div class="loading" style="min-height: 100px">Searching...</div>';
    app.searchSelectedIndex = -1;
    app.searchResultItems = [];

    app.searchExpandedTestaments?.clear();
    app.searchExpandedBooks?.clear();
    const autoExpandedTestaments = new Set();
    const autoExpandedBooks = new Set();

    await fetchAllSearchResults(app, query, (accumulatedResults) => {
        if (accumulatedResults.length > 0) {
            const groups = groupSearchResultsByCanon(app, accumulatedResults);

            for (const group of groups) {
                if (!autoExpandedTestaments.has(group.heading)) {
                    autoExpandedTestaments.add(group.heading);
                    app.searchExpandedTestaments.add(group.heading);
                }

                for (const book of group.books) {
                    if (!autoExpandedBooks.has(book.book)) {
                        autoExpandedBooks.add(book.book);
                        app.searchExpandedBooks.add(book.book);
                    }
                }
            }

            displaySearchResults(app, accumulatedResults, query);
        }
    });

    if (app.currentSearchResults.length > 0) {
        displaySearchResults(app, app.currentSearchResults, query);
        app._dbgUserAction(`search results: ${app.currentSearchResults.length} verses for "${query}"`);
    } else {
        app.searchResults.innerHTML = '<div class="search-no-results">No results found</div>';
        if (app.searchResultsSummary) app.searchResultsSummary.remove();
        app.searchResultsSummary = null;
        refreshSearchResultItems(app, false);
        app._dbgUserAction(`search results: 0 verses for "${query}"`);
    }

    const megasearchToggle = document.getElementById('megasearchToggle');
    const megasearchActive = megasearchToggle?.checked ?? false;
    app._dbgUserAction(`megasearch toggle: ${megasearchActive ? 'ON' : 'OFF'}`);

    if (megasearchActive && query.trim().length >= 3) {
        runMegasearch(app, query);
    }
}

export function displaySearchResults(app, results, query) {
    const groups = groupSearchResultsByCanon(app, results);
    const isReferenceLookup = isPassageReference(query);

    if (!groups.length) {
        app.searchResults.innerHTML = '<div class="search-no-results">No results found</div>';
        if (app.searchResultsSummary) app.searchResultsSummary.remove();
        app.searchResultsSummary = null;
        refreshSearchResultItems(app, false);
        return;
    }


    const totalVerses = groups.reduce((acc, g) => acc + g.books.reduce((a, b) => a + b.results.length, 0), 0);
    const totalBooks = groups.reduce((acc, g) => acc + g.books.length, 0);
    const countLabel = `${totalVerses} verse${totalVerses !== 1 ? 's' : ''} in ${totalBooks} book${totalBooks !== 1 ? 's' : ''}`;

    const summary = ensureSearchSummaryHost(app);
    summary.querySelector('.search-results-count').textContent = countLabel;
    summary.querySelector('.search-results-actions').style.display = '';

    const parts = [];

    for (const group of groups) {
        const testName = group.heading;
        const testamentExpanded = app.searchExpandedTestaments.has(testName);

        parts.push(`
      <div class="search-group-heading" data-testament="${escapeHtml(testName)}">
        <span class="search-group-title">${escapeHtml(testName)}</span>
        <span class="search-group-chevron ${testamentExpanded ? 'expanded' : ''}">&#9662;</span>
      </div>
    `);

        if (!testamentExpanded) continue;

        for (const bookBlock of group.books) {
            const bookName = bookBlock.book;
            const bookExpanded = app.searchExpandedBooks.has(bookName);

            parts.push(`
        <div class="search-book-heading" data-book="${escapeHtml(bookName)}">
          <span class="search-book-title">${escapeHtml(app.getDisplayName(bookName))}</span>
          <span class="search-book-chevron ${bookExpanded ? 'expanded' : ''}">&#9662;</span>
        </div>
      `);

            if (!bookExpanded) continue;

            for (const result of bookBlock.results) {
                let highlighted = result.content;
                try {
                    highlighted = highlightSearchTerm(result.content, query);
                } catch (err) {
                    console.warn('highlight failed', err);
                }

                // Badges sit inline in the reference line, same as single-translation cards.
                // When multiple translations matched, each gets a badge with data attrs for
                // the tap handler; the active one gets class `active`.
                let badgesHtml = '';
                if (result.translations.length === 1) {
                    badgesHtml = `<span class="search-result-translation-badge">${escapeHtml(result.translations[0].id)}</span>`;
                } else if (result.translations.length > 1) {
                    badgesHtml = result.translations.map((t) => {
                        const isActive = t.id === result.activeTranslation;
                        return `<span class="search-result-translation-badge${isActive ? ' active' : ''}" data-translation-id="${escapeHtml(t.id)}" data-translation-content="${escapeHtml(t.content)}">${escapeHtml(t.id)}</span>`;
                    }).join('');
                }

                parts.push(`
          <div class="search-result-item" data-reference="${escapeHtml(result.reference)}" data-active-translation="${escapeHtml(result.activeTranslation)}">
            <div class="search-result-reference">${escapeHtml(result.reference)} ${badgesHtml}</div>
            <div class="search-result-content">${highlighted}</div>
          </div>
        `);
            }
        }
    }

    app.searchResults.innerHTML = parts.join('');
    refreshSearchResultItems(app, isReferenceLookup);
}
