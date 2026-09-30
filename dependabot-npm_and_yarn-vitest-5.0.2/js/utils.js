// js/utils.js
// Pure, side-effect-free utility functions extracted from bible-api.js,
// bsb-structure.js, and reading-state.js.
// These functions have no DOM, fetch, or localStorage dependencies and
// can be imported directly in Node (Vitest) without a browser context.

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

/**
 * HTML-escape a value so it is safe to embed in attribute values and text.
 *
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Reference parsing
// ---------------------------------------------------------------------------

/**
 * Parse a human-readable passage reference into its component parts.
 *
 * Supported forms:
 *   "John 3"            → { book:'John',  chapter:3, verseStart:null, verseEnd:null }
 *   "John 3:16"         → { book:'John',  chapter:3, verseStart:16,   verseEnd:null }
 *   "Romans 8:1-17"     → { book:'Romans',chapter:8, verseStart:1,    verseEnd:17   }
 *   "1 Corinthians 13"  → { book:'1 Corinthians', chapter:13, … }
 *
 * @param {string} reference
 * @returns {{ book: string, chapter: number, verseStart: number|null, verseEnd: number|null }|null}
 */
export function parseReference(reference) {
    const str = String(reference || '').trim();
    const m = str.match(/^((?:[1-3]\s+)?[A-Za-z ]+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
    if (!m) return null;

    return {
        book: m[1].trim(),
        chapter: parseInt(m[2], 10),
        verseStart: m[3] ? parseInt(m[3], 10) : null,
        verseEnd: m[4] ? parseInt(m[4], 10) : null,
    };
}

// ---------------------------------------------------------------------------
// Canonical string builder
// ---------------------------------------------------------------------------

/**
 * Build the canonical display string for a resolved passage.
 *
 * @param {string} book
 * @param {number} chapter
 * @param {number|null} verseStart
 * @param {number|null} verseEnd  - Already normalised (null when whole chapter).
 * @returns {string}
 */
export function buildCanonical(book, chapter, verseStart, verseEnd) {
    if (verseStart === null) return `${book} ${chapter}`;
    if (verseEnd === null || verseEnd === verseStart) return `${book} ${chapter}:${verseStart}`;
    return `${book} ${chapter}:${verseStart}-${verseEnd}`;
}

// ---------------------------------------------------------------------------
// Verse range math
// ---------------------------------------------------------------------------

/**
 * Clamp a verse range to the actual verse count of a chapter.
 *
 * @param {number|null} verseStart
 * @param {number|null} verseEnd
 * @param {number}      chapterVerseCount  - Total number of verses in the chapter.
 * @returns {{ verseStart: number|null, verseEnd: number|null }}
 */
export function clampVerseRange(verseStart, verseEnd, chapterVerseCount) {
    if (verseStart === null) return { verseStart: null, verseEnd: null };

    const start = Math.max(1, Math.min(verseStart, chapterVerseCount));
    const end = verseEnd !== null
        ? Math.max(start, Math.min(verseEnd, chapterVerseCount))
        : start;

    return { verseStart: start, verseEnd: end };
}

/**
 * Given a chapter's verse keys, return the verse numbers that fall within
 * [verseStart, verseEnd] (inclusive), sorted ascending.
 * When both are null the full chapter is returned.
 *
 * @param {string[]} verseKeys    - Object.keys(chapterData)
 * @param {number|null} verseStart
 * @param {number|null} verseEnd
 * @returns {number[]}
 */
export function filterVerseNumbers(verseKeys, verseStart, verseEnd) {
    return verseKeys
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
        .filter(v => {
            if (verseStart !== null && v < verseStart) return false;
            if (verseEnd !== null && v > verseEnd) return false;
            return true;
        });
}

// ---------------------------------------------------------------------------
// Highlight / selector
// ---------------------------------------------------------------------------

/**
 * Return the CSS selector string used to locate a specific verse element
 * inside the passage container.
 *
 * @param {number} verseNumber
 * @returns {string}  e.g. `.verse[data-verse="16"]`
 */
export function buildVerseSelector(verseNumber) {
    return `.verse[data-verse="${verseNumber}"]`;
}

/**
 * Return the id attribute value for a verse element.
 *
 * @param {number} chapter
 * @param {number} verse
 * @returns {string}  e.g. `v3-16`
 */
export function buildVerseId(chapter, verse) {
    return `v${chapter}-${verse}`;
}

// ---------------------------------------------------------------------------
// Reading state defaults
// ---------------------------------------------------------------------------

/**
 * Return the default application reading state.
 * This is a pure data object with no side effects.
 *
 * @returns {object}
 */
export function initializeState() {
    return {
        currentBook: 'John',
        currentChapter: 1,
        selectedVerse: null,
        fontSize: 18,
        showVerseNumbers: true,
        showHeadings: true,
        showFootnotes: false,
        showCrossReferences: false,
        verseByVerse: false,
        colorTheme: 'dracula',
        lightMode: false,
        translation: 'KJV',
    };
}

// ---------------------------------------------------------------------------
// BSB scaffold helpers (pure subset of bsb-structure.js)
// ---------------------------------------------------------------------------

/**
 * Filter a flat scaffold event array to only those belonging to `chapter`,
 * sorted ascending by verse.
 *
 * @param {Array<{ch:number, v:number, type:string, text?:string}>} events
 * @param {number} chapter
 * @returns {Array}
 */
export function eventsForChapter(events, chapter) {
    return events
        .filter(e => e.ch === chapter)
        .sort((a, b) => a.v - b.v);
}
