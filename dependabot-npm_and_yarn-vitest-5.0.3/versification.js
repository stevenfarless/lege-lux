// Translation versification helpers.
// Native translation numbering remains authoritative; equivalence metadata is
// used only for display and for preserving the same passage when translations
// use different chapter/verse schemes.

const DEFAULT_SCHEME = 'protestant';

function schemeOf(meta) {
    return meta?.versification?.scheme || DEFAULT_SCHEME;
}

function baselineSchemeOf(meta) {
    return meta?.versification?.baselineScheme || DEFAULT_SCHEME;
}

function bookMap(meta, book) {
    return meta?.versification?.books?.[book] || null;
}

function numericVerse(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = String(value ?? '');
    return /^\d+$/.test(raw) ? Number(raw) : null;
}

function chapterEntry(meta, book, chapter) {
    return bookMap(meta, book)?.chapters?.[String(chapter)] || null;
}

export function getChapterEquivalent(meta, book, chapter) {
    return chapterEntry(meta, book, chapter)?.label || null;
}

export function formatPassageTitle(meta, displayName, book, chapter) {
    const nativeTitle = `${displayName} ${chapter}`;
    const equivalent = getChapterEquivalent(meta, book, chapter);
    return equivalent ? `${nativeTitle} (${equivalent})` : nativeTitle;
}

function mapNativeToBaseline(meta, reference) {
    if (!meta?.versification || schemeOf(meta) === DEFAULT_SCHEME) {
        return { ...reference };
    }
    if (baselineSchemeOf(meta) !== DEFAULT_SCHEME) return { ...reference };

    const entry = chapterEntry(meta, reference.book, reference.chapter);
    if (!entry) return { ...reference };
    if (!Array.isArray(entry.baselineChapters) || entry.baselineChapters.length === 0) {
        return null;
    }

    const verse = numericVerse(reference.verse);
    if (verse !== null && Array.isArray(entry.segments)) {
        const segment = entry.segments.find((candidate) => (
            verse >= candidate.nativeVerseStart && verse <= candidate.nativeVerseEnd
        ));
        if (segment) {
            return {
                book: reference.book,
                chapter: segment.baselineChapter,
                verse: verse + (segment.verseOffsetToBaseline || 0),
            };
        }
    }

    return {
        book: reference.book,
        chapter: entry.baselineChapters[0],
        verse: reference.verse ?? null,
    };
}

function mapBaselineToNative(meta, reference) {
    if (!meta?.versification || schemeOf(meta) === DEFAULT_SCHEME) {
        return { ...reference };
    }
    if (baselineSchemeOf(meta) !== DEFAULT_SCHEME) return { ...reference };

    const chapters = bookMap(meta, reference.book)?.chapters;
    if (!chapters) return { ...reference };

    const verse = numericVerse(reference.verse);
    const candidates = [];

    for (const [nativeChapter, entry] of Object.entries(chapters)) {
        if (!Array.isArray(entry.baselineChapters)
            || !entry.baselineChapters.includes(reference.chapter)) continue;

        let exactVerse = null;
        if (verse !== null && Array.isArray(entry.segments)) {
            const segment = entry.segments.find((candidate) => (
                candidate.baselineChapter === reference.chapter
                && verse >= candidate.baselineVerseStart
                && verse <= candidate.baselineVerseEnd
            ));
            if (segment) {
                exactVerse = verse - (segment.verseOffsetToBaseline || 0);
            }
        }

        candidates.push({
            chapter: Number(nativeChapter),
            verse: exactVerse,
            exact: exactVerse !== null,
            priority: Number(entry.reversePriority || 0),
        });
    }

    if (candidates.length === 0) return { ...reference };

    candidates.sort((a, b) => Number(b.exact) - Number(a.exact)
        || a.priority - b.priority
        || a.chapter - b.chapter);

    const selected = candidates[0];
    return {
        book: reference.book,
        chapter: selected.chapter,
        verse: selected.exact ? selected.verse : (reference.verse ?? null),
    };
}

export function mapReferenceBetweenMetas(fromMeta, toMeta, reference) {
    if (!reference?.book || !reference?.chapter) return null;
    if (schemeOf(fromMeta) === schemeOf(toMeta)) return { ...reference };

    const baseline = mapNativeToBaseline(fromMeta, reference);
    if (!baseline) return null;
    return mapBaselineToNative(toMeta, baseline);
}
