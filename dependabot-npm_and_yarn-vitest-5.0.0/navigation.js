// navigation.js
// Chapter and verse navigation helpers.
// All functions accept an `app` instance as their first argument.

/**
 * Updates the book/chapter span text and enables/disables the prev/next
 * chapter buttons based on the current position in the canon.
 * @param {object} app
 */
export function updateNavigationState(app) {
    const book = app.state.currentBook;
    const abbr = app.bookAbbreviations[book] || book;
    const full = app.getDisplayName(book);

    const abbrEl = app.currentBookSpan.querySelector('.book-abbr');
    const fullEl = app.currentBookSpan.querySelector('.book-full');

    if (abbrEl && fullEl) {
        abbrEl.textContent = abbr;
        fullEl.textContent = full;
    } else {
        // Fallback for any environment where the child spans are missing
        app.currentBookSpan.textContent = abbr;
    }

    app.currentChapterSpan.textContent = app.state.currentChapter;
    const chapterEquivalent = app.getChapterEquivalent?.(book, app.state.currentChapter);
    const chapterLabel = chapterEquivalent
        ? `${full} ${app.state.currentChapter} (${chapterEquivalent})`
        : `${full} ${app.state.currentChapter}`;
    app.chapterSelector?.setAttribute('title', chapterLabel);
    app.chapterSelector?.setAttribute('aria-label', chapterLabel);

    const books = app.getAllBooks();
    const currentBookIndex = books.indexOf(book);
    const isFirstChapter = app.state.currentChapter === 1;
    const isLastChapter = app.state.currentChapter === app.getChapterCount(book);

    if (app.prevChapterBtn) app.prevChapterBtn.disabled = currentBookIndex === 0 && isFirstChapter;
    if (app.nextChapterBtn) app.nextChapterBtn.disabled = currentBookIndex === books.length - 1 && isLastChapter;
}

function getCurrentVerseIds(app) {
    return Array.from(
        app.passageText.querySelectorAll('.verse[data-verse]'),
        (verse) => {
            const raw = verse.dataset.verse;
            return /^\d+$/.test(raw) ? Number(raw) : raw.toLowerCase();
        }
    );
}

/**
 * Scrolls to the next verse in the current chapter, or advances to the
 * next chapter if already on the last verse.
 * @param {object} app
 */
export function navigateToNextVerse(app) {
    const verses = getCurrentVerseIds(app);
    const currentIndex = app.state.selectedVerse == null
        ? 0
        : verses.findIndex((verse) => String(verse) === String(app.state.selectedVerse));

    if (currentIndex < verses.length - 1) {
        app.scrollToVerse(verses[currentIndex + 1]);
    } else {
        app.navigateChapter(1);
    }
}

/**
 * Scrolls to the previous verse in the current chapter, or goes back to
 * the last verse of the previous chapter (or previous book) if already
 * on verse 1.
 * @param {object} app
 */
export function navigateToPreviousVerse(app) {
    const verses = getCurrentVerseIds(app);
    const currentIndex = app.state.selectedVerse == null
        ? 0
        : verses.findIndex((verse) => String(verse) === String(app.state.selectedVerse));

    if (currentIndex > 0) {
        app.scrollToVerse(verses[currentIndex - 1]);
        return;
    }

    const books = app.getAllBooks();
    const currentBookIndex = books.indexOf(app.state.currentBook);
    const isFirstChapter = app.state.currentChapter === 1;

    if (currentBookIndex === 0 && isFirstChapter) return;

    let newChapter = app.state.currentChapter - 1;
    let newBook = app.state.currentBook;

    if (newChapter < 1) {
        newBook = books[currentBookIndex - 1];
        newChapter = app.getChapterCount(newBook);
    }

    app.state.selectedVerse = null;
    app.loadPassage(newBook, newChapter);
}
