// modals.js
// Modal open/close, population, and drag-to-resize for BibleApp.

import { LOCAL_TRANSLATIONS, PRECACHED_TRANSLATIONS } from './bible-api.js';
import { idbDeleteTranslation } from './translation-store.js';

// ── Open / close ─────────────────────────────────────────────────────────────

const _modalFocusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const _modalFocusOrigins = new WeakMap();
const _modalBackgroundStates = new Map();

function _getModalHeading(modal) {
    const labelledBy = modal.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelledHeading = document.getElementById(labelledBy);
        if (labelledHeading) return labelledHeading;
    }
    return modal.querySelector('h1, h2, h3, h4, h5, h6');
}

function _ensureModalSemantics(modal) {
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const heading = _getModalHeading(modal);
    if (!heading) return;

    if (!heading.id) {
        heading.id = `${modal.id || 'modal'}Title`;
    }
    modal.setAttribute('aria-labelledby', heading.id);
}

function _getTopActiveModal() {
    const active = document.querySelectorAll('.modal.active:not(.closing)');
    return active.length > 0 ? active[active.length - 1] : null;
}

function _rememberBackgroundState(element) {
    if (_modalBackgroundStates.has(element)) return;
    _modalBackgroundStates.set(element, {
        inert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
    });
}

function _restoreBackgroundState(element) {
    const state = _modalBackgroundStates.get(element);
    if (!state) return;

    element.inert = state.inert;
    if (state.ariaHidden === null) {
        element.removeAttribute('aria-hidden');
    } else {
        element.setAttribute('aria-hidden', state.ariaHidden);
    }
    _modalBackgroundStates.delete(element);
}

function _syncModalIsolation() {
    const activeModal = _getTopActiveModal();

    for (const child of document.body.children) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.tagName === 'SCRIPT' || child.id === 'toast') continue;

        const isModal = child.classList.contains('modal');

        if (activeModal && child === activeModal) {
            if (!isModal) _restoreBackgroundState(child);
            child.inert = false;
            child.removeAttribute('aria-hidden');
            continue;
        }

        if (activeModal) {
            if (!isModal) _rememberBackgroundState(child);
            child.inert = true;
            child.setAttribute('aria-hidden', 'true');
            continue;
        }

        if (isModal) {
            child.inert = true;
            child.setAttribute('aria-hidden', 'true');
        } else {
            _restoreBackgroundState(child);
        }
    }

    if (activeModal) {
        document.addEventListener('focusin', _enforceModalFocus, true);
    } else {
        document.removeEventListener('focusin', _enforceModalFocus, true);
    }
}

function _getModalFocusableElements(modal) {
    return Array.from(modal.querySelectorAll(_modalFocusableSelector)).filter((element) => (
        element instanceof HTMLElement
        && !element.hidden
        && !element.inert
        && element.getAttribute('aria-hidden') !== 'true'
        && element.getClientRects().length > 0
    ));
}

function _focusModal(modal) {
    if (!modal.hasAttribute('tabindex')) {
        modal.setAttribute('tabindex', '-1');
    }

    modal.focus({ preventScroll: true });
}

function _enforceModalFocus(event) {
    const activeModal = _getTopActiveModal();
    if (!activeModal || activeModal.contains(event.target)) return;

    event.stopPropagation();
    _focusModal(activeModal);
}

function _trapModalFocus(event) {
    if (event.key !== 'Tab') return;

    const modal = event.currentTarget;
    const focusable = _getModalFocusableElements(modal);

    if (focusable.length === 0) {
        event.preventDefault();
        _focusModal(modal);
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !modal.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
        return;
    }

    if (!event.shiftKey && (active === last || !modal.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
    }
}

function _resolveFocusOrigin(origin) {
    let target = origin;

    while (target instanceof HTMLElement) {
        const containingModal = target.closest('.modal');
        if (!containingModal || containingModal.classList.contains('active')) return target;

        target = _modalFocusOrigins.get(containingModal);
        _modalFocusOrigins.delete(containingModal);
    }

    return null;
}

function _isRestorableFocusTarget(target) {
    return target instanceof HTMLElement
        && target.isConnected
        && !target.hidden
        && !target.inert
        && target.getClientRects().length > 0
        && !target.closest('[hidden], [inert], [aria-hidden="true"]');
}

function _restoreModalFocus(modal) {
    const origin = _modalFocusOrigins.get(modal);
    modal.removeEventListener('keydown', _trapModalFocus);

    const activeModal = _getTopActiveModal();
    if (activeModal && activeModal !== modal) {
        _modalFocusOrigins.delete(modal);

        if (
            _isRestorableFocusTarget(origin) &&
            activeModal.contains(origin)
        ) {
            origin.focus({ preventScroll: true });
        } else {
            _focusModal(activeModal);
        }
        return;
    }

    _modalFocusOrigins.delete(modal);
    const target = _resolveFocusOrigin(origin);
    if (!_isRestorableFocusTarget(target)) return;
    target.focus({ preventScroll: true });
}

function _finishModalClose(modal) {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && modal.contains(focused)) {
        focused.blur();
    }

    modal.classList.remove('active', 'closing');
    modal.inert = true;
    modal.setAttribute('aria-hidden', 'true');
    _maybeRemoveModalOpen();
    _syncModalIsolation();
    _restoreModalFocus(modal);
}

export function openModal(app, modal) {
    if (!modal) return;

    _ensureModalSemantics(modal);

    if (!modal.classList.contains('active')) {
        const active = document.activeElement;
        _modalFocusOrigins.set(
            modal,
            active instanceof HTMLElement && active !== document.body ? active : null
        );
    }

    modal.classList.remove('closing');
    modal.inert = false;
    modal.removeAttribute('aria-hidden');
    modal.addEventListener('keydown', _trapModalFocus);
    modal.classList.add('active');
    document.body.classList.add('modal-open');

    _focusModal(modal);
    _syncModalIsolation();
}

export function closeModal(app, modal) {
    if (!modal || !modal.classList.contains('active')) return;
    if (modal.classList.contains('closing')) return;

    if (modal === app.settingsModal) {
        app.hideSyncPrompt?.();
    }

    if (modal === app.translationSyncModal) {
        app.dismissTranslationSyncForSession?.();
    }

    if (modal === app.translationModal) {
        _translationKbClear(app);
    }

    if (modal === app.settingsModal || modal === app.referencesModal) {
        modal.classList.add('closing');

        if (modal === app.settingsModal) {
            setTimeout(() => {
                _finishModalClose(modal);
                app.maybeShowTranslationSyncModal?.();
            }, 320);
        } else {
            const content = modal.querySelector('.modal-content');
            content.style.animation = 'slideDownToBottom 250ms ease';
            setTimeout(() => {
                _finishModalClose(modal);
                content.style.animation = '';
                app.maybeShowTranslationSyncModal?.();
            }, 250);
        }
    } else {
        _finishModalClose(modal);
        queueMicrotask(() => app.maybeShowTranslationSyncModal?.());
    }
}

function _maybeRemoveModalOpen() {
    if (!document.querySelector('.modal.active:not(.closing)')) {
        document.body.classList.remove('modal-open');
    }
}

// ── Reference picker modal ───────────────────────────────────────────────────

const BOOK_TESTAMENT_FILTERS = [
    { testament: 'Old Testament', label: 'Old Testament' },
    { testament: 'Deuterocanon', label: 'Apocrypha' },
    { testament: 'New Testament', label: 'New Testament' },
];

function _referencePickerScrollElement(app) {
    return app.referencePickerView?.closest('.modal-body') || app.referencePickerView;
}

function _rememberReferencePickerScroll(app) {
    const draft = app.referencePickerDraft;
    const scrollElement = _referencePickerScrollElement(app);
    if (!draft || !scrollElement) return;
    draft.viewScroll = draft.viewScroll || {};
    draft.viewScroll[draft.view] = scrollElement.scrollTop || 0;
}

function _restoreReferencePickerScroll(app) {
    const draft = app.referencePickerDraft;
    const scrollElement = _referencePickerScrollElement(app);
    if (!draft || !scrollElement) return;
    scrollElement.scrollTop = draft.viewScroll?.[draft.view] || 0;
}

function _setReferencePickerFiltersVisible(app, visible) {
    if (!app.referencePickerFilters) return;
    app.referencePickerFilters.hidden = !visible;
    if (!visible) app.referencePickerFilters.innerHTML = '';
}

function _updateReferencePickerHeader(app) {
    const draft = app.referencePickerDraft;
    if (!draft || !app.referencePickerTitle || !app.referencePickerSubtitle) return;

    const view = draft.view;
    const book = draft.book || app.state.currentBook;
    const chapter = draft.chapter || app.state.currentChapter;

    let title = 'Book';
    let subtitle = '';

    if (view === 'chapter') {
        title = 'Chapter';
        subtitle = app.getDisplayName(book);
    } else if (view === 'verse') {
        title = 'Verse';
        subtitle = app.getDisplayName(book) + ' ' + chapter;
    }

    app.referencePickerTitle.textContent = title;
    app.referencePickerSubtitle.textContent = subtitle;
    app.referencePickerSubtitle.hidden = subtitle === '';

    const canGoBack =
        (view === 'chapter' && draft.entryView === 'book') ||
        (view === 'verse' && draft.entryView !== 'verse');

    if (app.referencePickerBack) app.referencePickerBack.hidden = !canGoBack;
}

function _focusReferencePicker(app) {
    requestAnimationFrame(() => {
        if (!app.referencePickerModal?.classList.contains('active')) return;
        app.referencePickerModal.focus({ preventScroll: true });
    });
}

function _transitionReferencePickerView(app, renderNextView, { animate = true, direction = 'forward' } = {}) {
    const view = app.referencePickerView;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!view || !animate || reduceMotion) {
        renderNextView();
        _restoreReferencePickerScroll(app);
        _focusReferencePicker(app);
        return;
    }

    requestAnimationFrame(() => {
        renderNextView();
        _restoreReferencePickerScroll(app);

        view.classList.add(direction === 'back'
            ? 'reference-picker-view--enter-back'
            : 'reference-picker-view--enter-forward');

        requestAnimationFrame(() => {
            view.classList.remove('reference-picker-view--enter-forward', 'reference-picker-view--enter-back');
            _focusReferencePicker(app);
        });
    });
}

function _renderReferencePickerView(app, view, { animate = true, direction = 'forward' } = {}) {
    const draft = app.referencePickerDraft;
    if (!draft || !app.referencePickerView) return;

    const previousView = draft.view;
    _rememberReferencePickerScroll(app);
    draft.view = view;

    if (previousView && previousView !== view) {
        app._dbgEvent?.('picker view changed: ' + previousView + ' -> ' + view);
    }

    _transitionReferencePickerView(app, () => {
        _updateReferencePickerHeader(app);
        if (view === 'book') _renderBookPickerView(app);
        if (view === 'chapter') _renderChapterPickerView(app);
        if (view === 'verse') _renderVersePickerView(app);
    }, { animate, direction });
}

export function openReferencePicker(app, options = {}) {
    const view = options.view || 'book';
    app.referencePickerDraft = {
        entryView: view,
        view,
        book: options.book || app.state.currentBook,
        chapter: options.chapter || app.state.currentChapter,
        viewScroll: { book: 0, chapter: 0, verse: 0 },
    };

    app._dbgUserAction?.('picker opened: ' + view);
    app._dbgEvent?.('picker opened: ' + view);

    _renderReferencePickerView(app, view, { animate: false });
    openModal(app, app.referencePickerModal);
}

export function closeReferencePicker(app) {
    app.referencePickerDraft = null;
    closeModal(app, app.referencePickerModal);
}

export function goBackReferencePicker(app) {
    const draft = app.referencePickerDraft;
    if (!draft) return;

    if (draft.view === 'verse' && draft.entryView !== 'verse') {
        _renderReferencePickerView(app, 'chapter', { animate: true, direction: 'back' });
        return;
    }

    if (draft.view === 'chapter' && draft.entryView === 'book') {
        _renderReferencePickerView(app, 'book', { animate: true, direction: 'back' });
        return;
    }

    closeReferencePicker(app);
}

export function openBookModal(app) {
    openReferencePicker(app, { view: 'book' });
}

export function openChapterModal(app) {
    openReferencePicker(app, {
        view: 'chapter',
        book: app.state.currentBook,
        chapter: app.state.currentChapter,
    });
}

export function openVerseModal(app) {
    openReferencePicker(app, {
        view: 'verse',
        book: app.state.currentBook,
        chapter: app.state.currentChapter,
    });
}

export function populateBookModal(app) {
    if (!app.referencePickerDraft) return;
    _renderReferencePickerView(app, 'book', { animate: false });
}

export function populateChapterModal(app) {
    if (!app.referencePickerDraft) return;
    _renderReferencePickerView(app, 'chapter', { animate: false });
}

export function populateVerseModal(app) {
    if (!app.referencePickerDraft) return;
    _renderReferencePickerView(app, 'verse', { animate: false });
}

function _renderBookPickerView(app) {
    const modalBody = app.referencePickerView;
    const filterBar = app.referencePickerFilters;
    if (!modalBody || !filterBar) return;

    modalBody.className = 'reference-picker-view reference-picker-view--book';
    modalBody.innerHTML = '';
    filterBar.innerHTML = '';
    _setReferencePickerFiltersVisible(app, true);
    modalBody.classList.remove('book-testament-filter-active');

    const sections = new Map();
    const filterButtons = new Map();
    let activeTestament = null;

    const applyFilter = (testament) => {
        activeTestament = activeTestament === testament ? null : testament;

        for (const [sectionTestament, section] of sections) {
            const isVisibleSection = activeTestament === null || sectionTestament === activeTestament;
            section.hidden = !isVisibleSection;
            section.classList.toggle(
                'book-category--hide-filter-heading',
                activeTestament !== null
                && sectionTestament === activeTestament
                && sectionTestament !== 'Deuterocanon'
            );
        }

        for (const [buttonTestament, button] of filterButtons) {
            const isActive = buttonTestament === activeTestament;
            button.classList.toggle('book-testament-filter--active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        }

        modalBody.classList.toggle('book-testament-filter-active', activeTestament !== null);
        const scrollElement = _referencePickerScrollElement(app);
        if (scrollElement) scrollElement.scrollTop = 0;
    };

    for (const { testament, label } of BOOK_TESTAMENT_FILTERS) {
        const books = app.bibleBooks[testament];
        if (!books || Object.keys(books).length === 0) continue;

        const button = document.createElement('button');
        button.className = 'book-testament-filter';
        button.type = 'button';
        button.textContent = label;
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => applyFilter(testament));

        filterButtons.set(testament, button);
        filterBar.appendChild(button);
    }

    const createBookButton = (book) => {
        const button = document.createElement('button');
        button.className = 'book-item';
        button.type = 'button';
        button.textContent = app.bookAbbreviations[book] || book;
        button.addEventListener('click', () => {
            app._dbgUserAction?.('picker selected book: ' + book);
            app._dbgEvent?.('picker selected book: ' + book + ' -> chapter picker');
            app.referencePickerDraft.book = book;
            app.referencePickerDraft.chapter = 1;
            app.state.selectedVerse = null;
            _renderReferencePickerView(app, 'chapter', { animate: true, direction: 'forward' });
        });
        return button;
    };

    for (const [testament, books] of Object.entries(app.bibleBooks)) {
        const section = document.createElement('div');
        section.className = 'book-category';
        section.dataset.testament = testament;

        const heading = document.createElement('h3');
        heading.textContent = testament === 'Deuterocanon'
            ? 'Apocrypha / Deuterocanon'
            : testament;

        if (testament === 'Deuterocanon') {
            const infoButton = document.createElement('button');
            infoButton.className = 'deuterocanon-info-btn';
            infoButton.type = 'button';
            infoButton.setAttribute('aria-label', 'About the Deuterocanon');
            infoButton.textContent = '?';
            infoButton.addEventListener('click', (event) => {
                event.stopPropagation();
                openDeuterocanonInfoModal(app);
            });
            heading.appendChild(infoButton);
        }
        section.appendChild(heading);

        const grid = document.createElement('div');
        grid.className = 'book-grid';

        for (const book of Object.keys(books)) {
            grid.appendChild(createBookButton(book));
        }

        section.appendChild(grid);
        sections.set(testament, section);
        modalBody.appendChild(section);
    }
}

function _renderChapterPickerView(app) {
    const view = app.referencePickerView;
    const draft = app.referencePickerDraft;
    if (!view || !draft) return;

    _setReferencePickerFiltersVisible(app, false);
    view.className = 'reference-picker-view reference-picker-view--chapter';
    view.innerHTML = '';

    const book = draft.book || app.state.currentBook;
    const chapterCount = app.getChapterCount(book);
    const grid = document.createElement('div');
    grid.className = 'chapter-grid';

    for (let i = 1; i <= chapterCount; i++) {
        const btn = document.createElement('button');
        btn.className = 'chapter-item';
        btn.type = 'button';
        const equivalent = app.getChapterEquivalent?.(book, i);
        if (equivalent) {
            const nativeNumber = document.createElement('span');
            nativeNumber.className = 'chapter-item-native';
            nativeNumber.textContent = i;
            const alternate = document.createElement('span');
            alternate.className = 'chapter-item-equivalent';
            alternate.textContent = equivalent;
            btn.append(nativeNumber, alternate);
            btn.setAttribute('aria-label', `${book} ${i}, ${equivalent}`);
        } else {
            btn.textContent = i;
        }
        btn.classList.toggle(
            'picker-item--active',
            book === app.state.currentBook && i === app.state.currentChapter
        );
        btn.addEventListener('click', async () => {
            app._dbgUserAction?.('picker selected chapter: ' + book + ' ' + i);
            app._dbgEvent?.('picker navigation: loading ' + book + ' ' + i + ' from chapter picker');
            draft.book = book;
            draft.chapter = i;
            app.state.selectedVerse = null;
            await app.loadPassage(book, i, false, 'chapter-picker');
            _renderReferencePickerView(app, 'verse', { animate: true, direction: 'forward' });
        });
        grid.appendChild(btn);
    }

    view.appendChild(grid);
}

function _renderVersePickerView(app) {
    const view = app.referencePickerView;
    const draft = app.referencePickerDraft;
    if (!view || !draft) return;

    _setReferencePickerFiltersVisible(app, false);
    view.className = 'reference-picker-view reference-picker-view--verse';
    view.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'chapter-grid';
    const verseIds = Array.from(
        app.passageText.querySelectorAll('.verse[data-verse]'),
        (verse) => {
            const raw = verse.dataset.verse;
            return /^\d+$/.test(raw) ? Number(raw) : raw.toLowerCase();
        }
    );

    if (verseIds.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'reference-picker-empty';
        empty.textContent = 'No verses found in current passage';
        view.appendChild(empty);
        return;
    }

    if (draft.entryView !== 'verse') {
        const actions = document.createElement('div');
        actions.className = 'picker-actions picker-actions--top';

        const goButton = document.createElement('button');
        goButton.className = 'secondary-btn reference-picker-go';
        goButton.type = 'button';
        goButton.textContent = 'Go';
        goButton.addEventListener('click', () => {
            const targetBook = draft.book || app.state.currentBook;
            const targetChapter = draft.chapter || app.state.currentChapter;

            app._dbgUserAction?.('picker go: ' + targetBook + ' ' + targetChapter);
            app._dbgEvent?.('picker go from verse picker: ' + targetBook + ' ' + targetChapter);
            app.referencePickerDraft = null;
            app.state.selectedVerse = null;
            if (app.currentVerseSpan) app.currentVerseSpan.textContent = '1';
            app.applyVerseGlow?.();
            closeReferencePicker(app);
        });

        actions.appendChild(goButton);
        view.appendChild(actions);
    }

    const activeVerse = app.state.selectedVerse;

    for (const verseId of verseIds) {
        const btn = document.createElement('button');
        btn.className = 'chapter-item';
        btn.type = 'button';
        btn.textContent = verseId;
        btn.classList.toggle(
            'picker-item--active',
            String(verseId) === String(activeVerse)
        );
        btn.addEventListener('click', () => {
            app._dbgUserAction?.('picker selected verse: ' + app.state.currentBook + ' ' + app.state.currentChapter + ':' + verseId);
            app._dbgEvent?.('picker selected verse: ' + app.state.currentBook + ' ' + app.state.currentChapter + ':' + verseId);
            app.referencePickerDraft = null;
            app.scrollToVerse(verseId);
            closeReferencePicker(app);
        });
        grid.appendChild(btn);
    }

    view.appendChild(grid);
}

// ── Deuterocanon info modal ───────────────────────────────────────────────────

export function openDeuterocanonInfoModal(app) {
    const modal = document.getElementById('deuterocanonInfoModal');
    if (modal) {
        openModal(app, modal);
    } else {
        console.error('[DeutModal] element #deuterocanonInfoModal not found in DOM');
    }
}

export function getCurrentVerseCount(app) {
    return app.passageText.querySelectorAll('.verse-num').length;
}

// ── Translation modal ─────────────────────────────────────────────────────────

const _SVG_DOWNLOAD = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M11.29,16.71h0a1.15,1.15,0,0,0,.33.21.94.94,0,0,0,.76,0,1.15,1.15,0,0,0,.33-.21h0l4-4a1,1,0,0,0-1.42-1.42L13,13.59V3a1,1,0,0,0-2,0V13.59l-2.29-2.3a1,1,0,1,0-1.42,1.42Z"/><path d="M19,20H5a1,1,0,0,0,0,2H19a1,1,0,0,0,0-2Z"/></svg>`;

const _SVG_DOWNLOADED = `<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M34.459 1.375a2.999 2.999 0 0 0-4.149.884L13.5 28.17l-8.198-7.58a2.999 2.999 0 1 0-4.073 4.405l10.764 9.952s.309.266.452.359a2.999 2.999 0 0 0 4.15-.884L35.343 5.524a2.999 2.999 0 0 0-.884-4.149z"/></svg>`;

const _SVG_SPINNER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="translation-dl-spinner" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

const _SVG_TRASH = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 12L14 16M14 12L10 16M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const _downloading = new Set();
const _hasHover = window.matchMedia('(hover: hover)').matches;

const _FLY_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const _FLY_DURATION = '420ms';

export function openTranslationModal(app) {
    populateTranslationModal(app);
    openModal(app, app.translationModal);
    const items = _translationItems(app);
    const activeIdx = items.findIndex((li) => li.classList.contains('translation-modal-item--active'));
    app._translationKbIndex = activeIdx >= 0 ? activeIdx : 0;
    _translationKbApply(app, items);
}

export async function populateTranslationModal(app) {
    if (!app.translationList) return;
    app.translationList.innerHTML = '';

    const registry = app._translationRegistry || [];

    if (registry.length === 0) {
        const msg = document.createElement('li');
        msg.textContent = 'No translations available.';
        msg.style.padding = 'var(--spacing-md)';
        msg.style.color = 'var(--text-muted)';
        app.translationList.appendChild(msg);
        return;
    }

    const idbChecks = await Promise.all(
        registry.map((t) =>
            PRECACHED_TRANSLATIONS.has(t.id)
                ? Promise.resolve(true)
                : app.isTranslationAvailableOnDevice(t.id)
        )
    );

    const installed = [];
    const available = [];

    registry.forEach((t, i) => {
        if (idbChecks[i]) installed.push(t);
        else available.push(t);
    });

    installed.sort((a, b) => a.id.localeCompare(b.id));

    const appendSectionHeading = (label) => {
        const li = document.createElement('li');
        li.className = 'translation-modal-section-heading';
        li.textContent = label;
        li.setAttribute('role', 'presentation');
        app.translationList.appendChild(li);
    };

    const appendItem = (t, isPrecached, isDownloaded) => {
        const wrapper = document.createElement('li');
        wrapper.className = 'translation-modal-item-wrapper';

        const li = document.createElement('div');
        li.className = 'translation-modal-item';
        if (t.id === app.state.translation) li.classList.add('translation-modal-item--active');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'translation-modal-item__name';
        nameSpan.textContent = t.id;

        const descSpan = document.createElement('span');
        descSpan.className = 'translation-modal-item__desc';
        descSpan.textContent = t.name || '';

        li.appendChild(nameSpan);
        li.appendChild(descSpan);

        if (!isPrecached) {
            const iconEl = document.createElement('span');
            iconEl.className = 'translation-modal-item__status-icon';

            const progressWrap = document.createElement('div');
            progressWrap.className = 'translation-dl-progress';
            progressWrap.hidden = true;

            const progressTrack = document.createElement('div');
            progressTrack.className = 'translation-dl-progress__bar-track';

            const progressBar = document.createElement('div');
            progressBar.className = 'translation-dl-progress__bar';

            const progressLabel = document.createElement('span');
            progressLabel.className = 'translation-dl-progress__label';

            progressTrack.appendChild(progressBar);
            progressWrap.appendChild(progressTrack);
            progressWrap.appendChild(progressLabel);
            li.appendChild(iconEl);
            li.appendChild(progressWrap);

            if (_downloading.has(t.id)) {
                progressWrap.hidden = false;
                iconEl.innerHTML = _SVG_SPINNER;
                progressLabel.textContent = 'Downloading…';
                li.classList.add('translation-modal-item--downloading');
            } else if (isDownloaded) {
                li.classList.add('translation-modal-item--downloaded');
                iconEl.innerHTML = _SVG_DOWNLOADED;
            } else {
                iconEl.innerHTML = _SVG_DOWNLOAD;
            }

            li.addEventListener('click', () => {
                if (_downloading.has(t.id)) return;
                if (li.classList.contains('translation-modal-item--downloaded')) {
                    app.changeTranslation(t.id);
                    app.closeModal(app.translationModal);
                    return;
                }
                _handleTranslationSelect(app, t, li, iconEl, progressWrap, progressBar, progressLabel);
            });

            if (isDownloaded && !isPrecached) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'translation-modal-delete-btn';
                deleteBtn.setAttribute('aria-label', `Uninstall ${t.id}`);
                deleteBtn.innerHTML = _SVG_TRASH;
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    _handleUninstall(app, t, wrapper);
                });

                if (_hasHover) {
                    deleteBtn.classList.add('translation-modal-delete-btn--inline');
                    iconEl.classList.add('translation-modal-item__icon-wrap');
                    iconEl.appendChild(deleteBtn);
                } else {
                    wrapper.appendChild(deleteBtn);
                    _attachSwipe(wrapper, li);
                }
            }
        } else {
            li.addEventListener('click', () => {
                app.changeTranslation(t.id);
                app.closeModal(app.translationModal);
            });
        }

        wrapper.appendChild(li);
        app.translationList.appendChild(wrapper);
    };

    if (installed.length > 0) {
        appendSectionHeading('Installed');
        for (const t of installed) appendItem(t, PRECACHED_TRANSLATIONS.has(t.id), true);
    }

    if (available.length > 0) {
        appendSectionHeading('Available');
        for (const t of available) appendItem(t, false, false);
    }
}

async function _flyItem(app, t, sourceWrapper) {
    const fromRect = sourceWrapper.getBoundingClientRect();

    await populateTranslationModal(app);

    const targetWrapper = Array.from(app.translationList.querySelectorAll('.translation-modal-item-wrapper'))
        .find((w) => {
            const name = w.querySelector('.translation-modal-item__name');
            return name && name.textContent === t.id;
        });

    if (!targetWrapper) return;

    const toRect = targetWrapper.getBoundingClientRect();
    targetWrapper.style.opacity = '0';

    const clone = sourceWrapper.cloneNode(true);
    clone.style.cssText = [
        `position:fixed`,
        `top:${fromRect.top}px`,
        `left:${fromRect.left}px`,
        `width:${fromRect.width}px`,
        `height:${fromRect.height}px`,
        `margin:0`,
        `pointer-events:none`,
        `z-index:9999`,
        `border-radius:var(--radius-md,8px)`,
        `background:var(--surface-primary,var(--color-surface))`,
        `box-shadow:var(--shadow-lg,0 12px 32px rgba(0,0,0,.2))`,
        `transition:transform ${_FLY_DURATION} ${_FLY_EASING},opacity ${_FLY_DURATION} ${_FLY_EASING},box-shadow ${_FLY_DURATION} ${_FLY_EASING}`,
        `will-change:transform,opacity`,
    ].join(';');
    document.body.appendChild(clone);

    const dx = toRect.left - fromRect.left;
    const dy = toRect.top - fromRect.top;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            clone.style.transform = `translate(${dx}px,${dy}px)`;
            clone.style.boxShadow = 'var(--shadow-sm,0 1px 2px rgba(0,0,0,.06))';
        });
    });

    clone.addEventListener('transitionend', () => {
        clone.remove();
        targetWrapper.style.opacity = '';
    }, { once: true });
}

async function _flyToInstalled(app, t, sourceWrapper) {
    await _flyItem(app, t, sourceWrapper);
}

async function _flyToAvailable(app, t, sourceWrapper) {
    await _flyItem(app, t, sourceWrapper);
}

const _SWIPE_THRESHOLD = 60;
const _DELETE_BTN_W = 72;

let _openWrapper = null;

function _closeOpenWrapper() {
    if (_openWrapper) {
        const li = _openWrapper.querySelector('.translation-modal-item');
        if (li) {
            li.style.transition = 'transform 200ms ease';
            li.style.transform = 'translateX(0)';
        }
        _openWrapper.classList.remove('translation-modal-item-wrapper--open');
        _openWrapper = null;
    }
}

function _attachSwipe(wrapper, li) {
    let startX = 0;
    let startY = 0;
    let isDragging = false;
    let currentX = 0;
    let axis = null;

    const clampX = (x) => Math.max(-_DELETE_BTN_W, Math.min(0, x));

    const setX = (x, animate) => {
        currentX = clampX(x);
        li.style.transition = animate ? 'transform 200ms ease' : 'none';
        li.style.transform = `translateX(${currentX}px)`;
    };

    const open = () => {
        if (_openWrapper && _openWrapper !== wrapper) _closeOpenWrapper();
        _openWrapper = wrapper;
        setX(-_DELETE_BTN_W, true);
        wrapper.classList.add('translation-modal-item-wrapper--open');
    };

    const close = () => {
        if (_openWrapper === wrapper) _openWrapper = null;
        setX(0, true);
        wrapper.classList.remove('translation-modal-item-wrapper--open');
    };

    let _onMove = null;
    let _onEnd = null;

    function cleanup() {
        if (_onMove) { li.removeEventListener('touchmove', _onMove); _onMove = null; }
        if (_onEnd) {
            li.removeEventListener('touchend', _onEnd);
            li.removeEventListener('touchcancel', _onEnd);
            _onEnd = null;
        }
    }

    li.addEventListener('touchstart', (e) => {
        if (_openWrapper && _openWrapper !== wrapper) {
            _closeOpenWrapper();
            return;
        }

        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isDragging = true;
        axis = null;
        li.style.transition = 'none';

        _onMove = (ev) => {
            if (!isDragging) return;

            const dx = ev.touches[0].clientX - startX;
            const dy = ev.touches[0].clientY - startY;

            if (axis === null) {
                if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
                axis = Math.abs(dx) > Math.abs(dy);
                if (!axis) {
                    isDragging = false;
                    cleanup();
                    return;
                }
            }

            ev.preventDefault();
            ev.stopPropagation();
            const base = wrapper.classList.contains('translation-modal-item-wrapper--open') ? -_DELETE_BTN_W : 0;
            setX(base + dx, false);
        };

        _onEnd = () => {
            if (isDragging) {
                isDragging = false;
                if (currentX < -_SWIPE_THRESHOLD) open();
                else close();
            }
            cleanup();
        };

        li.addEventListener('touchmove', _onMove, { passive: false });
        li.addEventListener('touchend', _onEnd, { passive: true });
        li.addEventListener('touchcancel', _onEnd, { passive: true });
    }, { passive: true });
}

async function _handleUninstall(app, t, wrapper) {
    const removeFromDevice = confirm(
        `Remove ${t.id} from this device?\n\n` +
        'This removes the downloaded files from this browser.'
    );
    if (!removeFromDevice) return;

    let removeFromLibrary = false;
    if (app.currentUser) {
        removeFromLibrary = confirm(
            `Also remove ${t.id} from your synced translation library?\n\n` +
            'Choose OK to stop offering it on your other devices.\n' +
            'Choose Cancel to remove it only from this device.'
        );
    }

    await idbDeleteTranslation(t.id);
    app.bibleApi?.evictTranslation?.(t.id);
    await app.recordTranslationUninstalled(t.id, { removeFromLibrary });
    _flyToAvailable(app, t, wrapper);
}

async function _handleTranslationSelect(app, t, li, iconEl, progressWrap, progressBar, progressLabel) {
    if (!navigator.onLine) {
        _showInlineError(li, progressWrap, progressLabel, 'Connect to internet to download');
        return;
    }

    _downloading.add(t.id);
    li.classList.add('translation-modal-item--downloading');
    iconEl.innerHTML = _SVG_SPINNER;
    progressWrap.hidden = false;
    progressBar.style.width = '0%';
    progressLabel.textContent = 'Downloading…';

    let bookList = null;
    try {
        const metaRes = await fetch(`./translations/${t.id}/meta.json`);
        if (metaRes.ok) {
            const meta = await metaRes.json();
            if (meta?.books?.length) bookList = meta.books.map((b) => b.name);
        }
    } catch (_) { }

    try {
        await app.bibleApi.downloadTranslation(t.id, bookList, (done, tot) => {
            const pct = Math.round((done / tot) * 100);
            progressBar.style.width = `${pct}%`;
            progressLabel.textContent = `${done} / ${tot}`;
        });
        await app.recordTranslationInstalled(t.id);

        _downloading.delete(t.id);
        li.classList.remove('translation-modal-item--downloading');
        li.classList.add('translation-modal-item--downloaded');
        iconEl.innerHTML = _SVG_DOWNLOADED;
        progressWrap.hidden = true;

        const sourceWrapper = li.closest('.translation-modal-item-wrapper');
        setTimeout(() => {
            if (sourceWrapper) _flyToInstalled(app, t, sourceWrapper);
        }, 500);
    } catch (err) {
        _downloading.delete(t.id);
        li.classList.remove('translation-modal-item--downloading');
        iconEl.innerHTML = _SVG_DOWNLOAD;
        progressBar.style.width = '0%';
        _showInlineError(li, progressWrap, progressLabel, 'Download failed — try again');
        console.error('Translation download failed', err);
    }
}

function _showInlineError(li, progressWrap, progressLabel, message) {
    progressWrap.hidden = false;
    progressWrap.classList.add('translation-dl-progress--error');
    progressLabel.textContent = message;
    setTimeout(() => {
        progressWrap.hidden = true;
        progressWrap.classList.remove('translation-dl-progress--error');
        progressLabel.textContent = '';
    }, 3000);
}

function _translationItems(app) {
    return app.translationList
        ? Array.from(app.translationList.querySelectorAll('.translation-modal-item'))
        : [];
}

function _translationKbApply(app, items) {
    items.forEach((li, i) => {
        li.classList.toggle('translation-modal-item--focused', i === app._translationKbIndex);
    });
    const focused = items[app._translationKbIndex];
    if (focused) focused.scrollIntoView({ block: 'nearest' });
}

function _translationKbClear(app) {
    app._translationKbIndex = -1;
    if (!app.translationList) return;
    app.translationList
        .querySelectorAll('.translation-modal-item--focused')
        .forEach((li) => li.classList.remove('translation-modal-item--focused'));
}

export function translationKbMove(app, delta) {
    const items = _translationItems(app);
    if (!items.length) return;
    const current = app._translationKbIndex ?? -1;
    app._translationKbIndex = (current + delta + items.length) % items.length;
    _translationKbApply(app, items);
}

export function translationKbSelect(app) {
    const items = _translationItems(app);
    const idx = app._translationKbIndex ?? -1;
    if (idx < 0 || idx >= items.length) return;
    items[idx].click();
}

function attachDragHandlers(app, modal, dismissOnDrag = true) {
    const content = modal.querySelector('.modal-content');
    const header = modal.querySelector('.modal-header');
    const body = modal.querySelector('.modal-body');

    if (!content || !header) return;

    let isTouchDragging = false;
    let touchStartY = 0;
    let touchStartHeight = 0;
    let touchStartScrollTop = 0;

    header.addEventListener('touchstart', (e) => {
        if (!header.contains(e.target)) return;
        isTouchDragging = true;
        touchStartY = e.touches[0].clientY;
        touchStartHeight = content.offsetHeight;
        touchStartScrollTop = body?.scrollTop ?? 0;
        content.classList.add('dragging');
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!isTouchDragging) return;
        const deltaY = touchStartY - e.touches[0].clientY;
        const newH = Math.max(200, Math.min(window.innerHeight * 0.9, touchStartHeight + deltaY));
        content.style.height = `${newH}px`;
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!isTouchDragging) return;
        isTouchDragging = false;
        content.classList.remove('dragging');
        const totalDrag = e.changedTouches[0].clientY - touchStartY;
        if (dismissOnDrag && totalDrag > 150 && touchStartScrollTop === 0) {
            app.closeModal(modal);
            setTimeout(() => { content.style.height = '50vh'; }, 320);
        }
    }, { passive: true });

    let isMouseDragging = false;
    let mouseStartY = 0;
    let mouseStartHeight = 0;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.close-btn')) return;
        isMouseDragging = true;
        mouseStartY = e.clientY;
        mouseStartHeight = content.offsetHeight;
        content.classList.add('dragging');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isMouseDragging) return;
        const newH = Math.max(200, Math.min(window.innerHeight * 0.9, mouseStartHeight + (mouseStartY - e.clientY)));
        content.style.height = `${newH}px`;
    });

    document.addEventListener('mouseup', (e) => {
        if (!isMouseDragging) return;
        isMouseDragging = false;
        content.classList.remove('dragging');
        if (dismissOnDrag && e.clientY - mouseStartY > 150) {
            app.closeModal(modal);
            setTimeout(() => { content.style.height = '50vh'; }, 320);
        }
    });
}

export function attachDragToResize(app) {
    if (app.settingsModal) attachDragHandlers(app, app.settingsModal);
    if (app.referencesModal) attachDragHandlers(app, app.referencesModal);
}
