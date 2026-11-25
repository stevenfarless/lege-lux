// ui.js
// Responsibility: DOM caching, theme management

const REQUIRED_IDS = [
    "topChrome",
    "searchToggle",
    "settingsBtn",
    "prevChapter",
    "nextChapter",
    "bookSelector",
    "chapterSelector",
    "verseSelector",
    "currentBook",
    "currentChapter",
    "currentVerse",
    "searchContainer",
    "closeSearch",
    "searchInput",
    "searchResults",
    "passageTitle",
    "passageText",
    "copyright",
    "referencePickerModal",
    "closeReferencePickerModal",
    "referencePickerBack",
    "referencePickerTitle",
    "referencePickerSubtitle",
    "referencePickerFilters",
    "referencePickerView",
    "settingsModal",
    "loginModal",
    "signupModal",
    "userMenuModal",
    "closeSettingsModal",
    "closeLoginModal",
    "closeSignupModal",
    "closeUserMenuModal",
    "themeSelector",
    "verseNumbersToggle",
    "coloredVerseNumbersToggle",
    "headingsToggle",
    "verseByVerseToggle",
    "chapterArrowsToggle",
    "hideInterfaceOnScrollToggle",
    "hapticsToggle",
    "verseSelectionGestureSelect",
    "fontSizeDecrease",
    "fontSizeValue",
    "fontSizeIncrease",
    "referencesModal",
    "closeReferencesModal",
    "deuterocanonInfoModal",
    "closeDeuterocanonInfoModal",
    "footnotesSection",
    "footnotesContent",
    "crossReferencesSection",
    "crossReferencesContent",
    "syncPrompt",
    "syncPromptDismiss",
    "syncPromptSignIn",
    "toast",
    // Nav translation badge
    "translationSelectorBtn",
    "currentTranslation",
    "translationModal",
    "closeTranslationModal",
    "translationList",
    "translationSyncModal",
    "closeTranslationSyncModal",
    "translationSyncTitle",
    "translationSyncDescription",
    "translationSyncList",
    "translationSyncStatus",
    "translationSyncFallbackActions",
    "translationSyncUseKJV",
    "translationSyncUseBSB",
    "translationSyncNotNow",
    "translationSyncDownload",
];

// The inline <script> in <head> stamps the theme class and no-color-transition
// onto document.documentElement before first paint (document.body is null then).
// Once DOMContentLoaded fires, body is available — mirror all classes from
// <html> to <body> so component CSS targeting body.X-theme continues to work,
// then lift the transition guard from both elements.
document.addEventListener(
    "DOMContentLoaded",
    () => {
        const htmlClasses = [...document.documentElement.classList];
        if (htmlClasses.length) document.body.classList.add(...htmlClasses);

        requestAnimationFrame(() => {
            document.documentElement.classList.remove("no-color-transition");
            document.body.classList.remove("no-color-transition");
        });
    },
    { once: true },
);

const GEEK_THEME_CSS_ID = "geek-theme-css";

function ensureGeekThemeCss() {
    if (document.getElementById(GEEK_THEME_CSS_ID)) return;

    const link = document.createElement("link");
    link.id = GEEK_THEME_CSS_ID;
    link.rel = "stylesheet";
    link.href = "./css/geek95.css";
    document.head.appendChild(link);
}

export function cacheElements(app) {
    // Validate all required IDs exist — warns immediately if HTML is stale or mismatched
    const missing = REQUIRED_IDS.filter((id) => !document.getElementById(id));
    if (missing.length > 0) {
        console.warn("[cacheElements] Missing DOM elements:", missing);
    }

    // Top chrome wrapper (Header + Navigation)
    app.topChrome = document.getElementById("topChrome");

    // Header
    app.searchToggleBtn = document.getElementById("searchToggle");
    app.settingsBtn = document.getElementById("settingsBtn");
    app.themeToggleBtn = document.getElementById("themeToggle");

    // Navigation
    app.prevChapterBtn = document.getElementById("prevChapter");
    app.nextChapterBtn = document.getElementById("nextChapter");
    app.bookSelector = document.getElementById("bookSelector");
    app.chapterSelector = document.getElementById("chapterSelector");
    app.verseSelector = document.getElementById("verseSelector");
    app.currentBookSpan = document.getElementById("currentBook");
    app.currentChapterSpan = document.getElementById("currentChapter");
    app.currentVerseSpan = document.getElementById("currentVerse");

    // Nav translation badge
    app.translationSelectorBtn = document.getElementById(
        "translationSelectorBtn",
    );
    app.currentTranslationSpan = document.getElementById("currentTranslation");

    // Translation picker modal
    app.translationModal = document.getElementById("translationModal");
    app.closeTranslationModal = document.getElementById(
        "closeTranslationModal",
    );
    app.translationList = document.getElementById("translationList");
    app.translationSyncModal = document.getElementById("translationSyncModal");
    app.closeTranslationSyncModal = document.getElementById(
        "closeTranslationSyncModal",
    );
    app.translationSyncTitle = document.getElementById("translationSyncTitle");
    app.translationSyncDescription = document.getElementById(
        "translationSyncDescription",
    );
    app.translationSyncList = document.getElementById("translationSyncList");
    app.translationSyncStatus = document.getElementById(
        "translationSyncStatus",
    );
    app.translationSyncFallbackActions = document.getElementById(
        "translationSyncFallbackActions",
    );
    app.translationSyncUseKJV = document.getElementById(
        "translationSyncUseKJV",
    );
    app.translationSyncUseBSB = document.getElementById(
        "translationSyncUseBSB",
    );
    app.translationSyncNotNow = document.getElementById(
        "translationSyncNotNow",
    );
    app.translationSyncDownload = document.getElementById(
        "translationSyncDownload",
    );

    // Search
    app.searchContainer = document.getElementById("searchContainer");
    app.closeSearchBtn = document.getElementById("closeSearch");
    app.searchInput = document.getElementById("searchInput");
    app.searchResults = document.getElementById("searchResults");

    // Passage display
    app.passageTitle = document.getElementById("passageTitle");
    app.passageText = document.getElementById("passageText");
    app.copyright = document.getElementById("copyright");
    app.copyBtn = document.getElementById("copyBtn") ?? null;

    // Modals
    app.referencePickerModal = document.getElementById("referencePickerModal");
    app.referencePickerTitle = document.getElementById("referencePickerTitle");
    app.referencePickerSubtitle = document.getElementById("referencePickerSubtitle");
    app.referencePickerBack = document.getElementById("referencePickerBack");
    app.referencePickerFilters = document.getElementById("referencePickerFilters");
    app.referencePickerView = document.getElementById("referencePickerView");
    app.settingsModal = document.getElementById("settingsModal");
    app.loginModal = document.getElementById("loginModal");
    app.signupModal = document.getElementById("signupModal");
    app.userMenuModal = document.getElementById("userMenuModal");

    // Modal close buttons
    app.closeReferencePickerModal = document.getElementById("closeReferencePickerModal");
    app.closeSettingsModal = document.getElementById("closeSettingsModal");
    app.closeLoginModal = document.getElementById("closeLoginModal");
    app.closeSignupModal = document.getElementById("closeSignupModal");
    app.closeUserMenuModal = document.getElementById("closeUserMenuModal");

    // Settings
    app.themeSelector = document.getElementById("themeSelector");
    app.verseNumbersToggle = document.getElementById("verseNumbersToggle");
    app.coloredVerseNumbersToggle = document.getElementById(
        "coloredVerseNumbersToggle",
    );
    app.headingsToggle = document.getElementById("headingsToggle");
    app.verseByVerseToggle = document.getElementById("verseByVerseToggle");
    app.chapterArrowsToggle = document.getElementById("chapterArrowsToggle");
    app.hideInterfaceOnScrollToggle = document.getElementById(
        "hideInterfaceOnScrollToggle",
    );
    app.hapticsToggle = document.getElementById("hapticsToggle");
    app.verseSelectionGestureSelect = document.getElementById(
        "verseSelectionGestureSelect",
    );
    app.fontSizeDecrease = document.getElementById("fontSizeDecrease");
    app.fontSizeValue = document.getElementById("fontSizeValue");
    app.fontSizeIncrease = document.getElementById("fontSizeIncrease");
    // translationSelector (<select>) was removed from the settings modal;
    // translation switching is handled exclusively by the translationModal.
    app.translationSelector =
        document.getElementById("translationSelector") ?? null;

    // References modal (footnotes and cross-references)
    app.referencesModal = document.getElementById("referencesModal");
    app.closeReferencesModal = document.getElementById("closeReferencesModal");

    // Deuterocanon info modal
    app.deuterocanonInfoModal = document.getElementById(
        "deuterocanonInfoModal",
    );
    app.closeDeuterocanonInfoModal = document.getElementById(
        "closeDeuterocanonInfoModal",
    );
    app.footnotesSection = document.getElementById("footnotesSection");
    app.footnotesContent = document.getElementById("footnotesContent");
    app.crossReferencesSection = document.getElementById(
        "crossReferencesSection",
    );
    app.crossReferencesContent = document.getElementById(
        "crossReferencesContent",
    );

    // Persistent sync prompt
    app.syncPrompt = document.getElementById("syncPrompt");
    app.syncPromptDismiss = document.getElementById("syncPromptDismiss");
    app.syncPromptSignIn = document.getElementById("syncPromptSignIn");

    // Toast
    app.toast = document.getElementById("toast");
}

// Load theme on app start (uses localStorage as initial fallback)
export function loadTheme() {
    let mode = "system";
    try {
        const raw = localStorage.getItem("lightMode");
        // migrate old boolean strings
        if (raw === "true") mode = "light";
        else if (raw === "false") mode = "dark";
        else if (raw === "light" || raw === "dark" || raw === "system")
            mode = raw;
    } catch (_) { }
    applyLightMode(mode);
}

export function resolveLightMode(mode) {
    if (mode === "light") return true;
    if (mode === "dark") return false;
    return window.matchMedia("(prefers-color-scheme: light)").matches;
}

export function applyLightMode(mode) {
    const isLight = resolveLightMode(mode);
    document.documentElement.classList.toggle("light-mode", isLight);
    document.body.classList.toggle("light-mode", isLight);
    updateThemeIcon(isLight);
    updateThemeColor();
}

export async function setLightMode(app, mode) {
    const normalized =
        mode === "light" || mode === "dark" || mode === "system"
            ? mode
            : "system";
    app.state.lightMode = normalized;
    try {
        localStorage.setItem("lightMode", normalized);
    } catch (_) { }
    applyLightMode(normalized);
    const radio = document.querySelector(
        `input[name="lightMode"][value="${normalized}"]`,
    );
    if (radio) radio.checked = true;
    if (app.canWriteRemoteState()) {
        await app.database
            .ref(`users/${app.currentUser.uid}/settings/lightMode`)
            .set(normalized);
    }
}

// Update theme icon based on current mode
export function updateThemeIcon(isLightMode) {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    const svg = btn.querySelector("svg");
    if (!svg) return;

    if (isLightMode) {
        svg.outerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3
                 7 7 0 0 0 21 12.79z"></path>
      </svg>
    `;
    } else {
        svg.outerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    `;
    }
}

const ALL_THEME_CLASSES = [
    "lux-theme",
    "vespers-theme",
    "vigil-theme",
    "dracula-theme",
    "dracula2test-theme",
    "onyx-theme",
    "sage-theme",
    "ember-theme",
    "perplexity-theme",
    "basic-theme",
    "geek-theme",
    "gnome-theme",
    "uxorem-amo-theme",
    "luna-lux-theme",
];

// bg-base values sourced from css/tokens.css (Dracula/Alucard) and css/themes.css (all others).
// dark = the theme's dark-mode --bg-base; light = the theme's light-mode --bg-base.
const THEME_BG = {
    "basic-theme": { dark: "#000000", light: "#ffffff" },
    "dracula-theme": { dark: "#191A21", light: "#FFFBEB" },
    "dracula2test-theme": { dark: "#191A21", light: "#FFFBEB" },
    "onyx-theme": { dark: "#000000", light: "#faf9f7" },
    "sage-theme": { dark: "#0d1710", light: "#f6f8f5" },
    "ember-theme": { dark: "#161009", light: "#faf8f3" },
    "perplexity-theme": { dark: "#0A1616", light: "#f5f5f5" },
    "geek-theme": { dark: "#000000", light: "#000000" },
    "gnome-theme": { dark: "#1e1e1e", light: "#f6f5f4" },
    "lux-theme": { dark: "#1a1614", light: "#f5f2ec" },
    "vespers-theme": { dark: "#1a1714", light: "#f5f2ec" },
    "vigil-theme": { dark: "#000000", light: "#f5f2ec" },
    "uxorem-amo-theme": { dark: "#161018", light: "#F9F2F6" },
    "luna-lux-theme": { dark: "#000816", light: "#F5F8FF" },
};

export function updateThemeColor() {
    const isLight = document.documentElement.classList.contains("light-mode");
    const activeClass =
        [...document.documentElement.classList].find((c) =>
            c.endsWith("-theme"),
        ) || "basic-theme";
    const map = THEME_BG[activeClass] || THEME_BG["basic-theme"];
    const color = isLight ? map.light : map.dark;

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
    }
    meta.content = color;
}

export async function changeColorTheme(app, theme) {
    // Sync removal and addition on both <html> and <body> so that
    // both the :root/:html CSS variable selectors and the body.X-theme
    // component selectors (header, modals, geek overrides) resolve correctly.
    document.documentElement.classList.remove(...ALL_THEME_CLASSES);
    document.body.classList.remove(...ALL_THEME_CLASSES);

    const valid = ALL_THEME_CLASSES.includes(theme + "-theme");
    const resolved = valid ? theme : "basic";
    const cls = resolved + "-theme";
    if (resolved === "geek") ensureGeekThemeCss();

    document.documentElement.classList.add(cls);
    document.body.classList.add(cls);

    updateThemeColor();

    try {
        localStorage.setItem("colorTheme", resolved);
    } catch (_) { }

    if (app.canWriteRemoteState()) {
        await app.database
            .ref(`users/${app.currentUser.uid}/settings/colorTheme`)
            .set(resolved);
    }
}
