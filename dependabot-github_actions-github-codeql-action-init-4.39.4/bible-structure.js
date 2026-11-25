// bible-structure.js
// Bible canon data and book-level lookup helpers.
// All functions accept an `app` instance as their first argument so they can
// read app.bibleBooks and app.bookDisplayNames without coupling to BibleApp.

// ── Static 66-book protestant structure ──────────────────────────────────────
// Used as the fallback when a translation meta.json has no `books` array.
// Format: { testament: { book: chapterCount } }

const PROTESTANT_STRUCTURE = {
    'Old Testament': {
        Genesis: 50, Exodus: 40, Leviticus: 27, Numbers: 36, Deuteronomy: 34,
        Joshua: 24, Judges: 21, Ruth: 4, '1 Samuel': 31, '2 Samuel': 24,
        '1 Kings': 22, '2 Kings': 25, '1 Chronicles': 29, '2 Chronicles': 36,
        Ezra: 10, Nehemiah: 13, Esther: 10, Job: 42, Psalm: 150, Proverbs: 31,
        Ecclesiastes: 12, 'Song of Solomon': 8, Isaiah: 66, Jeremiah: 52,
        Lamentations: 5, Ezekiel: 48, Daniel: 12, Hosea: 14, Joel: 3, Amos: 9,
        Obadiah: 1, Jonah: 4, Micah: 7, Nahum: 3, Habakkuk: 3, Zephaniah: 3,
        Haggai: 2, Zechariah: 14, Malachi: 4,
    },
    'New Testament': {
        Matthew: 28, Mark: 16, Luke: 24, John: 21, Acts: 28, Romans: 16,
        '1 Corinthians': 16, '2 Corinthians': 13, Galatians: 6, Ephesians: 6,
        Philippians: 4, Colossians: 4, '1 Thessalonians': 5, '2 Thessalonians': 3,
        '1 Timothy': 6, '2 Timothy': 4, Titus: 3, Philemon: 1, Hebrews: 13,
        James: 5, '1 Peter': 5, '2 Peter': 3, '1 John': 5, '2 John': 1,
        '3 John': 1, Jude: 1, Revelation: 22,
    },
};

/**
 * Flat Set of all 66 Protestant canon book names.
 * Any book not in this set is deuterocanon and should use WEB_structure.
 */
export const PROTESTANT_BOOKS = new Set(
    Object.values(PROTESTANT_STRUCTURE).flatMap(Object.keys)
);

/**
 * Standard testament order for the book selector.
 * OT → Deuterocanon → NT matches the Protestant Apocrypha convention
 * (1611 KJV, NRSV with Apocrypha, etc.) — placing deuterocanon between
 * the testaments without implying it belongs inside the OT canon.
 */
const TESTAMENT_ORDER = ['Old Testament', 'Deuterocanon', 'New Testament'];

/**
 * Returns the full bible structure object: { testament: { book: chapterCount } }
 *
 * If `meta` is provided and contains a `books` array, the structure is built
 * dynamically from that data. Testaments are always returned in the order
 * OT → Deuterocanon → NT regardless of the order in meta.books.
 *
 * Each entry in meta.books must be:
 *   { name: string, testament: string, chapters: number }
 *
 * If `meta` is absent or has no `books` array, falls back to the static
 * 66-book protestant structure so all existing translations keep working.
 *
 * @param {object|null} meta  - parsed meta.json for the active translation
 * @returns {object}          - { testament: { book: chapterCount } }
 */
export function buildBibleBooks(meta) {
    if (!meta?.books?.length) return PROTESTANT_STRUCTURE;

    const structure = {};
    for (const entry of meta.books) {
        const { name, testament, chapters } = entry;
        if (!name || !testament || !chapters) continue;
        if (!structure[testament]) structure[testament] = {};
        structure[testament][name] = chapters;
    }

    if (!Object.keys(structure).length) return PROTESTANT_STRUCTURE;

    // Reorder testaments: OT → Deuterocanon → NT, then any non-standard sections.
    const ordered = {};
    for (const testament of TESTAMENT_ORDER) {
        if (structure[testament]) ordered[testament] = structure[testament];
    }
    for (const testament of Object.keys(structure)) {
        if (!ordered[testament]) ordered[testament] = structure[testament];
    }

    return ordered;
}

/**
 * Called once during BibleApp construction with no meta argument.
 * Returns the static protestant structure as the startup default.
 * @returns {object}
 */
export function initializeBibleStructure() {
    return buildBibleBooks(null);
}

/**
 * Returns a flat ordered array of all book names across all testaments.
 * Order follows the testament insertion order in app.bibleBooks.
 * @param {object} app
 * @returns {string[]}
 */
export function getAllBooks(app) {
    return Object.values(app.bibleBooks).flatMap(testament => Object.keys(testament));
}

/**
 * Returns the number of chapters in `book`, or 0 if not found.
 * @param {object} app
 * @param {string} book
 * @returns {number}
 */
export function getChapterCount(app, book) {
    for (const testament of Object.values(app.bibleBooks)) {
        if (testament[book]) return testament[book];
    }
    return 0;
}

/**
 * Returns the testament name the book belongs to, or null.
 * @param {object} app
 * @param {string} book
 * @returns {string|null}
 */
export function getTestament(app, book) {
    for (const [testament, books] of Object.entries(app.bibleBooks)) {
        if (books[book]) return testament;
    }
    return null;
}

/**
 * Returns the display name for a book (e.g. 'Psalm' → 'Psalms').
 * @param {object} app
 * @param {string} book
 * @returns {string}
 */
export function getDisplayName(app, book) {
    return app.bookDisplayNames[book] || book;
}
