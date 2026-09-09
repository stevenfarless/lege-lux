// keyboard.js
// Global keyboard shortcut handler for BibleApp.

import './search-index-engine.js';

/**
 * @param {object} app - BibleApp instance
 * @param {KeyboardEvent} e
 */
export function handleKeyboardShortcuts(app, e) {
    // Search toggle
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        app.toggleSearch();
        return;
    }

    // Dismiss the active overlay, then clear verse selection when none is open.
    if (e.key === 'Escape') {
        const activeModal = [
            app.bookModal, app.chapterModal, app.helpModal,
            app.settingsModal, app.loginModal, app.signupModal,
            app.userMenuModal, app.verseModal, app.referencesModal,
            app.translationModal, app.translationSyncModal,
        ].find((modal) => modal?.classList.contains('active'));

        if (activeModal) {
            app.closeModal(activeModal);
            return;
        }

        if (app.searchContainer?.classList.contains('active')) {
            app.closeSearch();
            return;
        }

        if (app.state.selectedVerse !== null) {
            e.preventDefault();
            app.state.selectedVerse = null;
            app.applyVerseGlow();
        }

        return;
    }

    // Translation modal keyboard navigation — runs before the generic modal guard
    if (app.translationModal?.classList.contains('active')) {
        switch (e.key) {
            case 'ArrowDown':
            case 'j':
                e.preventDefault();
                app.translationKbMove(1);
                return;
            case 'ArrowUp':
            case 'k':
                e.preventDefault();
                app.translationKbMove(-1);
                return;
            case 'Enter':
                e.preventDefault();
                app.translationKbSelect();
                return;
        }
        return; // swallow all other keys while translation modal is open
    }

    // Navigation and reading shortcuts — only when no modal/search is open
    const modalOpen = !!document.querySelector('.modal.active');
    const searchOpen = !!app.searchContainer?.classList.contains('active');
    if (modalOpen || searchOpen) return;

    switch (e.key) {
        case 'Enter':
            if (app.state.selectedVerse !== null) {
                e.preventDefault();
                app.toggleVerseTray();
            }
            break;
        case '/':
            e.preventDefault();
            app.toggleSearch();
            break;
        case 't':
            e.preventDefault();
            app.openTranslationModal();
            break;
        case 'ArrowLeft':
        case 'h':
            e.preventDefault();
            app.navigateChapter(-1);
            break;
        case 'ArrowRight':
        case 'l':
            e.preventDefault();
            app.navigateChapter(1);
            break;
        case 'ArrowUp':
        case 'k':
            e.preventDefault();
            app.navigateToPreviousVerse();
            break;
        case 'ArrowDown':
        case 'j':
            e.preventDefault();
            app.navigateToNextVerse();
            break;
        case 'n':
            e.preventDefault();
            if (app.verseNumbersToggle) {
                app.verseNumbersToggle.checked = !app.verseNumbersToggle.checked;
                app.toggleSetting('showVerseNumbers');
            }
            break;
        case 'v':
            e.preventDefault();
            if (app.verseByVerseToggle) {
                app.verseByVerseToggle.checked = !app.verseByVerseToggle.checked;
                app.toggleVerseByVerse();
            }
            break;
        case 's':
            e.preventDefault();
            if (app.headingsToggle) {
                app.headingsToggle.checked = !app.headingsToggle.checked;
                app.toggleSetting('showHeadings');
            }
            break;
    }
}
