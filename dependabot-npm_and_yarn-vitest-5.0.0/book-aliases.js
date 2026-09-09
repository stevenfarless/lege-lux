// book-aliases.js
// Canonical alias map for Bible book names.
// Covers abbreviations, alternate full names, Roman numeral prefixes,
// ordinal prefixes, all-caps API variants, and common misspellings.
//
// Imported by bible-api.js and search.js — define here once to keep both
// parsers in sync.

export const BOOK_ALIASES = {
    // Genesis
    'Gen': 'Genesis', 'Gn': 'Genesis',
    // Exodus
    'Ex': 'Exodus', 'Exo': 'Exodus', 'Exod': 'Exodus',
    // Leviticus
    'Lev': 'Leviticus', 'Lv': 'Leviticus',
    // Numbers
    'Num': 'Numbers', 'Nm': 'Numbers', 'Nu': 'Numbers',
    // Deuteronomy
    'Deut': 'Deuteronomy', 'Deu': 'Deuteronomy', 'Dt': 'Deuteronomy',
    // Joshua
    'Josh': 'Joshua', 'Jos': 'Joshua',
    // Judges
    'Judg': 'Judges', 'Jdg': 'Judges', 'Jg': 'Judges',
    // Ruth
    'Rth': 'Ruth',
    // 1 Samuel
    '1 Sam': '1 Samuel', '1Sam': '1 Samuel', '1Sa': '1 Samuel', '1S': '1 Samuel',
    'I Samuel': '1 Samuel', 'I Sam': '1 Samuel', '1st Samuel': '1 Samuel',
    // 2 Samuel
    '2 Sam': '2 Samuel', '2Sam': '2 Samuel', '2Sa': '2 Samuel', '2S': '2 Samuel',
    'II Samuel': '2 Samuel', 'II Sam': '2 Samuel', '2nd Samuel': '2 Samuel',
    // 1 Kings
    '1 Kgs': '1 Kings', '1Kgs': '1 Kings', '1Ki': '1 Kings', '1Kin': '1 Kings',
    'I Kings': '1 Kings', '1st Kings': '1 Kings',
    // 2 Kings
    '2 Kgs': '2 Kings', '2Kgs': '2 Kings', '2Ki': '2 Kings', '2Kin': '2 Kings',
    'II Kings': '2 Kings', '2nd Kings': '2 Kings',
    // 1 Chronicles
    '1 Chr': '1 Chronicles', '1Chr': '1 Chronicles', '1Ch': '1 Chronicles',
    '1 Chron': '1 Chronicles', 'I Chronicles': '1 Chronicles', '1st Chronicles': '1 Chronicles',
    // 2 Chronicles
    '2 Chr': '2 Chronicles', '2Chr': '2 Chronicles', '2Ch': '2 Chronicles',
    '2 Chron': '2 Chronicles', 'II Chronicles': '2 Chronicles', '2nd Chronicles': '2 Chronicles',
    // Ezra
    'Ezr': 'Ezra',
    // Nehemiah
    'Neh': 'Nehemiah',
    // Esther
    'Est': 'Esther', 'Esth': 'Esther',
    // Job
    'Jb': 'Job',
    // Psalm / Psalms — PSALMS covers all-caps variants returned by some Bible APIs
    'Psalms': 'Psalm', 'Psa': 'Psalm', 'Ps': 'Psalm', 'PSALM': 'Psalm', 'PSALMS': 'Psalm',
    // Proverbs
    'Prov': 'Proverbs', 'Pro': 'Proverbs', 'Prv': 'Proverbs',
    // Ecclesiastes
    'Eccl': 'Ecclesiastes', 'Ecc': 'Ecclesiastes', 'Qoh': 'Ecclesiastes', 'Qoheleth': 'Ecclesiastes',
    // Song of Solomon — longest-first sort in ALIAS_PATTERNS ensures "Song of Songs"
    // is tried before "Songs" and "Song".
    'Song of Songs': 'Song of Solomon', 'Song Of Solomon': 'Song of Solomon',
    'Canticles': 'Song of Solomon', 'Songs': 'Song of Solomon',
    'Song': 'Song of Solomon', 'SOS': 'Song of Solomon', 'SS': 'Song of Solomon',
    'Cant': 'Song of Solomon',
    // Isaiah
    'Isa': 'Isaiah', 'Is': 'Isaiah',
    // Jeremiah
    'Jer': 'Jeremiah',
    // Lamentations
    'Lam': 'Lamentations',
    // Ezekiel
    'Ezek': 'Ezekiel', 'Eze': 'Ezekiel', 'Ezk': 'Ezekiel',
    // Daniel
    'Dan': 'Daniel', 'Dn': 'Daniel',
    // Hosea
    'Hos': 'Hosea',
    // Joel
    'Jl': 'Joel',
    // Amos — 'Am' is only two chars; the lookahead (?=\s+\d) prevents false matches.
    'Am': 'Amos',
    // Obadiah
    'Obad': 'Obadiah', 'Ob': 'Obadiah',
    // Jonah
    'Jon': 'Jonah',
    // Micah
    'Mic': 'Micah',
    // Nahum
    'Nah': 'Nahum',
    // Habakkuk
    'Hab': 'Habakkuk', 'Habbakuk': 'Habakkuk', 'Habakuk': 'Habakkuk',
    // Zephaniah
    'Zeph': 'Zephaniah', 'Zep': 'Zephaniah',
    // Haggai
    'Hag': 'Haggai',
    // Zechariah
    'Zech': 'Zechariah', 'Zec': 'Zechariah',
    // Malachi
    'Mal': 'Malachi',
    // Matthew
    'Matt': 'Matthew', 'Mt': 'Matthew',
    // Mark
    'Mk': 'Mark', 'Mrk': 'Mark',
    // Luke
    'Lk': 'Luke', 'Luk': 'Luke',
    // John
    'Jn': 'John', 'Jhn': 'John',
    // Acts
    'Act': 'Acts',
    // Romans
    'Rom': 'Romans', 'Rm': 'Romans',
    // 1 Corinthians
    '1 Cor': '1 Corinthians', '1Cor': '1 Corinthians', '1Co': '1 Corinthians',
    'I Corinthians': '1 Corinthians', '1st Corinthians': '1 Corinthians',
    // 2 Corinthians
    '2 Cor': '2 Corinthians', '2Cor': '2 Corinthians', '2Co': '2 Corinthians',
    'II Corinthians': '2 Corinthians', '2nd Corinthians': '2 Corinthians',
    // Galatians
    'Gal': 'Galatians',
    // Ephesians
    'Eph': 'Ephesians',
    // Philippians
    'Phil': 'Philippians', 'Php': 'Philippians',
    // Colossians
    'Col': 'Colossians',
    // 1 Thessalonians
    '1 Thess': '1 Thessalonians', '1Thess': '1 Thessalonians', '1Th': '1 Thessalonians',
    '1 Thes': '1 Thessalonians', 'I Thessalonians': '1 Thessalonians', '1st Thessalonians': '1 Thessalonians',
    // 2 Thessalonians
    '2 Thess': '2 Thessalonians', '2Thess': '2 Thessalonians', '2Th': '2 Thessalonians',
    '2 Thes': '2 Thessalonians', 'II Thessalonians': '2 Thessalonians', '2nd Thessalonians': '2 Thessalonians',
    // 1 Timothy
    '1 Tim': '1 Timothy', '1Tim': '1 Timothy', '1Ti': '1 Timothy',
    'I Timothy': '1 Timothy', '1st Timothy': '1 Timothy',
    // 2 Timothy
    '2 Tim': '2 Timothy', '2Tim': '2 Timothy', '2Ti': '2 Timothy',
    'II Timothy': '2 Timothy', '2nd Timothy': '2 Timothy',
    // Titus
    'Tit': 'Titus',
    // Philemon
    'Phlm': 'Philemon', 'Phm': 'Philemon',
    // Hebrews
    'Heb': 'Hebrews',
    // James
    'Jas': 'James', 'Jm': 'James',
    // 1 Peter
    '1 Pet': '1 Peter', '1Pet': '1 Peter', '1Pe': '1 Peter',
    'I Peter': '1 Peter', '1st Peter': '1 Peter',
    // 2 Peter
    '2 Pet': '2 Peter', '2Pet': '2 Peter', '2Pe': '2 Peter',
    'II Peter': '2 Peter', '2nd Peter': '2 Peter',
    // 1 John
    '1 Jn': '1 John', '1Jn': '1 John', '1Jo': '1 John',
    'I John': '1 John', '1st John': '1 John',
    // 2 John
    '2 Jn': '2 John', '2Jn': '2 John', '2Jo': '2 John',
    'II John': '2 John', '2nd John': '2 John',
    // 3 John
    '3 Jn': '3 John', '3Jn': '3 John', '3Jo': '3 John',
    'III John': '3 John', '3rd John': '3 John',
    // Jude
    'Jud': 'Jude',
    // Revelation
    'Rev': 'Revelation', 'Rv': 'Revelation', 'Apocalypse': 'Revelation',
    'Revelations': 'Revelation',
};

// Pre-compiled patterns sorted longest-first so multi-word aliases like
// "Song of Songs" are tried before shorter ones like "Song".
// The lookahead (?=\s+\d) anchors the match to the book/chapter boundary
// so "Is" doesn't match "Isaiah" mid-string and "Jn" doesn't match "John".
export const ALIAS_PATTERNS = Object.entries(BOOK_ALIASES)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([alias, canonical]) => [
        new RegExp(
            '^' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s+\\d)',
            'i'
        ),
        canonical,
    ]);

/**
 * If `str` starts with a known book alias followed by a chapter number,
 * replace the alias with the canonical book name and return the result.
 * Returns `str` unchanged if no alias matches.
 *
 * @param {string} str
 * @returns {string}
 */
export function normaliseBookAlias(str) {
    for (const [re, canonical] of ALIAS_PATTERNS) {
        const m = str.match(re);
        if (m) return canonical + str.slice(m[0].length);
    }
    return str;
}
