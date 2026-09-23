// settings.js
// Reading preferences: load from storage, apply to DOM, persist to Firebase and localStorage.

import { changeColorTheme, applyLightMode } from './ui.js';
import { mapReferenceBetweenMetas } from './versification.js';

const DEFAULTS = {
    fontSize: 20,
    showVerseNumbers: true,
    coloredVerseNumbers: true,
    showHeadings: true,
    showFootnotes: false,
    showCrossReferences: false,
    verseByVerse: false,
    showChapterArrows: false,
    hideInterfaceOnScroll: true,
    hapticsEnabled: true,
    lightMode: 'system',
    colorTheme: 'vespers',
    translation: 'KJV',
    readingFont: 'gentium',
    verseSelectionGesture: 'hold',
};

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 32;

function clampFontSize(size) {
    const parsed = parseInt(size, 10);
    if (!Number.isFinite(parsed)) return DEFAULTS.fontSize;

    return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, parsed));
}

function syncFontSizeControls(app, fontSize) {
    const value = String(fontSize);

    if (app.fontSizeValue) {
        app.fontSizeValue.textContent = value;
        app.fontSizeValue.setAttribute('aria-label', `${value} pixels`);
    }

    if (app.fontSizeDecrease) {
        app.fontSizeDecrease.disabled = fontSize <= FONT_SIZE_MIN;
    }

    if (app.fontSizeIncrease) {
        app.fontSizeIncrease.disabled = fontSize >= FONT_SIZE_MAX;
    }
}

const READING_FONT_FAMILIES = {
    gentium: 'Gentium Book Plus',
    andika: 'Andika',
    ubuntu: 'Ubuntu',
    opendyslexic3: 'OpenDyslexic3',
    'ia-quattro': 'iA Writer Quattro S',
    adwaitasans: 'Adwaita Sans',
};

const RECAPTCHA_STYLE_ID = 'recaptcha-badge-style';
// const RECAPTCHA_DISCLOSURE_HTML = '<div style="margin-top: 1rem; font-size: 0.875rem;">This site is protected by reCAPTCHA and the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a> and <a href="https://policies.google.com/terms" target="_blank" rel="noopener">Terms of Service</a> apply.</div>';

function readBool(key, defaultValue) {
    try {
        const v = localStorage.getItem(key);
        if (v === null) return defaultValue;
        if (v === 'true') return true;
        if (v === 'false') return false;
        return defaultValue;
    } catch { return defaultValue; }
}

function lsSet(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) { }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const RELEASE_NOTES_ALLOWED_TAGS = new Set([
    'A',
    'BLOCKQUOTE',
    'BR',
    'CODE',
    'EM',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HR',
    'LI',
    'OL',
    'P',
    'PRE',
    'STRONG',
    'UL',
]);

const RELEASE_NOTES_DANGEROUS_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'SVG',
    'MATH',
    'LINK',
    'META',
]);

function isSafeReleaseNoteUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;

    try {
        const url = new URL(raw, window.location.origin);
        return url.protocol === 'http:'
            || url.protocol === 'https:'
            || url.protocol === 'mailto:';
    } catch (_) {
        return false;
    }
}

function sanitizeReleaseNotesHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html ?? '');

    const cleanNode = (node) => {
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) continue;

            if (child.nodeType !== Node.ELEMENT_NODE) {
                child.remove();
                continue;
            }

            const tag = child.tagName.toUpperCase();

            if (RELEASE_NOTES_DANGEROUS_TAGS.has(tag)) {
                child.remove();
                continue;
            }

            if (!RELEASE_NOTES_ALLOWED_TAGS.has(tag)) {
                child.replaceWith(document.createTextNode(child.textContent || ''));
                continue;
            }

            const href = child.getAttribute('href');
            const title = child.getAttribute('title');

            for (const attr of Array.from(child.attributes)) {
                child.removeAttribute(attr.name);
            }

            if (tag === 'A') {
                if (isSafeReleaseNoteUrl(href)) {
                    child.setAttribute('href', new URL(href, window.location.origin).href);
                    child.setAttribute('target', '_blank');
                    child.setAttribute('rel', 'noopener noreferrer');
                }

                if (title) {
                    child.setAttribute('title', title);
                }
            }

            cleanNode(child);
        }
    };

    cleanNode(template.content);
    return template.innerHTML;
}

function renderReleaseNotesMarkdown(marked, body) {
    return sanitizeReleaseNotesHtml(marked.parse(String(body ?? '')));
}

function ensureRecaptchaBadgeHidden() {
    if (document.getElementById(RECAPTCHA_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = RECAPTCHA_STYLE_ID;
    style.textContent = '.grecaptcha-badge { visibility: hidden !important; }';
    document.head.appendChild(style);
}

export function loadLocalSettings(app) {
    try { app.state.fontSize = parseInt(localStorage.getItem('fontSize') || String(DEFAULTS.fontSize), 10); }
    catch (_) { app.state.fontSize = DEFAULTS.fontSize; }

    app.state.showVerseNumbers = readBool('showVerseNumbers', DEFAULTS.showVerseNumbers);
    app.state.showHeadings = readBool('showHeadings', DEFAULTS.showHeadings);
    app.state.coloredVerseNumbers = readBool('coloredVerseNumbers', DEFAULTS.coloredVerseNumbers);
    app.state.showFootnotes = readBool('showFootnotes', DEFAULTS.showFootnotes);
    app.state.showCrossReferences = readBool('showCrossReferences', DEFAULTS.showCrossReferences);
    app.state.verseByVerse = readBool('verseByVerse', DEFAULTS.verseByVerse);
    app.state.showChapterArrows = readBool('showChapterArrows', DEFAULTS.showChapterArrows);
    app.state.hideInterfaceOnScroll = readBool('hideInterfaceOnScroll', DEFAULTS.hideInterfaceOnScroll);
    app.state.hapticsEnabled = readBool('hapticsEnabled', DEFAULTS.hapticsEnabled);
    const _rawLightMode = (() => { try { return localStorage.getItem('lightMode'); } catch (_) { return null; } })();
    app.state.lightMode =
        _rawLightMode === 'light' || _rawLightMode === 'dark' || _rawLightMode === 'system'
            ? _rawLightMode
            : DEFAULTS.lightMode;

    try {
        const storedTheme = localStorage.getItem('colorTheme') || DEFAULTS.colorTheme;
        // 'dracula' was briefly remapped to 'onyx' in a bad deploy — restore it.
        app.state.colorTheme = storedTheme;
    } catch (_) { app.state.colorTheme = DEFAULTS.colorTheme; }

    try { app.state.readingFont = localStorage.getItem('readingFont') || DEFAULTS.readingFont; }
    catch (_) { app.state.readingFont = DEFAULTS.readingFont; }

    try {
        const storedGesture = localStorage.getItem('verseSelectionGesture');
        app.state.verseSelectionGesture = storedGesture === 'tap' ? 'tap' : DEFAULTS.verseSelectionGesture;
    } catch (_) {
        app.state.verseSelectionGesture = DEFAULTS.verseSelectionGesture;
    }

    try {
        const storedActive = localStorage.getItem('translation') || DEFAULTS.translation;
        const storedPreferred =
            localStorage.getItem('preferredTranslation') || storedActive;
        app.state.translation = app._normalizeTranslation(storedActive);
        app.preferredTranslation = app._normalizeTranslation(storedPreferred);
    } catch (_) {
        app.state.translation = DEFAULTS.translation;
        app.preferredTranslation = DEFAULTS.translation;
    }

    try {
        const raw = localStorage.getItem('readingPosition');
        if (raw) {
            const pos = JSON.parse(raw);
            if (pos && pos.book && pos.chapter) {
                app.state.currentBook = pos.book;
                app.state.currentChapter = parseInt(pos.chapter, 10);
                app.lastScrollPosition = pos.scrollY || 0;
            }
        }
    } catch (_) { /* malformed entry — leave state at defaults */ }
}

function syncVerseByVerseMode(app) {
    const enabled = !!app.state.verseByVerse;

    app.passageText?.classList.toggle('verse-by-verse', enabled);
    document.body.classList.toggle('verse-by-verse-mode', enabled);
    document.documentElement.classList.toggle('verse-by-verse-enabled', enabled);
}

export function applySettings(app) {
    ensureRecaptchaBadgeHidden();

    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector && app.state.colorTheme) themeSelector.value = app.state.colorTheme;
    changeColorTheme(app, app.state.colorTheme || DEFAULTS.colorTheme);

    if (app.translationSelector && app.state.translation) {
        app.translationSelector.value = app.state.translation;
    }
    if (app.currentTranslationSpan && app.state.translation) {
        app.currentTranslationSpan.textContent = app.state.translation;
    }
    app.bibleApi.setTranslation(app.state.translation || DEFAULTS.translation);

    applyLightMode(app.state.lightMode);

    applyLightMode(app.state.lightMode);

    document.querySelectorAll('input[name="lightMode"]').forEach((radio) => {
        radio.checked = radio.value === app.state.lightMode;
    });

    document.body.classList.toggle('hide-verse-numbers', !app.state.showVerseNumbers);
    document.body.classList.toggle('muted-verse-numbers', !app.state.coloredVerseNumbers);
    document.body.classList.toggle('hide-chapter-arrows', !app.state.showChapterArrows);
    if (app.verseNumbersToggle) app.verseNumbersToggle.checked = !!app.state.showVerseNumbers;
    if (app.coloredVerseNumbersToggle) app.coloredVerseNumbersToggle.checked = !!app.state.coloredVerseNumbers;
    if (app.headingsToggle) app.headingsToggle.checked = !!app.state.showHeadings;
    if (app.chapterArrowsToggle) app.chapterArrowsToggle.checked = !!app.state.showChapterArrows;
    if (app.hideInterfaceOnScrollToggle) app.hideInterfaceOnScrollToggle.checked = !!app.state.hideInterfaceOnScroll;
    if (app.hapticsToggle) app.hapticsToggle.checked = !!app.state.hapticsEnabled;
    const hapticsSetting = document.getElementById('hapticsSetting');
    if (hapticsSetting) hapticsSetting.hidden = false;

    syncVerseByVerseMode(app);
    if (app.verseByVerseToggle) app.verseByVerseToggle.checked = !!app.state.verseByVerse;

    const fontSize = clampFontSize(app.state.fontSize || DEFAULTS.fontSize);
    app.state.fontSize = fontSize;
    syncFontSizeControls(app, fontSize);
    if (app.passageText) app.passageText.style.fontSize = `${fontSize}px`;
    const readingFont = app.state.readingFont || DEFAULTS.readingFont;
    applyReadingFont(app, readingFont);

    if (app.verseSelectionGestureSelect) {
        app.verseSelectionGestureSelect.value = app.state.verseSelectionGesture || DEFAULTS.verseSelectionGesture;
    }

    updateCopyright(app);
}

const TOGGLE_MAP = {
    showVerseNumbers: 'verseNumbersToggle',
    coloredVerseNumbers: 'coloredVerseNumbersToggle',
    showHeadings: 'headingsToggle',
    showChapterArrows: 'chapterArrowsToggle',
    hideInterfaceOnScroll: 'hideInterfaceOnScrollToggle',
    hapticsEnabled: 'hapticsToggle',
};

export async function toggleSetting(app, setting) {
    const el = app[TOGGLE_MAP[setting]];
    if (!el) return;
    app.state[setting] = el.checked;

    lsSet(setting, el.checked);

    if (app.canWriteRemoteState()) {
        await app.database
            .ref(`users/${app.currentUser.uid}/settings/${setting}`)
            .set(el.checked);
    }

    if (setting === 'showHeadings') {
        await app.loadPassage(app.state.currentBook, app.state.currentChapter, false, 'settings-showHeadings');
        return;
    }

    if (setting === 'showVerseNumbers') {
        document.body.classList.toggle('hide-verse-numbers', !app.state.showVerseNumbers);
        return;
    }

    if (setting === 'coloredVerseNumbers') {
        document.body.classList.toggle('muted-verse-numbers', !app.state.coloredVerseNumbers);
        return;
    }

    if (setting === 'showChapterArrows') {
        document.body.classList.toggle('hide-chapter-arrows', !app.state.showChapterArrows);
        return;
    }

    if (setting === 'hideInterfaceOnScroll') {
        if (!app.state.hideInterfaceOnScroll) {
            app.showChrome?.();
            app.chromeScrollAnchorY = window.scrollY || window.pageYOffset || 0;
            app.chromeLastY = app.chromeScrollAnchorY;
            app.chromeLastDirection = null;
        }
        return;
    }
}

export async function toggleVerseByVerse(app) {
    app.state.verseByVerse = app.verseByVerseToggle.checked;

    lsSet('verseByVerse', app.state.verseByVerse);

    if (app.canWriteRemoteState()) {
        await app.database
            .ref(`users/${app.currentUser.uid}/settings/verseByVerse`)
            .set(app.state.verseByVerse);
    }

    syncVerseByVerseMode(app);
}

export async function applyReadingFont(app, font) {
    const family = READING_FONT_FAMILIES[font];
    if (!family) throw new Error(`Unknown reading font: ${font}`);

    const loaded = await document.fonts.load(`1em "${family}"`);
    if (loaded.length === 0) {
        throw new Error(`Reading font failed to load: ${family}`);
    }

    const fontClasses = [
        'font-andika',
        'font-ubuntu',
        'font-opendyslexic3',
        'font-retrocide',
        'font-ia-quattro',
        'font-adwaitasans',
    ];

    const fontClass = {
        andika: 'font-andika',
        ubuntu: 'font-ubuntu',
        opendyslexic3: 'font-opendyslexic3',
        retrocide: 'font-retrocide',
        'ia-quattro': 'font-ia-quattro',
        adwaitasans: 'font-adwaitasans',
    }[font];

    document.documentElement.classList.remove(...fontClasses);
    document.body.classList.remove(...fontClasses);

    if (fontClass) {
        document.documentElement.classList.add(fontClass);
    }

    const selector = document.getElementById('readingFontSelector');
    const helpText = document.getElementById('readingFontHelpText');

    if (selector) {
        selector.value = font;
        selector.disabled = false;
    }

    if (helpText) {
        helpText.textContent = 'Choose the typeface used for passage text.';
    }
}

export async function updateFontSize(app, size) {
    const fontSize = clampFontSize(size);

    app.state.fontSize = fontSize;
    syncFontSizeControls(app, fontSize);

    if (app.passageText) {
        app.passageText.style.fontSize = `${fontSize}px`;
    }

    lsSet('fontSize', fontSize);

    if (app.canWriteRemoteState()) {
        await app.database
            .ref(`users/${app.currentUser.uid}/settings/fontSize`)
            .set(fontSize);
    }
}

/**
 * Preserve the visible verse position, switch translations, rebuild the
 * active canon from meta.json, reload the passage, and restore the nearest
 * matching verse at the same viewport offset.
 *
 * Redirects to Genesis 1 when the active book is absent from the new canon.
 */
export async function changeTranslation(
    app,
    translation,
    { syncPreference = true } = {}
) {
    const previousTranslation = app.state.translation;
    const previousBook = app.state.currentBook;
    const previousChapter = app.state.currentChapter;
    const previousMeta = app.translationMeta;
    app._dbgEvent?.('changeTranslation request: ' + previousTranslation + ' -> ' + translation + ' while at ' + previousBook + ' ' + previousChapter + ' syncPreference=' + syncPreference);

    const chromeBottom = Math.max(
        0,
        document.querySelector('.top-chrome')
            ?.getBoundingClientRect().bottom || 0
    );

    const currentVerses = Array.from(
        app.passageText.querySelectorAll('.verse[data-verse]')
    );

    const visibleVerse = currentVerses.find((verse) => (
        verse.getBoundingClientRect().bottom > chromeBottom
    )) || currentVerses[currentVerses.length - 1];

    const verseAnchor = visibleVerse
        ? {
            id: /^\d+$/.test(visibleVerse.dataset.verse)
                ? Number(visibleVerse.dataset.verse)
                : visibleVerse.dataset.verse,
            offset: visibleVerse.getBoundingClientRect().top - chromeBottom,
        }
        : null;

    app.state.translation = translation;
    app.bibleApi.setTranslation(translation);

    if (app.translationSelector) {
        app.translationSelector.value = translation;
    }

    if (app.currentTranslationSpan) {
        app.currentTranslationSpan.textContent = translation;
    }

    lsSet('translation', translation);
    app._dbgEvent?.('storage write: translation ' + translation + ' source=changeTranslation');

    if (syncPreference) {
        app.preferredTranslation = translation;
        app.pendingPreferredTranslation = null;
        lsSet('preferredTranslation', translation);
        app._dbgEvent?.('storage write: preferredTranslation ' + translation + ' source=changeTranslation');
        await app.recordTranslationInstalled(translation);

        if (app.canWriteRemoteState()) {
            await app.database
                .ref(`users/${app.currentUser.uid}/settings/translation`)
                .set(translation);
        }
    }

    let meta = null;

    try {
        const buildId =
            document.querySelector('meta[name="build-id"]')?.content || '';
        const metaUrl = buildId && !buildId.startsWith('__BUILD_')
            ? `./translations/${encodeURIComponent(translation)}/meta.json?v=${encodeURIComponent(buildId)}`
            : `./translations/${encodeURIComponent(translation)}/meta.json`;
        const response = await fetch(metaUrl);

        if (response.ok) {
            meta = await response.json();
        }
    } catch (error) {
        app._dbgEvent?.('changeTranslation meta fetch failed: ' + translation + ' — ' + (error?.message || error));
    }

    const mappedReference = mapReferenceBetweenMetas(
        previousMeta,
        meta,
        {
            book: previousBook,
            chapter: previousChapter,
            verse: verseAnchor?.id ?? null,
        }
    );

    app._rebuildBibleBooks(meta);

    if (mappedReference && app.getAllBooks().includes(mappedReference.book)) {
        app.state.currentBook = mappedReference.book;
        app.state.currentChapter = Math.min(
            app.getChapterCount(mappedReference.book),
            Math.max(1, mappedReference.chapter)
        );
        if (verseAnchor && mappedReference.verse != null) {
            verseAnchor.id = mappedReference.verse;
        }
        app._dbgEvent?.(
            'changeTranslation mapped reference: ' +
            previousBook + ' ' + previousChapter + ' -> ' +
            app.state.currentBook + ' ' + app.state.currentChapter
        );
    }

    if (meta?.books?.length) {
        app.bibleApi.setBookList(
            translation,
            meta.books.map((book) => book.name)
        );
    }

    updateCopyright(app);
    app._dbgEvent?.('changeTranslation preserving passage: ' + app.state.currentBook + ' ' + app.state.currentChapter + ' translation=' + translation);

    await app.loadPassage(
        app.state.currentBook,
        app.state.currentChapter,
        false,
        'translation-change'
    );

    if (!verseAnchor) return;

    const availableVerses = Array.from(
        app.passageText.querySelectorAll('.verse[data-verse]')
    );

    if (availableVerses.length === 0) return;

    const exactVerse = availableVerses.find(
        (verse) => String(verse.dataset.verse) === String(verseAnchor.id)
    );
    const anchorNumber = parseInt(verseAnchor.id, 10);
    const targetVerse = exactVerse || availableVerses.reduce((nearest, verse) => {
        const nearestNumber = parseInt(nearest.dataset.verse, 10);
        const verseNumber = parseInt(verse.dataset.verse, 10);

        return Math.abs(verseNumber - anchorNumber)
            < Math.abs(nearestNumber - anchorNumber)
            ? verse
            : nearest;
    });

    const restoredChromeBottom = Math.max(
        0,
        document.querySelector('.top-chrome')
            ?.getBoundingClientRect().bottom || 0
    );

    const targetOffset =
        targetVerse.getBoundingClientRect().top - restoredChromeBottom;

    window.scrollBy(0, targetOffset - verseAnchor.offset);
    app.currentVerseSpan.textContent = targetVerse.dataset.verse;

    if (app.state.selectedVerse !== null) {
        app.applyVerseGlow();
    }
}

export function updateCopyright(app) {
    if (!app.copyright) return;

    const copyrightText = app._copyrightMap[app.state.translation] || '';
    const copyrightHtml = copyrightText
        ? `<span class="copyright-text">${escapeHtml(copyrightText)}</span>`
        : '';

    app.copyright.innerHTML = copyrightHtml;
}

/**
 * Wire sub-accordion toggle behaviour for the About section.
 * Called once during settings init.
 */
export function initSubAccordions() {
    const sections = Array.from(document.querySelectorAll('.sub-accordion-section'));
    const aboutSection = document.querySelector('.accordion-section[data-section="about"]');
    const aboutHeader = aboutSection?.querySelector('.accordion-header');

    const syncSection = (section) => {
        const button = section.querySelector('.sub-accordion-header');
        const panel = section.querySelector('.sub-accordion-panel');
        const isActive = section.classList.contains('active');

        button?.setAttribute('aria-expanded', String(isActive));
        if (panel) {
            panel.inert = !isActive;
            panel.setAttribute('aria-hidden', String(!isActive));
        }
    };

    sections.forEach((section) => {
        const button = section.querySelector('.sub-accordion-header');
        syncSection(section);

        button?.addEventListener('click', () => {
            const isActive = section.classList.contains('active');
            const siblings = Array.from(
                section.closest('.about-group').querySelectorAll('.sub-accordion-section')
            );

            siblings.forEach((entry) => entry.classList.remove('active'));
            if (!isActive) section.classList.add('active');
            siblings.forEach(syncSection);

            if (section.classList.contains('active')) {
                const sectionName = section.getAttribute('data-section');
                if (sectionName === 'whats-new') populateWhatsNew();
                if (sectionName === 'coming-soon') populateComingSoon();
            }
        });
    });

    aboutHeader?.addEventListener('click', () => {
        if (aboutSection?.classList.contains('active')) populateAboutVersion();
    });

    if (aboutSection?.classList.contains('active')) populateAboutVersion();
}

/**
 * Fetch release metadata only after the About section is opened. Release body
 * markdown is rendered later when the user expands the related sub-section.
 */
let markedLoadPromise = null;
let latestReleasePromise = null;
let aboutVersionScheduled = false;
let whatsNewScheduled = false;
let comingSoonScheduled = false;

function loadMarked() {
    if (typeof window.marked !== 'undefined') {
        return Promise.resolve(window.marked);
    }

    if (markedLoadPromise) {
        return markedLoadPromise;
    }

    markedLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');

        script.src =
            'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js';
        script.async = true;

        script.addEventListener('load', () => {
            if (typeof window.marked !== 'undefined') {
                resolve(window.marked);
                return;
            }

            reject(new Error('marked.js loaded without exposing marked'));
        });

        script.addEventListener('error', () => {
            reject(new Error('marked.js failed to load'));
        });

        document.head.appendChild(script);
    });

    return markedLoadPromise;
}

function fetchLatestRelease() {
    if (!latestReleasePromise) {
        latestReleasePromise = fetch(
            'https://api.github.com/repos/stevenfarless/lege-lux/releases/latest',
            { headers: { Accept: 'application/vnd.github+json' } }
        ).then((res) => {
            if (!res.ok) throw new Error(`GitHub release request failed: ${res.status}`);
            return res.json();
        });
    }

    return latestReleasePromise;
}

async function fallbackToBuildSha() {
    const versionEl = document.getElementById('aboutVersion');
    if (!versionEl) return;
    const buildInfo = document.getElementById('build-info');
    if (!buildInfo) return;
    const raw = buildInfo.textContent.trim();
    const sha = raw.split(/[\s·]/)[0];
    if (sha && sha !== '__BUILD_INFO__') versionEl.textContent = sha;
}

export function populateAboutVersion() {
    const aboutSection = document.querySelector('.accordion-section[data-section="about"]');
    if (aboutSection && !aboutSection.classList.contains('active')) return;
    if (aboutVersionScheduled) return;

    aboutVersionScheduled = true;
    void loadAboutVersion();
}

async function loadAboutVersion() {
    const versionEl = document.getElementById('aboutVersion');
    await fallbackToBuildSha();

    try {
        const release = await fetchLatestRelease();

        if (versionEl && release.tag_name) {
            versionEl.textContent = release.tag_name;
        }
    } catch (_) {
        await fallbackToBuildSha();
    }
}

function populateWhatsNew() {
    if (whatsNewScheduled) return;

    whatsNewScheduled = true;
    void loadWhatsNew();
}

async function loadWhatsNew() {
    const contentEl = document.getElementById('whatsNewContent');
    const section = contentEl?.closest('.sub-accordion-section');
    if (!contentEl) return;

    try {
        const release = await fetchLatestRelease();

        if (release.body) {
            try {
                const marked = await loadMarked();
                contentEl.innerHTML = renderReleaseNotesMarkdown(marked, release.body);
            } catch (_) {
                contentEl.textContent = release.body;
            }
        }

        section?.removeAttribute('hidden');
    } catch (_) {
        contentEl.textContent = 'Release notes unavailable.';
    }
}

function populateComingSoon() {
    if (comingSoonScheduled) return;

    comingSoonScheduled = true;
    void loadComingSoon();
}

async function loadComingSoon() {
    const el = document.getElementById('comingSoonContent');
    if (!el) return;
    try {
        const res = await fetch(
            'https://api.github.com/repos/stevenfarless/lege-lux/releases?per_page=10',
            { headers: { Accept: 'application/vnd.github+json' } }
        );
        if (!res.ok) return;
        const releases = await res.json();
        const pre = releases.find(r => r.prerelease === true);
        if (!pre || !pre.body) return;

        try {
            const marked = await loadMarked();
            el.innerHTML = renderReleaseNotesMarkdown(marked, pre.body);
        } catch (_) {
            el.textContent = pre.body;
        }

        const section = el.closest('.sub-accordion-section');
        const tagEl = section?.querySelector('.sub-accordion-header span');
        if (tagEl && pre.tag_name) tagEl.textContent = `Coming soon · ${pre.tag_name}`;
        section?.removeAttribute('hidden');
    } catch (_) { /* network error — leave section empty */ }
}
