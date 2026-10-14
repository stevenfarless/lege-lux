// ====================
// Bible Reader App
// ====================

import { BibleApi, LOCAL_TRANSLATIONS } from "./bible-api.js";
import { loadStructure, eventsForChapter } from "./bsb-structure.js";
import { formatPassageTitle, getChapterEquivalent } from "./versification.js";
import {
  initializeState,
  navigateChapter as navChapter,
  scrollToVerse as scrollVerse,
  applyVerseGlow as glowVerse,
  toggleVerseTray as trayToggle,
} from "./reading-state.js";
import {
  cacheElements,
  loadTheme,
  changeColorTheme,
  applyLightMode,
} from "./ui.js";
import {
  initializeBibleStructure,
  buildBibleBooks,
  getAllBooks,
  getChapterCount,
  getTestament,
  getDisplayName,
  PROTESTANT_BOOKS,
} from "./bible-structure.js";
import {
  updateNavigationState,
  navigateToNextVerse,
  navigateToPreviousVerse,
} from "./navigation.js";
import {
  toggleSearch,
  closeSearch,
  handleSearch,
  handleSearchKeydown,
  refreshSearchResultItems,
  setSearchSelectedIndex,
  activateSelectedSearchResult,
  isPassageReference,
  handlePassageReference,
  fetchAllSearchResults,
  groupSearchResultsByCanon,
  performKeywordSearch,
  displaySearchResults,
  parseReference,
  loadPassageFromReference,
  escapeRegExp,
  highlightSearchTerm,
  stripHTML,
} from "./search.js";
import {
  loadSavedPositionIfChanged,
  loadSavedReadingPosition,
  saveReadingPosition,
  handleUserButtonClick,
  handleLogin,
  handleSignup,
  handleLogout,
  loadUserData,
} from "./auth.js";
import {
  maybeShowSyncPrompt,
  hideSyncPrompt,
  dismissSyncPrompt,
  completeSyncPrompt,
  openSyncPromptLogin,
} from "./sync-prompt.js";
import {
  attachTranslationSyncEvents,
  dismissTranslationSyncForSession,
  isTranslationAvailableOnDevice,
  loadSyncedTranslationLibrary,
  maybeShowTranslationSyncModal,
  prepareLocalTranslation,
  recordTranslationInstalled,
  recordTranslationUninstalled,
  recoverUnavailableActiveTranslation,
  refreshMissingSyncedTranslations,
  removeTranslationFromSyncedLibrary,
} from "./translation-sync.js";
import {
  openModal,
  closeModal,
  openBookModal,
  populateBookModal,
  openChapterModal,
  populateChapterModal,
  openVerseModal,
  populateVerseModal,
  closeReferencePicker,
  goBackReferencePicker,
  openTranslationModal,
  populateTranslationModal,
  translationKbMove,
  translationKbSelect,
  getCurrentVerseCount,
} from "./modals.js";
import {
  loadLocalSettings,
  applySettings,
  toggleSetting,
  toggleVerseByVerse,
  updateFontSize,
  changeTranslation,
  updateCopyright,
  initSubAccordions,
} from "./settings.js";
import { handleKeyboardShortcuts } from "./keyboard.js";
import { attachEventListeners } from "./events.js";
import { getHapticsDebugState, hapticFirm } from "./haptics.js";
import {
  loadLocalBookmarks,
  applyBookmarkMarkers,
  updateBookmarkToolState,
  openBookmarkColorPicker,
  syncBookmarks,
  installBookmarkSheet,
} from "./bookmarks.js";

const TRANSLATION_ALIASES = { NRSVue: "NRSVUE" };
function normalizeTranslation(t) {
  return TRANSLATION_ALIASES[t] || t;
}

const PASSAGE_CACHE_KEY = "passageCache";

const installPromptModulePromise = import("./install-prompt.js")
  .then((module) => ({ module, error: null }))
  .catch((error) => ({ module: null, error }));

function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function revealApp() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove("initializing");
    });
  });
}

// ── Debug panel ────────────────────────────────────────────────────────────
// Triple-tap the header bar to open. Tap the panel to copy. Tap outside to close.
// REMOVE BEFORE MERGING TO MAIN.

function ms() {
  return Math.round(performance.now());
}
function ts(t) {
  return t == null ? "n/a" : `+${t}ms`;
}

// ── Network fetch interceptor ──────────────────────────────────────────────
// Installed once at module load. Records every fetch with timing, status,
// and whether it hit a local file or Firebase.

const _FIREBASE_HOSTS = new Set([
  "esv-bible-6dffb-default-rtdb.firebaseio.com",
  "esv-bible-6dffb.firebaseapp.com",
  "esv-bible-6dffb.web.app",
]);

function _classifyFetchUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl, location.href);
  } catch (_) {
    return "other";
  }
  if (_FIREBASE_HOSTS.has(parsed.hostname)) return "firebase";
  const path = parsed.pathname;
  if (path.endsWith("_bible.json") || path.includes("/translations/"))
    return "local";
  return "other";
}

const _fetchLog = [];
const _originalFetch = window.fetch.bind(window);
window.fetch = async function patchedFetch(input, init) {
  const url = typeof input === "string" ? input : (input?.url ?? String(input));
  const start = ms();
  let status = "?";
  let ok = false;
  try {
    const res = await _originalFetch(input, init);
    status = res.status;
    ok = res.ok;
    return res;
  } catch (err) {
    status = `ERR(${err.message})`;
    throw err;
  } finally {
    const dur = ms() - start;
    const src = _classifyFetchUrl(url);
    _fetchLog.push({ t: start, dur, url, status, ok, src });
  }
};

// ── JS error log ──────────────────────────────────────────────────────────
// Captures uncaught exceptions and unhandled promise rejections so they
// appear in the debug panel even if DevTools isn't open.

const _errorLog = [];
window.addEventListener("error", (e) => {
  _errorLog.push({
    t: ms(),
    msg: `${e.message}`,
    src: `${e.filename?.replace(/^https?:\/\/[^/]+/, "") ?? "?"}:${e.lineno}`,
  });
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason?.message ?? String(e.reason ?? "unhandled rejection");
  _errorLog.push({ t: ms(), msg, src: "promise" });
});

// ── User action log ───────────────────────────────────────────────────────
// Tracks meaningful UI interactions: translation changes, navigation,
// modal opens, search queries. Wired via _dbgUserAction() on the app instance.

const _userActionLog = [];
function _logUserAction(msg) {
  _userActionLog.push({ t: ms(), msg });
}

function buildDebugReport(app) {
  const dbg = app._dbg || {};
  const now = ms();

  // ── Device / browser ──────────────────────────────────────────────────
  const ua = navigator.userAgent;
  const platform = navigator.platform || "unknown";
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = window.devicePixelRatio ?? 1;
  const touchDev =
    "ontouchstart" in window || navigator.maxTouchPoints > 0 ? "yes" : "no";
  const online = navigator.onLine ? "online" : "OFFLINE";
  const connType = navigator.connection?.effectiveType ?? "unknown";
  const connDown =
    navigator.connection?.downlink != null
      ? `${navigator.connection.downlink} Mbps`
      : "unknown";
  const buildId =
    document.querySelector('meta[name="build-id"]')?.content || "__BUILD_ID__";
  const swController = navigator.serviceWorker?.controller?.scriptURL ?? "none";
  const hapticsDebug = getHapticsDebugState(app);

  // ── Firebase connectivity ─────────────────────────────────────────────
  const fbConnected =
    dbg.firebaseConnected === true
      ? "connected ✓"
      : dbg.firebaseConnected === false
        ? "DISCONNECTED ✗"
        : "unknown (listener not yet fired)";

  const LS_KEYS = [
    "readingPosition",
    "passageCache",
    "bookmarksV1",
    "translation",
    "preferredTranslation",
    "translationFallback",
    "translationLibraryPendingAddsV1",
    "colorTheme",
    "lightMode",
    "fontSize",
    "readingFont",
    "verseSelectionGesture",
    "showVerseNumbers",
    "coloredVerseNumbers",
    "showHeadings",
    "showFootnotes",
    "showCrossReferences",
    "verseByVerse",
    "showChapterArrows",
    "hideInterfaceOnScroll",
    "hapticsEnabled",
    "installPromptInstalledV1",
    "installPromptDismissedUntilV1",
  ];
  const ls = {};
  for (const k of LS_KEYS) {
    try {
      const raw = localStorage.getItem(k);
      if (k === "passageCache" && raw) {
        const p = JSON.parse(raw);
        ls[k] =
          `book=${p.book} ch=${p.chapter} translation=${p.translation} (html ${p.html?.length ?? 0} chars)`;
      } else if (k === "readingPosition" && raw) {
        const p = JSON.parse(raw);
        ls[k] = `book=${p.book} ch=${p.chapter} scrollY=${p.scrollY}`;
      } else if (k === "bookmarksV1" && raw) {
        const p = JSON.parse(raw);
        const items = Object.values(p.items || {});
        const activeItems = items.filter((item) => item && item.deleted !== true);
        const deletedItems = items.filter((item) => item && item.deleted === true);
        const formatBookmark = (item, status) => {
          const ref = `${item.book ?? "?"} ${item.chapter ?? "?"}:${item.verse ?? "?"}`;
          const color = item.color ?? "unknown";
          const updatedAt = Number(item.updatedAt);
          const updated = Number.isFinite(updatedAt)
            ? new Date(updatedAt).toISOString()
            : "n/a";
          return `    - ${status} ${ref} color=${color} updatedAt=${updated}`;
        };
        const details = [
          `${activeItems.length} active, ${deletedItems.length} deleted tombstones`,
          ...activeItems.map((item) => formatBookmark(item, "active")),
          ...deletedItems.map((item) => formatBookmark(item, "deleted")),
        ];
        ls[k] = details.join("\n");
      } else {
        ls[k] = raw ?? "(not set)";
      }
    } catch (_) {
      ls[k] = "(error reading)";
    }
  }

  let cacheMatch = "N/A";
  try {
    const raw = localStorage.getItem(PASSAGE_CACHE_KEY);
    if (raw) {
      const { book, chapter, translation } = JSON.parse(raw);
      const sb = app?.state?.currentBook;
      const sc = app?.state?.currentChapter;
      const st = app?.state?.translation || "KJV";
      const hit =
        book === sb && parseInt(chapter, 10) === sc && translation === st;
      cacheMatch = hit
        ? "HIT ✓"
        : `MISS ✗ cache=(${book} ${chapter} ${translation}) state=(${sb} ${sc} ${st})`;
    } else {
      cacheMatch = "MISS ✗ (no cache entry)";
    }
  } catch (_) {
    cacheMatch = "MISS ✗ (parse error)";
  }

  const snap = dbg.stateAtLoad || {};
  const diffs = [];
  const cur = {
    book: app?.state?.currentBook,
    chapter: app?.state?.currentChapter,
    translation: app?.state?.translation,
    colorTheme: app?.state?.colorTheme,
    lightMode: app?.state?.lightMode,
    fontSize: app?.state?.fontSize,
    readingFont: app?.state?.readingFont,
    verseSelectionGesture: app?.state?.verseSelectionGesture,
    showVerseNumbers: app?.state?.showVerseNumbers,
    coloredVerseNumbers: app?.state?.coloredVerseNumbers,
    showHeadings: app?.state?.showHeadings,
    verseByVerse: app?.state?.verseByVerse,
    showChapterArrows: app?.state?.showChapterArrows,
    hideInterfaceOnScroll: app?.state?.hideInterfaceOnScroll,
    scrollY: window.scrollY,
  };
  for (const [k, v] of Object.entries(cur)) {
    const was = snap[k];
    if (was !== undefined && String(was) !== String(v))
      diffs.push(`  ${k}: ${was} → ${v}`);
  }

  const api = app?.bibleApi;
  const bookCacheKeys = api?._bookCache ? [...api._bookCache.keys()] : [];
  const searchCacheKeys = api?._searchIndexCache
    ? [...api._searchIndexCache.keys()]
    : [];

  // ── Network log: group by source ──────────────────────────────────────
  const localFetches = _fetchLog.filter((f) => f.src === "local");
  const firebaseFetches = _fetchLog.filter((f) => f.src === "firebase");
  const otherFetches = _fetchLog.filter((f) => f.src === "other");
  const errorFetches = _fetchLog.filter((f) => !f.ok);

  const fmtFetch = (f) => {
    const shortUrl = f.url
      .replace(/^https?:\/\/[^/]+/, "")
      .replace(/\.json(\?.*)?$/, ".json");
    return `  ${ts(f.t)}  [${f.status}] ${f.dur}ms  ${shortUrl}`;
  };

  // ── Verse count in current passage ────────────────────────────────────
  const verseCount = app?.passageText
    ? app.passageText.querySelectorAll(".verse").length
    : "n/a";

  // ── SW cache keys ─────────────────────────────────────────────────────
  const swCacheLines = ["  (loading...)"];

  // ── Active font ───────────────────────────────────────────────────────
  const passageEl = app?.passageText ?? document.querySelector(".passage-text");
  const computedFont = passageEl
    ? getComputedStyle(passageEl).fontFamily
    : getComputedStyle(document.body).fontFamily;
  const storedFont = (() => {
    try {
      return localStorage.getItem("readingFont") ?? "(not set)";
    } catch (_) {
      return "(error)";
    }
  })();
  const bodyFont = getComputedStyle(document.body).fontFamily;
  const verseNumberEl = app?.passageText?.querySelector(".verse-num");
  const verseTextEl = app?.passageText?.querySelector(".verse-text");
  const verseNumberStyle = verseNumberEl
    ? getComputedStyle(verseNumberEl)
    : null;

  const readingToggleState = {
    showVerseNumbers: {
      state: app?.state?.showVerseNumbers,
      checked: app?.verseNumbersToggle?.checked,
      stored: ls.showVerseNumbers,
    },
    coloredVerseNumbers: {
      state: app?.state?.coloredVerseNumbers,
      checked: app?.coloredVerseNumbersToggle?.checked,
      stored: ls.coloredVerseNumbers,
    },
    showHeadings: {
      state: app?.state?.showHeadings,
      checked: app?.headingsToggle?.checked,
      stored: ls.showHeadings,
    },
    verseByVerse: {
      state: app?.state?.verseByVerse,
      checked: app?.verseByVerseToggle?.checked,
      stored: ls.verseByVerse,
    },
    showChapterArrows: {
      state: app?.state?.showChapterArrows,
      checked: app?.chapterArrowsToggle?.checked,
      stored: ls.showChapterArrows,
    },
    hideInterfaceOnScroll: {
      state: app?.state?.hideInterfaceOnScroll,
      checked: app?.hideInterfaceOnScrollToggle?.checked,
      stored: ls.hideInterfaceOnScroll,
    },
  };

  const installPromptEl = document.getElementById("installPrompt");
  const installPromptInstall = document.getElementById("installPromptInstall");
  const iosInstallSteps = document.getElementById("iosInstallSteps");
  const installDismissedUntil = Number(ls.installPromptDismissedUntilV1);
  const installDismissedActive =
    Number.isFinite(installDismissedUntil) &&
    installDismissedUntil > Date.now();
  const installBlockingUi = document.querySelector(".modal.active")
    ? "modal"
    : document.querySelector(".search-container.active")
      ? "search"
      : "none";
  const installUa = navigator.userAgent || "";
  const installIos =
    /iPad|iPhone|iPod/.test(installUa) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installSafari =
    /Safari/.test(installUa) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(installUa);
  const installIosSafari = installIos && installSafari;
  const installPromptDiagnostics = [
    `  ready: ${document.body.dataset.installPromptReady ?? "(not set)"}`,
    `  beforeinstallpromptFired: ${document.body.dataset.beforeinstallpromptFired ?? "(not set)"}`,
    `  nativePromptAvailable: ${document.body.dataset.installPromptNativeAvailable ?? "(not set)"}`,
    `  visible: ${document.body.dataset.installPromptVisible ?? "(not set)"}`,
    `  hiddenAttribute: ${installPromptEl ? String(installPromptEl.hidden) : "n/a"}`,
    `  ariaHidden: ${installPromptEl?.getAttribute("aria-hidden") ?? "n/a"}`,
    `  installButtonText: ${installPromptInstall?.textContent?.trim() || "n/a"}`,
    `  iosInstructionsVisible: ${iosInstallSteps ? String(!iosInstallSteps.hidden) : "n/a"}`,
    `  standaloneDisplayMode: ${window.matchMedia("(display-mode: standalone)").matches}`,
    `  navigatorStandalone: ${window.navigator.standalone ?? "n/a"}`,
    `  iOS Safari path: ${installIosSafari}`,
    `  blocking UI: ${installBlockingUi}`,
    `  installPromptInstalledV1: ${ls.installPromptInstalledV1}`,
    `  installPromptDismissedUntilV1: ${ls.installPromptDismissedUntilV1}`,
    `  dismissedActive: ${installDismissedActive}`,
  ];

  const timings = [
    `  scriptStart:          ${ts(dbg.t_script_start)}`,
    `  domReady:             ${ts(dbg.t_dom_ready)}`,
    `  swRegistered:         ${ts(dbg.t_sw_registered)} (background)`,
    `  settingsLoaded:       ${ts(dbg.t_settings_loaded)}`,
    `  cacheRestoreResult:   ${dbg.cacheRestoreResult ?? "n/a"} at ${ts(dbg.t_cache_restore)}`,
    `  revealApp (1st):      ${ts(dbg.t_reveal_first)}`,
    `  passageFetchStart:    ${ts(dbg.t_passage_fetch_start)}`,
    `  passageFetchEnd:      ${ts(dbg.t_passage_fetch_end)}  (${dbg.passageFetchMs != null ? dbg.passageFetchMs + "ms" : "n/a"})`,
    `  revealApp (2nd):      ${ts(dbg.t_reveal_second)}`,
    `  authRestoreScheduled: ${ts(dbg.t_auth_restore_scheduled)}`,
    `  authRestoreStart:     ${ts(dbg.t_auth_restore_start)}`,
    `  firebaseModuleStart:  ${ts(dbg.t_firebase_module_start)}`,
    `  firebaseModuleEnd:    ${ts(dbg.t_firebase_module_end)}`,
    `  authInitStart:        ${ts(dbg.t_auth_init_start)}`,
    `  authInitEnd:          ${ts(dbg.t_auth_init_end)}`,
    `  databaseInitStart:    ${ts(dbg.t_database_init_start)}`,
    `  databaseInitEnd:      ${ts(dbg.t_database_init_end)}`,
    `  authStateChanged:     ${ts(dbg.t_auth_state)} (${dbg.authStateUser ?? "n/a"})`,
    `  userDataLoaded:       ${ts(dbg.t_user_data_loaded)}`,
    `  firebasePositionEnd:  ${ts(dbg.t_firebase_position_end)} (${dbg.firebasePositionChanged ? "changed passage" : "no change"})`,
    `  panelOpened:          +${now}ms (session age)`,
  ];

  const lines = [
    "=== environment ===",
    `  buildId: ${buildId}`,
    `  userAgent: ${ua}`,
    `  platform: ${platform}`,
    `  viewport: ${vw}x${vh}  dpr: ${dpr}  touch: ${touchDev}`,
    `  network: ${online}  type: ${connType}  downlink: ${connDown}`,
    `  firebase: ${fbConnected}`,
    `  serviceWorker controller: ${swController}`,
    `  hapticsSupported: ${hapticsDebug.supported}`,
    `  hapticsEnabled: ${hapticsDebug.enabled}`,
    `  hapticsLastAttempt: ${hapticsDebug.lastAttempt ? JSON.stringify(hapticsDebug.lastAttempt) : "(none)"}`,
    "",
    "=== timings (ms since navigation start) ===",
    ...timings,
    "",
    "=== state changes since load ===",
    diffs.length ? diffs.join("\n") : "  (none)",
    "",
    "=== localStorage ===",
    ...Object.entries(ls).map(([k, v]) => `  ${k}: ${v}`),
    "",
    "=== install prompt diagnostics ===",
    ...installPromptDiagnostics,
    "",
    "=== passage cache match (now) ===",
    `  ${cacheMatch}`,
    "",
    "=== current passage ===",
    `  verses rendered: ${verseCount}`,
    `  title: ${app?.passageTitle?.textContent ?? "n/a"}`,
    `  translation: ${app?.state?.translation ?? "n/a"}`,
    "",
    "=== user actions ===",
    _userActionLog.length
      ? _userActionLog.map((e) => `  ${ts(e.t)}  ${e.msg}`).join("\n")
      : "  (none)",
    "",
    "=== session event log ===",
    ...(dbg.events?.length
      ? dbg.events.map((e) => `  ${ts(e.t)}  ${e.msg}`)
      : ["  (none)"]),
    "",
    "=== JS errors ===",
    _errorLog.length
      ? _errorLog.map((e) => `  ${ts(e.t)}  [${e.src}] ${e.msg}`).join("\n")
      : "  (none ✓)",
    "",
    "=== network: local file fetches ===",
    localFetches.length ? localFetches.map(fmtFetch).join("\n") : "  (none)",
    "",
    "=== network: firebase fetches ===",
    firebaseFetches.length
      ? firebaseFetches.map(fmtFetch).join("\n")
      : "  (none — local routing working ✓)",
    "",
    "=== network: other fetches ===",
    otherFetches.length ? otherFetches.map(fmtFetch).join("\n") : "  (none)",
    "",
    "=== network: errors ===",
    errorFetches.length ? errorFetches.map(fmtFetch).join("\n") : "  (none ✓)",
    "",
    "=== API memory cache ===",
    `  bookCache (${bookCacheKeys.length}): ${bookCacheKeys.join(", ") || "(empty)"}`,
    `  searchIndexCache (${searchCacheKeys.length}): ${searchCacheKeys.join(", ") || "(empty)"}`,
    "",
    "=== service worker cache ===",
    ...swCacheLines,
    "",
    "=== app state (now) ===",
    `  currentBook: ${app?.state?.currentBook}`,
    `  currentChapter: ${app?.state?.currentChapter}`,
    `  translation: ${app?.state?.translation}`,
    `  preferredTranslation: ${app?.preferredTranslation ?? "n/a"}`,
    `  pendingPreferredTranslation: ${app?.pendingPreferredTranslation ?? "(none)"}`,
    `  syncedTranslationLibrary: ${[...(app?.syncedTranslationLibrary || [])].join(", ") || "(empty)"}`,
    `  missingSyncedTranslations: ${(app?.missingSyncedTranslations || []).join(", ") || "(none)"}`,
    `  colorTheme: ${app?.state?.colorTheme}`,
    `  lightMode: ${app?.state?.lightMode}`,
    `  fontSize: ${app?.state?.fontSize}`,
    `  readingFont: ${app?.state?.readingFont}`,
    `  verseSelectionGesture: ${app?.state?.verseSelectionGesture}`,
    `  showVerseNumbers: ${app?.state?.showVerseNumbers}`,
    `  coloredVerseNumbers: ${app?.state?.coloredVerseNumbers}`,
    `  showHeadings: ${app?.state?.showHeadings}`,
    `  verseByVerse: ${app?.state?.verseByVerse}`,
    `  showChapterArrows: ${app?.state?.showChapterArrows}`,
    `  hideInterfaceOnScroll: ${app?.state?.hideInterfaceOnScroll}`,
    `  hapticsEnabled: ${app?.state?.hapticsEnabled}`,
    `  scrollY: ${window.scrollY}`,
    `  currentUser: ${app?.currentUser?.email ?? "not signed in"}`,
    "",
    "=== reading display diagnostics ===",
    `  body classes: ${document.body.className || "(none)"}`,
    `  html classes: ${document.documentElement.className || "(none)"}`,
    `  passage classes: ${app?.passageText?.className || "(none)"}`,
    `  verse-text wrapper present: ${verseTextEl ? "yes" : "no"}`,
    `  verse number color: ${verseNumberStyle?.color ?? "n/a"}`,
    `  verse number display: ${verseNumberStyle?.display ?? "n/a"}`,
    `  verse number visibility: ${verseNumberStyle?.visibility ?? "n/a"}`,
    `  showVerseNumbers: state=${readingToggleState.showVerseNumbers.state} checked=${readingToggleState.showVerseNumbers.checked} stored=${readingToggleState.showVerseNumbers.stored}`,
    `  coloredVerseNumbers: state=${readingToggleState.coloredVerseNumbers.state} checked=${readingToggleState.coloredVerseNumbers.checked} stored=${readingToggleState.coloredVerseNumbers.stored}`,
    `  showHeadings: state=${readingToggleState.showHeadings.state} checked=${readingToggleState.showHeadings.checked} stored=${readingToggleState.showHeadings.stored}`,
    `  verseByVerse: state=${readingToggleState.verseByVerse.state} checked=${readingToggleState.verseByVerse.checked} stored=${readingToggleState.verseByVerse.stored}`,
    `  showChapterArrows: state=${readingToggleState.showChapterArrows.state} checked=${readingToggleState.showChapterArrows.checked} stored=${readingToggleState.showChapterArrows.stored}`,
    `  hideInterfaceOnScroll: state=${readingToggleState.hideInterfaceOnScroll.state} checked=${readingToggleState.hideInterfaceOnScroll.checked} stored=${readingToggleState.hideInterfaceOnScroll.stored}`,
    `  selectedVerse: ${app?.state?.selectedVerse ?? "(none)"}`,
    `  viewport height: ${window.innerHeight}`,
    `  document height: ${document.documentElement.scrollHeight}`,
    "",
    "=== active font ===",
    `  localStorage font: ${storedFont}`,
    `  computed (passage): ${computedFont}`,
    `  computed (body): ${bodyFont}`,
  ];
  return { text: lines.join("\n"), swCacheLines };
}

function showDebugPanel(app) {
  const existing = document.getElementById("debugPanel");
  if (existing) {
    existing.remove();
    return;
  }

  const { text, swCacheLines } = buildDebugReport(app);

  const overlay = document.createElement("div");
  overlay.id = "debugPanel";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(0,0,0,0.85)",
    zIndex: "99999",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    boxSizing: "border-box",
  });

  const box = document.createElement("div");
  Object.assign(box.style, {
    background: "#1e1e2e",
    color: "#cdd6f4",
    fontFamily: "monospace",
    fontSize: "13px",
    lineHeight: "1.6",
    padding: "1.25rem",
    borderRadius: "12px",
    maxWidth: "100%",
    width: "100%",
    maxHeight: "80vh",
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    userSelect: "text",
    border: "1px solid #45475a",
  });
  box.textContent = text;

  const hint = document.createElement("div");
  Object.assign(hint.style, {
    marginTop: "0.75rem",
    textAlign: "center",
    color: "#a6e3a1",
    fontSize: "14px",
    fontFamily: "monospace",
  });
  hint.textContent = "Tap to copy  ·  Tap outside to close";

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, { maxWidth: "600px", width: "100%" });
  wrapper.appendChild(box);
  wrapper.appendChild(hint);
  overlay.appendChild(wrapper);

  // Async: fill in SW cache keys and update the box text.
  if ("caches" in window) {
    caches
      .keys()
      .then(async (cacheNames) => {
        const allKeys = [];
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          allKeys.push(`  [${name}] ${keys.length} entries`);
          for (const req of keys.slice(0, 20)) {
            const shortUrl = req.url.replace(/^https?:\/\/[^/]+/, "");
            allKeys.push(`    ${shortUrl}`);
          }
          if (keys.length > 20)
            allKeys.push(`    ... and ${keys.length - 20} more`);
        }
        if (!allKeys.length) allKeys.push("  (no SW caches)");
        const fullText = box.textContent.replace(
          /=== service worker cache ===\n  \(loading\.\.\.\)/,
          `=== service worker cache ===\n${allKeys.join("\n")}`,
        );
        box.textContent = fullText;
      })
      .catch(() => {
        box.textContent = box.textContent.replace(
          "  (loading...)",
          "  (cache API unavailable)",
        );
      });
  } else {
    box.textContent = box.textContent.replace(
      "  (loading...)",
      "  (not supported)",
    );
  }

  box.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard
      .writeText(box.textContent)
      .then(() => {
        hint.textContent = "Copied! ✓";
      })
      .catch(() => {
        hint.textContent = "Copy failed — select text manually";
      });
  });

  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
}

function initDebugTrigger(app) {
  const target =
    document.querySelector(".header") || document.querySelector(".logo");
  if (!target) return;

  let taps = 0;
  let timer = null;

  target.addEventListener(
    "touchend",
    (e) => {
      if (e.target.closest(".header-controls")) return;
      e.preventDefault();
      taps++;
      clearTimeout(timer);
      timer = setTimeout(() => {
        taps = 0;
      }, 700);
      if (taps >= 3) {
        taps = 0;
        clearTimeout(timer);
        showDebugPanel(app);
      }
    },
    { passive: false },
  );

  target.addEventListener("click", (e) => {
    if (e.target.closest(".header-controls")) return;
    if (e.sourceCapabilities?.firesTouchEvents) return;
    taps++;
    clearTimeout(timer);
    timer = setTimeout(() => {
      taps = 0;
    }, 700);
    if (taps >= 3) {
      taps = 0;
      clearTimeout(timer);
      showDebugPanel(app);
    }
  });
}

async function hardRefreshApp() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
  }

  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_refresh", Date.now().toString());
  window.location.replace(url.toString());
}

function initLogoLongPressRefresh() {
  const logo = document.querySelector(".logo");
  if (!logo) return;

  const HOLD_MS = 1000;
  const MOVE_LIMIT = 12;

  let holdTimer = null;
  let startX = 0;
  let startY = 0;
  let activated = false;

  const cancel = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
  };

  logo.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      activated = false;

      cancel();
      holdTimer = setTimeout(async () => {
        activated = true;
        hapticFirm(window._bibleApp);
        await hardRefreshApp();
      }, HOLD_MS);
    },
    { passive: true },
  );

  logo.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.touches[0];
      const movedX = Math.abs(touch.clientX - startX);
      const movedY = Math.abs(touch.clientY - startY);

      if (movedX > MOVE_LIMIT || movedY > MOVE_LIMIT) cancel();
    },
    { passive: true },
  );

  logo.addEventListener(
    "touchend",
    (event) => {
      cancel();

      if (activated) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { passive: false },
  );

  logo.addEventListener("touchcancel", cancel, { passive: true });
}

// Read readingPosition from localStorage without mutating app state.
// Returns { book, chapter } or null.
function _readSavedPosition() {
  try {
    const raw = localStorage.getItem("readingPosition");
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (pos?.book && pos?.chapter)
      return { book: pos.book, chapter: parseInt(pos.chapter, 10) };
  } catch (_) {}
  return null;
}

// SVG paths for copy/check icon swap
const _COPY_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const _CHECK_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

class BibleApp {
  constructor() {
    this.auth = null;
    this.database = null;
    this.currentUser = null;
    this.authAvailable = null;
    this.authStateResolved = false;
    this._firebaseModulePromise = null;
    this._authInitializationPromise = null;
    this._databaseInitializationPromise = null;
    this._authRestorationPromise = null;
    this._authObserverAttached = false;
    this._authRestorationScheduled = false;
    this._firebaseConnectedUnsubscribe = null;
    this._syncWritesEnabled = false;
    this._authRestorePositionBaseline = null;
    this.preferredTranslation = "KJV";
    this.pendingPreferredTranslation = null;
    this.syncedTranslationLibrary = new Set();
    this.missingSyncedTranslations = [];
    this._copyrightMap = {};
    this._translationRegistry = [];
    this._normalizeTranslation = normalizeTranslation;
    this._translationKbIndex = -1;
    this.referencePickerDraft = null;
    this.bookmarks = loadLocalBookmarks();

    // Debug instrumentation — REMOVE BEFORE MERGING TO MAIN.
    this._dbg = {
      t_script_start: ms(),
      events: [],
      firebaseConnected: null,
    };

    this.bibleBooks = initializeBibleStructure();

    this.bookAbbreviations = {
      Genesis: "Gen",
      Exodus: "Exod",
      Leviticus: "Lev",
      Numbers: "Num",
      Deuteronomy: "Deut",
      Joshua: "Josh",
      Judges: "Judg",
      Ruth: "Ruth",
      "1 Samuel": "1Sam",
      "2 Samuel": "2Sam",
      "1 Kings": "1Kgs",
      "2 Kings": "2Kgs",
      "1 Chronicles": "1Chr",
      "2 Chronicles": "2Chr",
      Ezra: "Ezra",
      Nehemiah: "Neh",
      Esther: "Esth",
      Job: "Job",
      Psalm: "Ps",
      Proverbs: "Prov",
      Ecclesiastes: "Eccl",
      "Song of Solomon": "Song",
      Isaiah: "Isa",
      Jeremiah: "Jer",
      Lamentations: "Lam",
      Ezekiel: "Ezek",
      Daniel: "Dan",
      Hosea: "Hos",
      Joel: "Joel",
      Amos: "Amos",
      Obadiah: "Obad",
      Jonah: "Jonah",
      Micah: "Mic",
      Nahum: "Nah",
      Habakkuk: "Hab",
      Zephaniah: "Zeph",
      Haggai: "Hag",
      Zechariah: "Zech",
      Malachi: "Mal",
      Matthew: "Matt",
      Mark: "Mark",
      Luke: "Luke",
      John: "John",
      Acts: "Acts",
      Romans: "Rom",
      "1 Corinthians": "1Cor",
      "2 Corinthians": "2Cor",
      Galatians: "Gal",
      Ephesians: "Eph",
      Philippians: "Phil",
      Colossians: "Col",
      "1 Thessalonians": "1Thess",
      "2 Thessalonians": "2Thess",
      "1 Timothy": "1Tim",
      "2 Timothy": "2Tim",
      Titus: "Titus",
      Philemon: "Phlm",
      Hebrews: "Heb",
      James: "Jas",
      "1 Peter": "1Pet",
      "2 Peter": "2Pet",
      "1 John": "1John",
      "2 John": "2John",
      "3 John": "3John",
      Jude: "Jude",
      Revelation: "Rev",
    };

    this.bookDisplayNames = { Psalm: "Psalms" };

    this.state = initializeState();
    this.searchTimeout = null;
    this.searchSelectedIndex = -1;
    this.searchResultItems = null;
    this.searchLastQuery = "";
    this.currentSearchResults = [];
    this.scrollTimeout = null;
    this.lastScrollPosition = 0;
    this.chromeHidden = false;
    this.chromeScrollAnchorY = 0;
    this.chromeLastY = 0;
    this.chromeLastDirection = null;
    this.chromeDelta = 8;
    this.chromeHideOffset = 80;
    this.chromeScrollTicking = false;
    this.chromeSuspend = false;

    this.showChrome = () => {
      if (!this.chromeHidden) return;
      document.body.classList.remove("chrome-hidden");
      this.chromeHidden = false;
    };

    this.hideChrome = () => {
      if (this.chromeHidden) return;
      document.body.classList.add("chrome-hidden");
      this.chromeHidden = true;
    };

    this.handleChromeScroll = () => {
      if (!this.state.hideInterfaceOnScroll) {
        this.showChrome();
        this.chromeScrollAnchorY = window.scrollY || window.pageYOffset || 0;
        this.chromeLastY = this.chromeScrollAnchorY;
        this.chromeLastDirection = null;
        this.chromeScrollTicking = false;
        return;
      }

      if (this.chromeScrollTicking) return;
      this.chromeScrollTicking = true;
      if (this.chromeSuspend) {
        this.chromeScrollAnchorY = window.scrollY || window.pageYOffset || 0;
        this.chromeLastY = window.scrollY || window.pageYOffset || 0;
        this.chromeLastDirection = null;
        this.chromeScrollTicking = false;
        return;
      }
      window.requestAnimationFrame(() => {
        if (!this.state.hideInterfaceOnScroll) {
          this.showChrome();
          this.chromeScrollAnchorY = window.scrollY || window.pageYOffset || 0;
          this.chromeLastY = this.chromeScrollAnchorY;
          this.chromeLastDirection = null;
          this.chromeScrollTicking = false;
          return;
        }

        const y = window.scrollY || window.pageYOffset || 0;
        const direction =
          y > this.chromeLastY
            ? "down"
            : y < this.chromeLastY
              ? "up"
              : this.chromeLastDirection;
        const modalOpen = !!document.querySelector(".modal.active");
        const searchOpen = !!this.searchContainer?.classList.contains("active");

        if (y <= 0 || modalOpen || searchOpen) {
          this.showChrome();
          this.chromeScrollAnchorY = y;
          this.chromeLastDirection = null;
        } else {
          if (direction !== this.chromeLastDirection) {
            this.chromeScrollAnchorY = y;
            this.chromeLastDirection = direction;
          }
          const movement = y - this.chromeScrollAnchorY;
          if (movement > this.chromeDelta && y > this.chromeHideOffset)
            this.hideChrome();
          if (movement < -this.chromeDelta) this.showChrome();
        }

        this.chromeLastY = y;
        this.chromeScrollTicking = false;
      });
    };

    this.originalPassageHtml = null;
    this.searchExpandedTestaments = new Set();
    this.searchExpandedBooks = new Set();
    this.bibleApi = new BibleApi(this.state.translation || "KJV");
    this.translationMeta = null;

    // Expose instance for Playwright debug log attachment — REMOVE BEFORE MERGING TO MAIN.
    window._bibleApp = this;

    this.init();
  }

  _dbgEvent(msg) {
    this._dbg.events.push({ t: ms(), msg });
  }

  _dbgUserAction(msg) {
    _logUserAction(msg);
  }

  _firebaseModuleUrl() {
    const buildId =
      document.querySelector('meta[name="build-id"]')?.content || "";

    if (buildId && !buildId.startsWith("__BUILD_")) {
      return (
        "./config/firebase-config.bundle.js?v=" + encodeURIComponent(buildId)
      );
    }

    return "./config/firebase-config.bundle.js";
  }

  async _loadFirebaseModule(reason) {
    if (!this._firebaseModulePromise) {
      this._dbg.t_firebase_module_start = ms();
      this._dbgEvent(`firebase module: loading (${reason})`);

      this._firebaseModulePromise = import(this._firebaseModuleUrl())
        .then((module) => {
          this._dbg.t_firebase_module_end = ms();
          this._dbgEvent(`firebase module: loaded (${reason})`);
          return module;
        })
        .catch((error) => {
          this._dbg.t_firebase_module_end = ms();
          this._dbgEvent(
            `firebase module: failed (${reason}) — ${error.message}`,
          );
          throw error;
        });
    }

    return this._firebaseModulePromise;
  }

  async _ensureFirebaseAuth(reason) {
    if (!this._authInitializationPromise) {
      this._dbg.t_auth_init_start = ms();
      this._dbgEvent(`Firebase Auth: initializing (${reason})`);

      this._authInitializationPromise = this._loadFirebaseModule(reason)
        .then((module) => module.initializeFirebaseAuth())
        .then((auth) => {
          this.auth = auth;
          this.authAvailable = true;
          this._dbg.t_auth_init_end = ms();
          this._dbgEvent(`Firebase Auth: ready (${reason})`);
          return auth;
        })
        .catch((error) => {
          this.authAvailable = false;
          this._dbg.t_auth_init_end = ms();
          throw error;
        });
    }

    return this._authInitializationPromise;
  }

  async _ensureFirebaseDatabase(reason) {
    if (!this._databaseInitializationPromise) {
      this._dbg.t_database_init_start = ms();
      this._dbgEvent(`Firebase Database/App Check: initializing (${reason})`);

      this._databaseInitializationPromise = this._loadFirebaseModule(reason)
        .then((module) => module.initializeFirebaseDatabase())
        .then((database) => {
          this.database = database;
          this._dbg.t_database_init_end = ms();

          if (!this._firebaseConnectedUnsubscribe && database.onConnected) {
            this._firebaseConnectedUnsubscribe = database.onConnected(
              (connected) => {
                this._dbg.firebaseConnected = connected;
                this._dbgEvent(
                  `firebase: ${connected ? "connected" : "disconnected"}`,
                );
              },
            );
          }

          return database;
        });
    }

    return this._databaseInitializationPromise;
  }

  _attachAuthObserver(auth) {
    if (this._authObserverAttached) return;

    this._authObserverAttached = true;
    auth.onAuthStateChanged((user) => {
      void this._handleAuthStateChanged(user);
    });
  }

  async _handleAuthStateChanged(user) {
    this._dbg.t_auth_state = ms();
    this.authStateResolved = true;

    if (!user) {
      this.currentUser = null;
      this._syncWritesEnabled = false;
      this._dbg.authStateUser = "signed out";
      this._dbgEvent("auth restoration: signed out");
      this._dbgEvent("database/App Check skipped for signed-out session");

      this.hideSyncPrompt();

      if (this.settingsModal?.classList.contains("active")) {
        const promptShown = this.maybeShowSyncPrompt();

        if (promptShown) {
          const settingsBody = this.settingsModal.querySelector(".modal-body");

          if (settingsBody) settingsBody.scrollTop = 0;
        }
      }

      await this.loadSyncedTranslationLibrary();
      this.maybeShowTranslationSyncModal();
      return;
    }

    this.currentUser = user;
    this._syncWritesEnabled = false;
    this._dbg.authStateUser = user.email;
    this._dbgEvent(`auth restoration: signed in as ${user.email}`);
    this.completeSyncPrompt();

    try {
      await this._ensureFirebaseDatabase("authenticated session restoration");

      const translationBefore = this.state.translation;
      await withTimeout(this.loadUserData(), 5000);
      const translationSyncResult = await this.loadSyncedTranslationLibrary();

      this._dbg.t_user_data_loaded = ms();
      this.applySettings();

      const bookBefore = this.state.currentBook;
      const chapterBefore = this.state.currentChapter;
      await this._loadSavedPositionIfChanged();

      const positionChanged =
        this.state.currentBook !== bookBefore ||
        this.state.currentChapter !== chapterBefore;

      if (
        translationSyncResult.activeTranslationChanged &&
        !positionChanged &&
        this.state.translation !== translationBefore
      ) {
        await this.loadPassage(
          this.state.currentBook,
          this.state.currentChapter,
          Boolean(this.lastScrollPosition),
          "auth-restoration-translation-sync",
        );
      }

      this._syncWritesEnabled = true;
      if (this.hasLocalPositionChangedSinceAuthStart()) {
        saveReadingPosition(this, "auth-restoration-newer-local-position");
        this._dbgEvent("auth restoration: saved newer local position");
      }
      await this.syncBookmarks();
      this.maybeShowTranslationSyncModal();
      this._dbg.t_firebase_position_end = ms();
      this._dbg.firebasePositionChanged = positionChanged;
    } catch (error) {
      this._syncWritesEnabled = false;
      console.error("Authenticated restoration failed", error);
      this._dbgEvent(
        `auth restoration: synchronization failed — ${error.message}`,
      );
    }
  }

  async _restoreAuthSession() {
    if (this._authRestorationPromise) {
      return this._authRestorationPromise;
    }
    this._authRestorePositionBaseline = {
      book: this.state.currentBook,
      chapter: this.state.currentChapter,
      scrollY: window.scrollY || 0,
    };

    this._dbg.t_auth_restore_start = ms();
    this._dbgEvent("auth restoration: started");

    this._authRestorationPromise = (async () => {
      try {
        const auth = await this._ensureFirebaseAuth("background restoration");

        await auth.ready;
        this._attachAuthObserver(auth);
      } catch (error) {
        this.authAvailable = false;
        this.authStateResolved = true;
        this.currentUser = null;
        console.warn("Background authentication unavailable:", error);
        this._dbgEvent(`auth restoration: unavailable — ${error.message}`);
      }
    })();

    return this._authRestorationPromise;
  }

  _startBackgroundAuthRestoration() {
    if (this._authRestorationScheduled) return;

    this._authRestorationScheduled = true;
    this._dbg.t_auth_restore_scheduled = ms();
    this._dbgEvent("auth restoration: scheduled after reader reveal");

    const restore = () => {
      void this._restoreAuthSession();
    };

    const runWhenIdle = () => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(restore, { timeout: 10000 });
      } else {
        restore();
      }
    };

    setTimeout(runWhenIdle, 8000);
  }

  async ensureInteractiveAuth() {
    try {
      const auth = await this._ensureFirebaseAuth("interactive account action");
      this._attachAuthObserver(auth);
      return auth;
    } catch (error) {
      throw new Error(
        "Account services could not be loaded. Check your connection and reload the app.",
        { cause: error },
      );
    }
  }

  async ensureInteractiveDatabase() {
    try {
      return await this._ensureFirebaseDatabase("interactive account action");
    } catch (error) {
      throw new Error(
        "Synchronization services could not be loaded. Check your connection and try again.",
        { cause: error },
      );
    }
  }

  async ensureInteractiveFirebase() {
    await this.ensureInteractiveAuth();
    await this.ensureInteractiveDatabase();
  }

  canWriteRemoteState() {
    return Boolean(
      this.currentUser && this.database && this._syncWritesEnabled,
    );
  }

  hasLocalPositionChangedSinceAuthStart() {
    const baseline = this._authRestorePositionBaseline;
    if (!baseline) return false;

    return (
      this.state.currentBook !== baseline.book ||
      this.state.currentChapter !== baseline.chapter ||
      Math.abs((window.scrollY || 0) - baseline.scrollY) > 2
    );
  }

  getAllBooks() {
    return getAllBooks(this);
  }
  getChapterCount(book) {
    return getChapterCount(this, book);
  }
  getTestament(book) {
    return getTestament(this, book);
  }
  getDisplayName(book) {
    return getDisplayName(this, book);
  }
  getChapterEquivalent(book, chapter) {
    return getChapterEquivalent(this.translationMeta, book, chapter);
  }
  formatPassageTitle(book, chapter) {
    const displayName = book === "Psalm" ? "Psalm" : this.getDisplayName(book);
    return formatPassageTitle(this.translationMeta, displayName, book, chapter);
  }

  /**
   * Rebuild app.bibleBooks from a translation's meta.json.
   * Called by changeTranslation() after it fetches the incoming translation's meta,
   * and by _loadTranslationRegistry() on initial load so a deuterocanonical
   * translation restored from localStorage shows all its books immediately.
   * If meta is null or has no books array, falls back to the static 66-book structure.
   * If the book modal is currently open, re-renders it so the user sees the new list.
   *
   * @param {object|null} meta  parsed meta.json, or null on fetch failure
   */
  _rebuildBibleBooks(meta) {
    this.translationMeta = meta || null;
    this.bibleBooks = buildBibleBooks(meta);
    this._dbgEvent(
      `_rebuildBibleBooks: ${Object.values(this.bibleBooks).reduce((n, t) => n + Object.keys(t).length, 0)} books`,
    );
    if (
      this.referencePickerModal?.classList.contains("active") &&
      this.referencePickerDraft?.view === "book"
    ) {
      populateBookModal(this);
    }
  }

  // ── Passage cache ──────────────────────────────────────────────────────

  _savePassageCache(
    book,
    chapter,
    translation,
    title,
    html,
    source = "unspecified",
  ) {
    try {
      localStorage.setItem(
        PASSAGE_CACHE_KEY,
        JSON.stringify({
          book,
          chapter: parseInt(chapter, 10),
          translation: translation || "KJV",
          buildId: document.querySelector('meta[name="build-id"]')?.content || "",
          title,
          html,
        }),
      );
      this._dbgEvent?.(
        "storage write: passageCache " +
          book +
          " " +
          parseInt(chapter, 10) +
          " " +
          (translation || "KJV") +
          " source=" +
          source,
      );
    } catch (_) {}
  }

  _restorePassageCache() {
    try {
      const raw = localStorage.getItem(PASSAGE_CACHE_KEY);
      if (!raw) {
        this._dbgEvent("cache restore: no passageCache entry");
        return false;
      }

      const { book, chapter, translation, buildId, title, html } = JSON.parse(raw);
      const currentBuildId =
        document.querySelector('meta[name="build-id"]')?.content || "";
      if (currentBuildId && buildId !== currentBuildId) {
        this._dbgEvent("cache MISS: passage cache belongs to another build");
        localStorage.removeItem(PASSAGE_CACHE_KEY);
        return false;
      }
      const cachedHtml = typeof html === "string" ? html : "";

      const hasLoadingPlaceholder =
        cachedHtml.includes("passage-loading-placeholder") ||
        cachedHtml.includes('class="loading"') ||
        cachedHtml.includes("class='loading'");

      const hasRenderablePassage =
        cachedHtml.includes('class="verse"') ||
        cachedHtml.includes("class='verse'");

      if (
        !cachedHtml.trim() ||
        hasLoadingPlaceholder ||
        !hasRenderablePassage
      ) {
        this._dbgEvent("cache MISS: cached passage html was not renderable");
        localStorage.removeItem(PASSAGE_CACHE_KEY);
        return false;
      }

      const stateBook = this.state.currentBook;
      const stateChapter = this.state.currentChapter;
      const stateTrans = this.state.translation || "KJV";

      if (
        book !== stateBook ||
        parseInt(chapter, 10) !== stateChapter ||
        translation !== stateTrans
      ) {
        this._dbgEvent(
          `cache MISS: cache=(${book} ${chapter} ${translation}) state=(${stateBook} ${stateChapter} ${stateTrans})`,
        );
        return false;
      }

      if (this.passageTitle) this.passageTitle.textContent = title || "";
      if (this.passageText) {
        this.passageText.innerHTML = cachedHtml;
        this.originalPassageHtml = cachedHtml;
        this.passageText.classList.toggle(
          "verse-by-verse",
          !!this.state.verseByVerse,
        );
      }

      document.body.classList.add("passage-ready");
      updateNavigationState(this);
      this.applyBookmarkMarkers();
      return true;
    } catch (err) {
      this._dbgEvent(`cache restore failed: ${err?.message || err}`);
      return false;
    }
  }

  // ── Background prefetch ────────────────────────────────────────────────

  _prefetchCurrentBook() {
    const book = this.state.currentBook;

    // Deuterocanonical books are only in a subset of translations.
    // Prefetching them across all LOCAL_TRANSLATIONS causes a flood of
    // 404s for translations that don't include them. Skip entirely.
    if (!PROTESTANT_BOOKS.has(book)) {
      this._dbgEvent(`prefetch: skipped "${book}" (not in Protestant canon)`);
      return;
    }

    const active = this.state.translation;
    const others = [...LOCAL_TRANSLATIONS].filter((t) => t !== active);
    let i = 0;
    const next = () => {
      if (i >= others.length) return;
      const t = others[i++];
      this.bibleApi
        ._loadBook(t, book)
        .catch((error) => {
          const message = `prefetch failed: ${t}/${book}`;
          console.warn(message, error);
          this._dbgEvent(`${message} — ${error?.message || error}`);
        })
        .finally(() => setTimeout(next, 300));
    };
    setTimeout(next, 1000);
  }

  // Prefetches the previous and next books relative to the current one so
  // chapter navigation across book boundaries feels instant.
  _prefetchAdjacentBooks() {
    const { currentBook, translation } = this.state;
    const books = this.getAllBooks();
    const idx = books.indexOf(currentBook);
    const toFetch = [
      idx > 0 ? books[idx - 1] : null,
      idx < books.length - 1 ? books[idx + 1] : null,
    ].filter(Boolean);
    setTimeout(() => {
      for (const book of toFetch) {
        this.bibleApi._loadBook(translation, book).catch((error) => {
          const message = `prefetch adjacent failed: ${translation}/${book}`;
          console.warn(message, error);
          this._dbgEvent(`${message} — ${error?.message || error}`);
        });
      }
    }, 3000);
  }

  async init() {
    document.body.classList.add("initializing");
    try {
      this._dbg.t_dom_ready = ms();

      registerServiceWorker(this)
        .then(() => {
          this._dbg.t_sw_registered = ms();
        })
        .catch((err) => {
          this._dbg.t_sw_registered = ms();
          this._dbgEvent(`SW registration failed: ${err?.message}`);
        });

      cacheElements(this);
      loadTheme(this);
      this.loadLocalSettings();

      const themeSelector = document.getElementById("themeSelector");
      const lightModeToggle = document.getElementById("lightModeToggle");
      if (themeSelector) {
        let saved = "basic";
        try {
          saved = localStorage.getItem("colorTheme") || "basic";
        } catch (_) {}
        themeSelector.value = saved;
      }
      if (lightModeToggle)
        lightModeToggle.checked =
          document.body.classList.contains("light-mode");

      attachEventListeners(this);
      attachTranslationSyncEvents(this);
      this.initializeAccordion();
      document.body.setAttribute("data-app-ready", "true");

      const localTranslationResult = await withTimeout(
        this.prepareLocalTranslation(),
        800,
        null,
      );

      if (localTranslationResult === null) {
        this._dbgEvent(
          "prepareLocalTranslation: timed out, continuing with current translation",
        );
      }

      this.applySettings();
      this._dbg.t_settings_loaded = ms();

      this._dbg.stateAtLoad = {
        book: this.state.currentBook,
        chapter: this.state.currentChapter,
        translation: this.state.translation,
        colorTheme: this.state.colorTheme,
        lightMode: this.state.lightMode,
        fontSize: this.state.fontSize,
        readingFont: this.state.readingFont,
        verseSelectionGesture: this.state.verseSelectionGesture,
        showVerseNumbers: this.state.showVerseNumbers,
        coloredVerseNumbers: this.state.coloredVerseNumbers,
        showHeadings: this.state.showHeadings,
        verseByVerse: this.state.verseByVerse,
        showChapterArrows: this.state.showChapterArrows,
        hideInterfaceOnScroll: this.state.hideInterfaceOnScroll,
        scrollY: window.scrollY,
      };

      const cacheHit = this._restorePassageCache();
      this._dbg.t_cache_restore = ms();
      this._dbg.cacheRestoreResult = cacheHit ? "HIT" : "MISS";
      if (cacheHit) this._dbgEvent("cache restore: HIT");

      initDebugTrigger(this);
      initLogoLongPressRefresh();
      // Expose debug report builder for Playwright test attachment — REMOVE BEFORE MERGING TO MAIN.
      window._buildDebugReport = () => buildDebugReport(window._bibleApp).text;

      const savedPos = _readSavedPosition();
      const posMatchesCache =
        !savedPos ||
        (savedPos.book === this.state.currentBook &&
          savedPos.chapter === this.state.currentChapter);

      if (cacheHit && posMatchesCache) {
        this._dbg.t_reveal_first = ms();
        this._dbg.t_passage_fetch_start = null;
        this._dbg.t_passage_fetch_end = null;
        this._dbg.passageFetchMs = null;
        revealApp();
        this._dbgEvent("init: cache hit + position match — skipping fetch");
        this._loadTranslationRegistry();
        this._prefetchCurrentBook();
        this._prefetchAdjacentBooks();
        this.swipe?.syncAdjacentPanels();
      } else if (cacheHit && !posMatchesCache) {
        this._dbg.t_reveal_first = ms();
        revealApp();
        this._dbgEvent(
          `init: cache hit but position mismatch — loading ${savedPos.book} ${savedPos.chapter}`,
        );
        this._dbg.t_passage_fetch_start = ms();
        await Promise.all([
          this._loadTranslationRegistry(),
          this.loadPassage(
            savedPos.book,
            savedPos.chapter,
            false,
            "startup-position-mismatch",
          ),
        ]);
        this._dbg.t_passage_fetch_end = ms();
        this._dbg.passageFetchMs =
          this._dbg.t_passage_fetch_end - this._dbg.t_passage_fetch_start;
        this._prefetchCurrentBook();
        this._prefetchAdjacentBooks();
      } else {
        this._dbg.t_passage_fetch_start = ms();
        this._dbg.t_reveal_second = ms();
        revealApp();
        this._dbgEvent("init: cache miss — revealing with loading spinner");
        await Promise.all([
          this._loadTranslationRegistry(),
          this.loadPassage(
            this.state.currentBook,
            this.state.currentChapter,
            false,
            "startup-cache-miss",
          ),
        ]);
        this._dbg.t_passage_fetch_end = ms();
        this._dbg.passageFetchMs =
          this._dbg.t_passage_fetch_end - this._dbg.t_passage_fetch_start;
        this._prefetchCurrentBook();
        this._prefetchAdjacentBooks();
      }

      void installPromptModulePromise.then(({ module, error }) => {
        if (error) {
          console.warn("Install prompt unavailable:", error);
          this._dbgEvent(`install prompt unavailable: ${error.message}`);
          return;
        }

        module.initInstallPrompt(this);
      });

      this._startBackgroundAuthRestoration();

      void withTimeout(this.loadSyncedTranslationLibrary(), 5000, null).then(
        () => {
          this.maybeShowTranslationSyncModal();
        },
      );
    } catch (err) {
      console.error("BibleApp init error:", err);
      this._dbgEvent(`init error: ${err.message}`);
      revealApp();
    }
  }

  async _loadTranslationRegistry() {
    try {
      const buildId =
        document.querySelector('meta[name="build-id"]')?.content || "";
      const registryUrl =
        buildId && !buildId.startsWith("__BUILD_")
          ? `./translations/index.json?v=${encodeURIComponent(buildId)}`
          : "./translations/index.json";
      const res = await fetch(registryUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const translations = data.translations || [];

      this._translationRegistry = translations.map((t) => ({
        id: t.id,
        name: t.label,
      }));

      const select = document.getElementById("translationSelector");
      if (select && translations.length > 0) {
        select.innerHTML = "";
        for (const t of translations) {
          const opt = document.createElement("option");
          opt.value = t.id;
          opt.textContent = t.label;
          select.appendChild(opt);
        }
      }

      this._copyrightMap = {};
      for (const t of translations)
        this._copyrightMap[t.id] = t.copyright || "";
      this.updateCopyright?.();

      // Fetch the starting translation's meta.json to populate the book
      // list for search and — critically — to rebuild app.bibleBooks so
      // the book picker shows the correct canon (including Deuterocanon)
      // when a deuterocanonical translation is restored from localStorage
      // on page refresh without a changeTranslation call.
      const startingTranslation = this.state.translation;
      fetch(
        buildId && !buildId.startsWith("__BUILD_")
          ? `./translations/${startingTranslation}/meta.json?v=${encodeURIComponent(buildId)}`
          : `./translations/${startingTranslation}/meta.json`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((meta) => {
          if (meta?.books?.length) {
            this.bibleApi.setBookList(
              startingTranslation,
              meta.books.map((b) => b.name),
            );
            this._rebuildBibleBooks(meta);
            this._dbgEvent(
              `setBookList: ${startingTranslation} (${meta.books.length} books)`,
            );
          }
        })
        .catch((error) => {
          console.warn(
            `BibleApp: failed to load ${startingTranslation} meta.json`,
            error,
          );
          this._dbgEvent(
            `meta load failed: ${startingTranslation} — ${error?.message || error}`,
          );
        });
    } catch (err) {
      console.error("BibleApp: failed to load translation index", err);
    }
  }

  initializeAccordion() {
    const sections = Array.from(
      document.querySelectorAll(".accordion-section"),
    );

    const syncSection = (section) => {
      const header = section.querySelector(".accordion-header");
      const panel = section.querySelector(".accordion-panel");
      const isActive = section.classList.contains("active");

      header?.setAttribute("aria-expanded", String(isActive));
      if (panel) {
        panel.inert = !isActive;
        panel.setAttribute("aria-hidden", String(!isActive));
      }
    };

    sections.forEach((section) => {
      const header = section.querySelector(".accordion-header");
      syncSection(section);

      header?.addEventListener("click", () => {
        const isActive = section.classList.contains("active");
        sections.forEach((entry) => entry.classList.remove("active"));
        if (!isActive) section.classList.add("active");
        sections.forEach(syncSection);
      });
    });

    initSubAccordions();
    const openAccountBtn = document.getElementById("openAccountBtn");
    if (openAccountBtn) {
      openAccountBtn.addEventListener("click", () => {
        this.closeModal(this.settingsModal);
        this.openModal(this.currentUser ? this.userMenuModal : this.loginModal);
      });
    }
  }

  async _loadSavedPositionIfChanged() {
    await loadSavedPositionIfChanged(this, withTimeout);
  }
  async loadSavedReadingPosition() {
    await loadSavedReadingPosition(this, withTimeout);
  }
  saveReadingPosition(source) {
    saveReadingPosition(this, source);
  }

  async loadPassage(
    book,
    chapter,
    restoreScroll = false,
    source = "unspecified",
  ) {
    const requestId = (this._loadPassageRequestSeq =
      (this._loadPassageRequestSeq || 0) + 1);
    this._activeLoadPassageRequest = requestId;
    this._dbgEvent(
      `loadPassage request #${requestId}: ${book} ${chapter} source=${source} restoreScroll=${!!restoreScroll} from=${this.state.currentBook} ${this.state.currentChapter}`,
    );

    // Guard: if the requested book is not present in the current canon
    // (e.g. after switching to a translation with a different canon),
    // fall back to Genesis 1 rather than fetching a passage that does not exist.
    const allBooks = this.getAllBooks();
    if (!allBooks.includes(book)) {
      this._dbgEvent(
        `loadPassage: "${book}" not in canon — redirecting to Genesis 1`,
      );
      book = "Genesis";
      chapter = 1;
    }

    const chapterCount = this.getChapterCount(book);
    if (chapterCount > 0 && (chapter < 1 || chapter > chapterCount)) {
      const requestedChapter = chapter;
      chapter = Math.min(chapterCount, Math.max(1, Number(chapter) || 1));
      this._dbgEvent(
        `loadPassage: ${book} ${requestedChapter} outside canon — clamped to ${chapter}`,
      );
    }

    if (!restoreScroll)
      this.saveReadingPosition?.("loadPassage-start:" + source);

    this.state.currentBook = book;
    this.state.currentChapter = chapter;

    const alreadyCached =
      this.passageText &&
      this.passageText.querySelector(".loading") === null &&
      this.passageText.innerHTML.trim() !== "";
    const hasStartupPlaceholder = Boolean(
      this.passageText?.querySelector(".passage-loading-placeholder"),
    );
    if (!alreadyCached && !hasStartupPlaceholder) {
      this.passageText.innerHTML = '<p class="loading">Loading passage...</p>';
    }

    let scaffoldEvents = [];
    try {
      const allEvents = await loadStructure(book, this.state.translation);
      scaffoldEvents = eventsForChapter(allEvents, chapter);
    } catch (err) {
      console.warn("loadPassage: passage structure scaffold unavailable", err);
    }

    const data = await this.bibleApi.fetchPassage(
      `${book} ${chapter}`,
      scaffoldEvents,
      this.state.showHeadings !== false,
    );

    if (!data) {
      const recovered = await this.recoverUnavailableActiveTranslation(book);

      if (recovered) return;

      this._dbgEvent(`loadPassage: no data for ${book} ${chapter}`);
      if (this.passageTitle)
        this.passageTitle.textContent = `${book} ${chapter}`;
      if (this.passageText) {
        this.passageText.innerHTML =
          '<p class="error">Passage not available.</p>';
      }
      document.body.classList.add("passage-ready");
      this.chromeSuspend = false;
      document.body.classList.remove("chrome-no-transition");
      return;
    }

    this.updateNavigationState();
    const title = this.formatPassageTitle(book, chapter);
    this.passageTitle.textContent = title;
    this.passageText.innerHTML = data.passages[0];
    this.originalPassageHtml = this.passageText.innerHTML;
    this.passageText.classList.toggle(
      "verse-by-verse",
      !!this.state.verseByVerse,
    );
    document.body.classList.add("passage-ready");

    this.updateCopyright();
    this.currentVerseSpan.textContent = "1";
    this.chromeSuspend = true;
    document.body.classList.add("chrome-no-transition");
    this.showChrome();
    window.scrollTo(0, restoreScroll ? this.lastScrollPosition || 0 : 0);

    requestAnimationFrame(() => {
      this.chromeScrollAnchorY = window.scrollY || window.pageYOffset || 0;
      this.chromeLastY = window.scrollY || window.pageYOffset || 0;
      this.chromeLastDirection = null;
      this.chromeSuspend = false;
      document.body.classList.remove("chrome-no-transition");
    });

    const superseded =
      this._activeLoadPassageRequest === requestId
        ? ""
        : ` supersededBy=#${this._activeLoadPassageRequest}`;
    this._dbgEvent(
      `loadPassage rendered #${requestId}: ${book} ${chapter} (${this.state.translation}) source=${source}${superseded}`,
    );
    this.saveReadingPosition?.("loadPassage-rendered:" + source);
    this._savePassageCache(
      book,
      chapter,
      this.state.translation || "KJV",
      title,
      this.passageText.innerHTML,
      source,
    );
    this.applyBookmarkMarkers();
    this.swipe?.syncAdjacentPanels();
  }

  navigateChapter(direction) {
    _logUserAction(
      `navigateChapter: ${direction > 0 ? "next" : "prev"} (${this.state.currentBook} ${this.state.currentChapter})`,
    );
    navChapter(this, direction);
  }
  updateNavigationState() {
    updateNavigationState(this);
  }
  navigateToNextVerse() {
    navigateToNextVerse(this);
  }
  navigateToPreviousVerse() {
    navigateToPreviousVerse(this);
  }

  toggleSearch() {
    _logUserAction("toggleSearch");
    toggleSearch(this);
  }
  closeSearch() {
    closeSearch(this);
  }
  handleSearch(query, source = "type") {
    _logUserAction(`search (${source}): "${query}"`);
    handleSearch(this, query);
  }
  handleSearchKeydown(e) {
    handleSearchKeydown(this, e);
  }
  refreshSearchResultItems(autoSelect) {
    refreshSearchResultItems(this, autoSelect);
  }
  setSearchSelectedIndex(i, scroll) {
    setSearchSelectedIndex(this, i, scroll);
  }
  activateSelectedSearchResult() {
    activateSelectedSearchResult(this);
  }
  isPassageReference(q) {
    return isPassageReference(q);
  }
  async handlePassageReference(ref) {
    await handlePassageReference(this, ref);
  }
  async fetchAllSearchResults(q, onBatch) {
    return fetchAllSearchResults(this, q, onBatch);
  }
  groupSearchResultsByCanon(results) {
    return groupSearchResultsByCanon(this, results);
  }
  async performKeywordSearch(q) {
    await performKeywordSearch(this, q);
  }
  displaySearchResults(results, q) {
    displaySearchResults(this, results, q);
  }
  parseReference(ref) {
    return parseReference(ref);
  }
  async loadPassageFromReference(ref, source) {
    await loadPassageFromReference(this, ref, source);
  }
  escapeRegExp(str) {
    return escapeRegExp(str);
  }
  highlightSearchTerm(text, term) {
    return highlightSearchTerm(text, term);
  }
  stripHTML(html) {
    return stripHTML(html);
  }

  openModal(modal, source = "unspecified") {
    _logUserAction(`openModal: ${modal?.id ?? "unknown"} source=${source}`);
    openModal(this, modal);
  }
  closeModal(modal) {
    closeModal(this, modal);
  }
  closeReferencePicker() {
    closeReferencePicker(this);
  }
  goBackReferencePicker() {
    goBackReferencePicker(this);
  }
  openBookModal() {
    openBookModal(this);
  }
  populateBookModal() {
    populateBookModal(this);
  }
  openChapterModal() {
    openChapterModal(this);
  }
  populateChapterModal() {
    populateChapterModal(this);
  }
  openVerseModal() {
    openVerseModal(this);
  }
  populateVerseModal() {
    populateVerseModal(this);
  }
  openTranslationModal() {
    openTranslationModal(this);
  }
  populateTranslationModal() {
    populateTranslationModal(this);
  }
  translationKbMove(delta) {
    translationKbMove(this, delta);
  }
  translationKbSelect() {
    translationKbSelect(this);
  }
  getCurrentVerseCount() {
    return getCurrentVerseCount(this);
  }
  scrollToVerse(n) {
    scrollVerse(this, n);
  }
  applyVerseGlow() {
    glowVerse(this);
  }
  toggleVerseTray() {
    trayToggle(this);
  }

  loadLocalSettings() {
    loadLocalSettings(this);
  }
  applySettings() {
    applySettings(this);
  }
  async toggleSetting(s) {
    _logUserAction(`toggleSetting: ${s}`);
    await toggleSetting(this, s);
  }
  async toggleVerseByVerse() {
    _logUserAction("toggleVerseByVerse");
    await toggleVerseByVerse(this);
  }
  async updateFontSize(size) {
    _logUserAction(`updateFontSize: ${size}`);
    await updateFontSize(this, size);
  }
  async changeTranslation(t, options = {}) {
    _logUserAction(`changeTranslation: ${t}`);
    await changeTranslation(this, t, options);
  }
  updateCopyright() {
    updateCopyright(this);
  }

  handleKeyboardShortcuts(e) {
    handleKeyboardShortcuts(this, e);
  }

  maybeShowSyncPrompt() {
    return maybeShowSyncPrompt(this);
  }
  hideSyncPrompt() {
    return hideSyncPrompt(this);
  }
  dismissSyncPrompt() {
    return dismissSyncPrompt(this);
  }
  completeSyncPrompt() {
    return completeSyncPrompt(this);
  }
  openSyncPromptLogin() {
    return openSyncPromptLogin(this);
  }

  async prepareLocalTranslation() {
    return prepareLocalTranslation(this);
  }
  async loadSyncedTranslationLibrary() {
    return loadSyncedTranslationLibrary(this);
  }
  async isTranslationAvailableOnDevice(translation) {
    return isTranslationAvailableOnDevice(translation);
  }
  async recordTranslationInstalled(translation) {
    return recordTranslationInstalled(this, translation);
  }
  async recordTranslationUninstalled(translation, options) {
    return recordTranslationUninstalled(this, translation, options);
  }
  async removeTranslationFromSyncedLibrary(translation) {
    return removeTranslationFromSyncedLibrary(this, translation);
  }
  async refreshMissingSyncedTranslations() {
    return refreshMissingSyncedTranslations(this);
  }
  maybeShowTranslationSyncModal(options) {
    return maybeShowTranslationSyncModal(this, options);
  }
  dismissTranslationSyncForSession() {
    return dismissTranslationSyncForSession(this);
  }

  applyBookmarkMarkers() {
    applyBookmarkMarkers(this);
  }

  updateBookmarkToolState() {
    updateBookmarkToolState(this);
  }

  openBookmarkColorPicker(anchor) {
    openBookmarkColorPicker(this, anchor);
  }

  async syncBookmarks() {
    await syncBookmarks(this);
  }

  installBookmarkSheet() {
    installBookmarkSheet(this);
  }
  async recoverUnavailableActiveTranslation(book) {
    return recoverUnavailableActiveTranslation(this, book);
  }

  copySelectedVerse() {
    _logUserAction("copySelectedVerse");

    const verseNumber = this.state.selectedVerse;
    if (verseNumber == null) {
      this.showToast("No verse selected");
      return;
    }

    const verse = this.passageText?.querySelector(
      `.verse[data-verse="${verseNumber}"]`,
    );
    if (!verse) {
      this.showToast("Selected verse unavailable");
      return;
    }

    const verseText = verse.querySelector(".verse-text") ?? verse;
    const text = this.stripHTML(verseText.innerHTML).trim();
    const ref = `${this.passageTitle.textContent}:${verseNumber}`;
    const content = `${text}\n\n${ref} ${this.state.translation || "KJV"}`;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(content)
        .then(() => {
          this.showToast("Verse copied!");
          this._dbgEvent(`copySelectedVerse: copied ${ref}`);
        })
        .catch((err) => {
          console.error("Failed to copy verse:", err);
          this._dbgEvent(`copySelectedVerse: clipboard error — ${err.message}`);
          this._copyFallback(content, "Verse copied!");
        });
    } else {
      this._copyFallback(content, "Verse copied!");
    }
  }

  shareSelectedVerse() {
    _logUserAction("shareSelectedVerse");

    const verseNumber = this.state.selectedVerse;
    if (verseNumber == null) {
      this.showToast("No verse selected");
      return;
    }

    const verse = this.passageText?.querySelector(
      `.verse[data-verse="${verseNumber}"]`,
    );
    if (!verse) {
      this.showToast("Selected verse unavailable");
      return;
    }

    const verseText = verse.querySelector(".verse-text") ?? verse;
    const text = this.stripHTML(verseText.innerHTML).trim();
    const ref = `${this.passageTitle.textContent}:${verseNumber}`;
    const content = `${text}\n\n${ref} ${this.state.translation || "KJV"}`;

    if (navigator.share) {
      navigator
        .share({
          text: content,
        })
        .then(() => {
          this.showToast("Verse shared!");
          this._dbgEvent(`shareSelectedVerse: shared ${ref}`);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;

          console.error("Failed to share verse:", err);
          this._dbgEvent(`shareSelectedVerse: share error — ${err.message}`);
          this._copyFallback(content, "Share unavailable. Verse copied!");
        });
    } else {
      this._copyFallback(content, "Share unavailable. Verse copied!");
    }
  }

  copyPassage() {
    _logUserAction("copyPassage");
    const text = this.stripHTML(this.passageText.innerHTML);
    const ref = this.passageTitle.textContent;
    const content = `${text.trim()}\n\n${ref} ${this.state.translation || "KJV"}`;

    const btn = document.getElementById("copyPassage");
    const _swapToCheck = () => {
      if (!btn) return;
      btn.innerHTML = _CHECK_SVG;
      setTimeout(() => {
        btn.innerHTML = _COPY_SVG;
      }, 1500);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(content)
        .then(() => {
          _swapToCheck();
          this.showToast("Passage copied!");
          this._dbgEvent("copyPassage: clipboard success");
        })
        .catch((err) => {
          console.error("Failed to copy:", err);
          this._dbgEvent(`copyPassage: clipboard error — ${err.message}`);
          this._copyFallback(content);
        });
    } else {
      this._copyFallback(content);
    }
  }

  _copyFallback(content, successMessage = "Passage copied!") {
    try {
      const ta = document.createElement("textarea");
      ta.value = content;
      ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      const btn = document.getElementById("copyPassage");
      if (btn) {
        btn.innerHTML = _CHECK_SVG;
        setTimeout(() => {
          btn.innerHTML = _COPY_SVG;
        }, 1500);
      }
      this.showToast(successMessage);
      this._dbgEvent("copyPassage: fallback execCommand success");
    } catch (err) {
      console.error("Copy fallback failed:", err);
      this.showToast("Failed to copy passage");
      this._dbgEvent(`copyPassage: fallback failed — ${err.message}`);
    }
  }

  showError(message) {
    this.passageText.innerHTML = `<div class="error">${message}</div>`;
  }

  showToast(message) {
    if (!this.toast) return;
    this.toast.textContent = message;
    this.toast.classList.add("show");
    setTimeout(() => this.toast.classList.remove("show"), 3000);
  }

  handleUserButtonClick() {
    handleUserButtonClick(this);
  }
  async handleLogin() {
    await handleLogin(this);
  }
  async handleSignup() {
    await handleSignup(this);
  }
  async handleLogout() {
    await handleLogout(this);
  }
  async loadUserData() {
    await loadUserData(this, normalizeTranslation);
  }
}

/* Service Worker & Update Toast */

async function registerServiceWorker(appInstance) {
  if (!("serviceWorker" in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register("./sw.js", {
      scope: "./",
    });
    appInstance?._dbgEvent?.("service worker registered: " + reg.scope);
    const pageBuildId =
      document.querySelector('meta[name="build-id"]')?.content || "";

    let updateToastShown = false;

    function maybeShowUpdateToast() {
      if (updateToastShown) return;
      updateToastShown = true;
      showUpdateToast(appInstance);
    }

    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "NEW_VERSION") {
        appInstance?._dbgEvent?.("service worker message: NEW_VERSION");
        maybeShowUpdateToast();
      }

      if (event.data?.type === "NEW_BUILD") {
        const swBuildId = event.data.buildId || "";
        if (pageBuildId && swBuildId && pageBuildId !== swBuildId) {
          appInstance?._dbgEvent?.(
            "service worker build mismatch: page=" +
              pageBuildId +
              " sw=" +
              swBuildId,
          );
          maybeShowUpdateToast();
        }
      }
    });

    let versionPollId = null;
    let versionCheckInFlight = false;
    let lastVersionCheckAt = 0;

    async function checkVersion(options = {}) {
      const { reloadOnUpdate = false, minIntervalMs = 0 } = options;

      if (!pageBuildId) return false;
      if (versionCheckInFlight) return false;

      const now = Date.now();
      if (minIntervalMs > 0 && now - lastVersionCheckAt < minIntervalMs) {
        return false;
      }

      versionCheckInFlight = true;
      lastVersionCheckAt = now;

      try {
        const response = await fetch("./version.txt", { cache: "no-store" });
        const remoteSha = (await response.text()).trim();

        if (!remoteSha || remoteSha === pageBuildId) return true;

        if (reloadOnUpdate) {
          appInstance?._dbgEvent?.(
            "service worker update check: reload requested remote=" +
              remoteSha +
              " page=" +
              pageBuildId,
          );
          window.location.reload();
        } else {
          maybeShowUpdateToast();
        }

        return true;
      } catch {
        return false;
      } finally {
        versionCheckInFlight = false;
      }
    }

    versionPollId = setInterval(
      () => {
        checkVersion();
      },
      5 * 60 * 1000,
    );

    window.addEventListener(
      "beforeunload",
      () => {
        if (versionPollId !== null) {
          clearInterval(versionPollId);
          versionPollId = null;
        }
      },
      { once: true },
    );

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;

      checkVersion({
        reloadOnUpdate: true,
        minIntervalMs: 60 * 1000,
      }).then((didCheck) => {
        if (didCheck) reg.update().catch(() => {});
      });
    });
  } catch (err) {
    console.warn("SW registration failed", err);
  }
}

function showUpdateToast(appInstance) {
  appInstance?._dbgEvent?.("service worker update toast shown");
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.innerHTML = "";

  const text = Object.assign(document.createElement("span"), {
    textContent: "A new version is available.",
  });

  const action = Object.assign(document.createElement("button"), {
    textContent: "Refresh",
    className: "toast-action",
  });

  const dismiss = Object.assign(document.createElement("button"), {
    textContent: "\u00d7",
    className: "toast-dismiss",
  });

  text.style.flex = "1";

  action.addEventListener("click", () => location.reload());
  dismiss.addEventListener("click", () => toast.classList.remove("show"));

  toast.append(text, action, dismiss);
  toast.classList.add("show");

  setTimeout(() => toast.classList.remove("show"), 30000);
}

(async () => {
  await new Promise((resolve) => {
    if (document.readyState !== "loading") {
      resolve();
      return;
    }

    document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });

  new BibleApp();
})();
