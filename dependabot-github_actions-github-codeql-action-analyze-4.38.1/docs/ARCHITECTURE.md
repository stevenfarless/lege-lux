# Bible Reader — Architecture & Developer Guide

This document explains the full codebase: what every file does, why it was built the way it was, and what a new developer needs to know to start contributing confidently. No prior context assumed.

---

## Table of Contents

1. [What This App Is](#what-this-app-is)
2. [Branch Strategy](#branch-strategy)
3. [How the App Boots](#how-the-app-boots)
4. [File Map](#file-map)
   - [Entry Points](#entry-points)
   - [Core Application](#core-application)
   - [Data Layer](#data-layer)
   - [UI Modules](#ui-modules)
   - [Firebase & Auth](#firebase--auth)
   - [Service Worker & PWA](#service-worker--pwa)
   - [Translations Data](#translations-data)
   - [Build Scripts & Dev Tools](#build-scripts--dev-tools)
   - [GitHub Actions Workflows](#github-actions-workflows)
   - [Tests](#tests)
5. [Data Formats](#data-formats)
   - [Translation JSON](#translation-json)
   - [Search Index JSON](#search-index-json)
   - [BSB Structure Scaffold](#bsb-structure-scaffold)
   - [Translation Index (index.json)](#translation-index-indexjson)
6. [State Management](#state-management)
7. [The Debug Panel](#the-debug-panel)
8. [Known Gaps & Best-Practice Notes](#known-gaps--best-practice-notes)
9. [Adding a New Translation](#adding-a-new-translation)
10. [Local Development](#local-development)

---

## What This App Is

A self-contained, offline-capable Bible reader PWA hosted on GitHub Pages. All Bible text is stored as JSON files directly in this repository — the app never calls a third-party Bible API at runtime. Firebase Realtime Database is used only for user account sync (reading position, settings). If Firebase is unavailable, the app still works fully in read-only mode.

The app is plain vanilla JavaScript with ES modules. No framework, no build step for the app itself. This was a deliberate choice: it keeps the runtime simple, avoids a build pipeline for the app code, and means any developer who knows HTML/CSS/JS can read the source directly.

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production. Protected. Only merged into from `dev` after review. |
| `dev` | Integration branch. Feature branches merge here first. |
| `exp` | Experimental work. Not guaranteed stable. Do not merge directly to `main`. |
| `gh-pages` | Auto-deployed by GitHub Actions. Do not commit to this manually. |

Deploy happens when `deploy-gh-pages.yml` runs on a push to `main`. It copies the repo contents (excluding dev-only files) to `gh-pages` and stamps a `version.txt` with the commit SHA. The service worker and the page both read `version.txt` to detect when a new deploy has landed.

---

## How the App Boots

Understanding the boot sequence prevents a whole class of "why is this broken" debugging sessions.

```
index.html loads
  └─ <script type="module" src="app.js">
       └─ IIFE at bottom of app.js:
            1. Wait for DOMContentLoaded
            2. Dynamically import config/firebase-config.bundle.js
               (sets window.firebaseAuth and window.firebaseDatabase)
            3. new BibleApp()
                 ├─ cacheElements() — grab all DOM refs
                 ├─ loadTheme() — apply saved color/light mode
                 ├─ attachEventListeners() — wire all UI events
                 │    └─ initSwipe(app) — set up three-panel swipe viewport
                 ├─ loadLocalSettings() + applySettings()
                 ├─ _restorePassageCache()
                 │    ├─ HIT + position match → revealApp(), skip fetch
                 │    ├─ HIT + position mismatch → revealApp(), then fetch new position
                 │    └─ MISS → revealApp() with loading spinner, then fetch
                 ├─ _loadTranslationRegistry() — populate translation selector
                 ├─ _prefetchCurrentBook() — background fetch other translations
                 └─ onAuthStateChanged()
                      └─ user signed in → loadUserData(), loadSavedPositionIfChanged()
```

`revealApp()` removes the `initializing` class from `<body>`, which triggers a CSS transition to show the page. It is called as early as possible — even before the passage fetch completes — so the user sees something instantly. The loading spinner inside the passage area covers the wait if the cache was cold.

---

## File Map

### Entry Points

#### [`index.html`](../index.html)

The only HTML file. Contains all markup: the header navigation bar, passage display area, all modals (book picker, chapter picker, verse picker, translation picker, settings, login, signup, user menu), the search overlay, the install banner, and the toast element. Styles are loaded via multiple `<link rel="stylesheet">` tags pointing into `css/`. The app is loaded with `<script type="module" src="app.js">`. There is no server-side rendering — this is a fully static file.

> **Best practice gap:** `index.html` contains all modal markup inline. As the modal count grows, consider splitting modals into `<template>` elements or separate includes at build time.

#### `css/` directory

The stylesheet has been split into focused files, all loaded by `index.html`. The root `styles.css` is a stub.

| File | Contents |
|---|---|
| `css/tokens.css` | CSS custom properties: color palette, spacing scale, radius, shadows, transitions |
| `css/base.css` | Reset and base element styles |
| `css/fonts.css` | `@font-face` declarations for self-hosted fonts in `fonts/` |
| `css/layout.css` | Page shell layout: header, footer, passage area positioning |
| `css/components.css` | All reusable UI components (buttons, inputs, toasts, install banner, etc.) |
| `css/modals.css` | Modal overlay and content styles for all pickers and dialogs |
| `css/themes.css` | Color theme definitions applied via `data-theme` attribute on `<body>` |
| `css/pericope.css` | Pericope heading and paragraph break styles for BSB |
| `css/interactions.css` | Swipe viewport, transition, and animation styles |
| `css/utilities.css` | Single-purpose utility classes |

Light/dark mode is toggled via a `.light-mode` class. Color themes are set via a `data-theme` attribute on `<body>`. Responsive layout uses media queries throughout.

---

### Core Application

#### [`app.js`](../app.js)

The root module. Contains `BibleApp`, the single application class that owns all state and coordinates every other module. Also contains the PWA install prompt logic, the service worker registration, and the update toast.

`BibleApp` does not implement any feature directly — it delegates everything to the imported modules and re-exposes their functions as methods. For example, `app.toggleSearch()` just calls `toggleSearch(this)` from `search.js`, passing itself as context. This pattern means every module receives `app` as its first argument and can read/write `app.state`, `app.bibleApi`, and all DOM references cached on the instance.

> **⚠️ REMOVE BEFORE MERGING TO MAIN:** The debug panel (`buildDebugReport`, `showDebugPanel`, `initDebugTrigger`), the fetch interceptor, the JS error log, `window._bibleApp`, and `window._buildDebugReport` are all marked for removal. They exist to support Playwright test diagnostics and mobile debugging. Do not ship these to production — they expose internal state.

#### [`reading-state.js`](../reading-state.js)

Initializes `app.state` from `localStorage` on first load. `app.state` is the single source of truth for: current book, current chapter, current translation, font size, color theme, light mode, and all display toggle flags (verse numbers, headings, footnotes, cross-references, verse-by-verse mode). Also contains `navigateChapter()`, `scrollToVerse()`, and `applyVerseGlow()`.

#### [`bible-api.js`](../bible-api.js)

The data layer. `BibleApi` handles all Bible text fetching and search. Two routing paths exist:

- **Local translations** (`LOCAL_TRANSLATIONS` set): Fetches `./translations/{TRANSLATION}/{Book}.json`. These are static files in the repo. An in-memory `_bookCache` (Map) prevents repeat fetches within a session.
- **Firebase translations**: Fetches from Firebase Realtime Database at path `/translations/{translation}/{book}`. Used for translations that are too large or legally restricted to commit to the repo.

Downloaded translations that are fetched on demand are persisted to IndexedDB via `translation-store.js`, so subsequent sessions don't require a network fetch.

Search works via a prebuilt flat index (`{T}_search_index.json`) for local translations, which is a `{ "Genesis 1:1": "lowercased verse text", ... }` map. This avoids scanning all 66 book files on every search. If the index is absent, it falls back to scanning `_bookCache` directly (slow but functional).

Book name aliasing is handled in two layers: `book-aliases.js` normalises user-typed abbreviations into canonical names, and `BOOK_KEY_ALIASES` inside `bible-api.js` handles filename-on-disk differences (e.g., `Song of Solomon` vs `Song Of Solomon`).

> **Consistency note:** `BOOK_KEY_ALIASES` in `bible-api.js` and the alias map in `book-aliases.js` serve different purposes but live in two files. A new developer will expect both to be consulted when a book name resolution fails. Document this at the call sites.

#### [`translation-store.js`](../translation-store.js)

IndexedDB persistence layer for on-demand downloaded translations. Stores per-book JSON objects and search indexes so they survive page reload without a re-fetch. Three object stores:

- `books` — keyed `"{translation}/{book}"`, value is the book JSON object
- `searchIndex` — keyed by translation id, value is the full search index object
- `downloaded` — keyed by translation id, value `true`; presence check without reading every book

Exported functions: `idbGetBook`, `idbPutBook`, `idbGetSearchIndex`, `idbPutSearchIndex`, `idbIsDownloaded`, `idbMarkDownloaded`, `idbDeleteTranslation`. Used by `bible-api.js` as the cache layer between in-memory `_bookCache` and network fetches.

#### [`bible-structure.js`](../bible-structure.js)

Holds the canonical 66-book structure: testament grouping, chapter counts, and display names. Used to populate the book/chapter picker modals and to validate navigation. `initializeBibleStructure()` returns the base structure; `buildBibleBooks(meta)` can override it from a translation's `meta.json` (for translations with non-standard canons like the Apocrypha).

#### [`bsb-structure.js`](../bsb-structure.js)

Loads the BSB pericope scaffold JSON from `./translations/BSB/bsb_structure.json`. The scaffold is a pre-processed list of events (type: `heading` or `para_break`) keyed by book and chapter. `eventsForChapter(allEvents, chapter)` extracts just the events needed for a single chapter render. `bible-api.js` uses these events in `_buildPassageHtml()` to insert `<h3 class="pericope-heading">` tags and paragraph breaks at the correct verse positions. `swipe.js` also calls `loadStructure` and `eventsForChapter` directly when pre-rendering adjacent panels. Only BSB uses this — other translations render as a single flat `<p>`.

#### [`book-aliases.js`](../book-aliases.js)

Exports `normaliseBookAlias(raw)`. Takes any user-typed book name or abbreviation (e.g., `"jn"`, `"1co"`, `"song"`) and returns the canonical full name (e.g., `"John"`, `"1 Corinthians"`, `"Song of Solomon"`). Used by `bible-api.js` when parsing references from search and URL fragments.

---

### UI Modules

All UI modules receive `app` as their first argument. They read DOM elements off `app` (e.g., `app.passageText`, `app.searchInput`) and call `app` methods for any state changes.

#### [`ui.js`](../ui.js)

`cacheElements(app)` — called once at init, queries every DOM element the app needs and assigns them to `app` properties (e.g., `app.passageText = document.getElementById('passageText')`). If you add a new DOM element that any module needs, register it here.

`loadTheme(app)`, `toggleTheme(app)`, `changeColorTheme(app, theme)` — read/write `localStorage` and update `<body>` class/attribute.

#### [`events.js`](../events.js)

`attachEventListeners(app)` — the single place all event listeners are registered. Click, keydown, scroll, touch, resize, and visibility change handlers all live here. It also calls `initSwipe(app)` to set up swipe navigation. If something isn't responding to a user action, check here first.

#### [`swipe.js`](../swipe.js)

Three-panel drag-follow chapter navigation for touch devices. On `initSwipe(app)`, it wraps `#passageText` in a `#swipeViewport` clipping div and creates two sibling panels (`#swipePrev`, `#swipeNext`) positioned off-screen left and right.

After every `loadPassage()` resolves, `app.swipe.syncAdjacentPanels()` pre-renders the previous and next chapters into the sibling panels using the same `bibleApi` render pipeline (including BSB pericope scaffold). On a committed swipe, the incoming panel is promoted to `#passageText`: its node is swapped in the DOM, `app.passageText` is reassigned to the new centre node, and the outgoing panel moves to the far side. `app.swipe.prevPanel` and `app.swipe.nextPanel` are both reassigned so the next drag always references the correct nodes.

A `_animating` flag is set true from the moment a commit animation starts until the `setTimeout` callback completes, preventing concurrent panel swaps from corrupting slot references. A `ResizeObserver` on the viewport re-snaps panels to their off-screen positions on resize or orientation change.

#### [`modals.js`](../modals.js)

Handles the book picker, chapter picker, verse picker, and translation picker modals. `openModal` / `closeModal` toggle the `.active` class. The populate functions (`populateBookModal`, `populateChapterModal`, etc.) build the modal content dynamically from `app.state` and `app.bibleBooks`. The translation modal also handles keyboard navigation (`translationKbMove`, `translationKbSelect`).

#### [`search.js`](../search.js)

The search overlay. Handles two input types:

1. **Passage reference** (e.g., `"John 3:16"`) — detected by `isPassageReference()`, resolved by `handlePassageReference()`, which calls `app.bibleApi._parseReference()` and then `app.loadPassage()`.
2. **Keyword search** — calls `app.bibleApi.searchPassages(query, onBatch)`. The `onBatch` callback lets results stream in as each translation batch completes. Results are grouped by OT/NT/Apocrypha and then by book.

#### [`settings.js`](../settings.js)

Reads/writes user preferences. `loadLocalSettings(app)` hydrates `app.state` from `localStorage`. `applySettings(app)` applies them to the DOM (font size, verse numbers visibility, etc.). `changeTranslation(app, t)` fetches the new translation's `meta.json`, calls `app._rebuildBibleBooks(meta)`, updates `app.bibleApi`, and reloads the current passage.

#### [`navigation.js`](../navigation.js)

`updateNavigationState(app)` enables/disables the prev/next chapter buttons based on current position in the canon. `navigateToNextVerse` / `navigateToPreviousVerse` are used in verse-by-verse mode.

#### [`keyboard.js`](../keyboard.js)

Handles keyboard shortcuts: arrow keys for chapter navigation, `/` to open search, `Escape` to close modals/search.

---

### Firebase & Auth

#### [`firebase-config.js`](../firebase-config.js)

Exports `FIREBASE_DB_URL` — the Realtime Database URL string. This is the only file that contains the Firebase project credentials. It is intentionally public because Firebase Realtime Database rules restrict write access to authenticated users, and the database URL alone is not a security risk for a read-only app.

> **Note for new developers:** If you fork this repo for a different project, replace the Firebase config here and update the security rules in the Firebase console.

#### [`config/firebase-config.bundle.js`](../config/firebase-config.bundle.js)

A self-contained bundle of the Firebase Auth and Database SDKs plus initialization logic. Sets `window.firebaseAuth` and `window.firebaseDatabase`. Loaded via dynamic `import()` in `app.js` so a network failure loading Firebase does not block the app from starting — it just disables auth.

This bundle is generated by the [`build-firebase-bundle.yml`](../.github/workflows/build-firebase-bundle.yml) workflow using `esbuild`. Run that workflow if Firebase SDK versions need to be updated.

#### [`auth.js`](../auth.js)

All Firebase Auth interactions: `handleLogin`, `handleSignup`, `handleLogout`. Also `loadUserData(app)`, which reads the signed-in user's saved reading position and settings from RTDB and merges them into `app.state`. `loadSavedPositionIfChanged(app)` compares the Firebase-synced position against the locally stored one and calls `app.loadPassage()` only if they differ — avoiding an unnecessary page reload when the user opens the app on a device they last used.

---

### Service Worker & PWA

#### [`sw.js`](../sw.js)

A standard cache-first service worker. On install, it precaches all app shell files (HTML, CSS, JS, manifests). On fetch, it serves from cache first, falling back to network. When a new service worker installs, it posts a `NEW_VERSION` message to the page. The page's `registerServiceWorker()` function in `app.js` listens for this and shows the update toast.

The `version.txt` polling in `registerServiceWorker()` is a secondary update detection mechanism — it checks every 5 minutes and on each `visibilitychange`. If the version differs, it reloads immediately. This handles the case where the SW update cycle is slow.

#### [`site.webmanifest`](../site.webmanifest)

PWA manifest. Defines app name, icons, display mode (`standalone`), and theme color. The install banner in `app.js` listens for `beforeinstallprompt` and shows a UI prompt using the deferred event.

---

### Translations Data

#### `translations/` directory

Structure per translation:

```
translations/
  index.json                          ← registry of all available translations
  {TRANSLATION}/
    {Book}.json                       ← one file per book
    {TRANSLATION}_search_index.json   ← flat ref→text index for keyword search
    meta.json                         ← canon metadata (book list, chapter counts, label, copyright)
  BSB/
    bsb_structure.json                ← pericope headings + paragraph break events
```

The book JSON shape is:
```json
{
  "BookName": {
    "1": { "1": "verse text", "2": "verse text" },
    "2": { "1": "verse text" }
  }
}
```

Keys at every level are strings. Chapter `"0"` is a special key used for prologues (e.g., Psalm superscriptions). The book name key matches the canonical name from `bible-structure.js`, with the exception of `Song Of Solomon` (note capitalisation) — see `BOOK_KEY_ALIASES` in `bible-api.js`.

#### [`translations/index.json`](../translations/index.json)

The translation registry. Shape:
```json
{
  "translations": [
    { "id": "KJV", "label": "King James Version", "copyright": "Public domain" },
    ...
  ]
}
```

Loaded at startup by `_loadTranslationRegistry()`. Populates the translation selector dropdown and the `_copyrightMap` used by the footer copyright notice.

#### [`cross_references.txt`](../cross_references.txt)

8.3MB tab-delimited cross-reference dataset. Not currently consumed by the app at runtime — it exists as source material for a planned cross-reference feature. Do not delete.

---

### Build Scripts & Dev Tools

#### `scripts/` directory

Python scripts run by GitHub Actions workflows. They are not part of the app runtime.

- `convert_bsb.py` — Downloads the BSB tab-delimited source from bereanbible.com, converts it to per-book JSON, writes to `translations/BSB/`.
- `split_translations.py` — Takes a monolithic translation JSON and splits it into per-book files plus a search index.
- `build-search-index.py` — Builds search indexes for Firebase-hosted translations and uploads them to RTDB.
- `build_bsb_structure.py` — Parses BSB USFM source files (from HelloAOLab/bible-api) and generates `bsb_structure.json`.
- `generate_meta.py` — Inspects translation directories and generates `meta.json` per translation.

#### `dev-scripts/` directory

One-off utility scripts used during development. These are not automated.

#### [`dev-serve.py`](../dev-serve.py)

A local HTTP server for development. Run `python dev-serve.py` from the repo root. It serves the app at `http://localhost:8080` with the correct `Content-Type` headers for ES modules. The service worker will register in this environment. Do not use `python -m http.server` — it does not set the correct MIME types.

---

### GitHub Actions Workflows

All workflows live in [`.github/workflows/`](../.github/workflows/). The ones that run automatically on schedule or push are the most important to understand.

| Workflow | Trigger | What it does |
|---|---|---|
| [`deploy-gh-pages.yml`](../.github/workflows/deploy-gh-pages.yml) | Push to `main` | Copies repo to `gh-pages` branch; stamps `version.txt` |
| [`build-firebase-bundle.yml`](../.github/workflows/build-firebase-bundle.yml) | Manual | Bundles Firebase SDK into `config/firebase-config.bundle.js` |
| [`convert-bsb.yml`](../.github/workflows/convert-bsb.yml) | Manual / schedule | Downloads BSB source, runs `convert_bsb.py`, commits JSON to branch |
| [`convert-bible.yml`](../.github/workflows/convert-bible.yml) | Manual | General translation conversion |
| [`split-translations.yml`](../.github/workflows/split-translations.yml) | Manual | Splits monolithic JSON → per-book files + search index |
| [`build-bsb-structure.yml`](../.github/workflows/build-bsb-structure.yml) | Manual | Regenerates `bsb_structure.json` from USFM source |
| [`generate-meta.yml`](../.github/workflows/generate-meta.yml) | Manual | Regenerates `meta.json` files for all translations |
| [`build-search-index.yml`](../.github/workflows/build-search-index.yml) | Manual | Builds and uploads RTDB search indexes |
| [`upload-translations.yml`](../.github/workflows/upload-translations.yml) | Manual | Uploads translation JSON to Firebase RTDB |
| [`sync-translations.yml`](../.github/workflows/sync-translations.yml) | Manual | Syncs local and Firebase translation data |
| [`playwright.yml`](../.github/workflows/playwright.yml) | Push to `main`/`dev` | Runs Playwright end-to-end tests |
| [`unit-tests.yml`](../.github/workflows/unit-tests.yml) | Push to `main`/`dev` | Runs Vitest unit tests |
| [`audit-translations.yml`](../.github/workflows/audit-translations.yml) | Manual | Checks translation files for structural issues |
| [`normalize-translations.yml`](../.github/workflows/normalize-translations.yml) | Manual | Normalises key casing and encoding across translation files |
| [`vendor-firebase.yml`](../.github/workflows/vendor-firebase.yml) | Manual | Updates vendored Firebase SDK files in `vendor/` |
| [`codeql.yml`](../.github/workflows/codeql.yml) | Push to `main` | GitHub CodeQL security scanning |

---

### Tests

#### `tests/` directory

Playwright end-to-end tests. They run against the live deployed app or a local server. The Playwright config is [`playwright.config.js`](../playwright.config.js).

Unit tests use Vitest, configured in [`vitest.config.js`](../vitest.config.js). Run with `npm test`.

`package.json` defines the test commands. There is no build command for the app itself — `npm run dev` starts `dev-serve.py`.

---

## Data Formats

### Translation JSON

Per-book file at `translations/{T}/{Book}.json`:
```json
{
  "Genesis": {
    "0": "optional prologue text",
    "1": {
      "1": "In the beginning God created the heavens and the earth.",
      "2": "Now the earth was formless and empty..."
    }
  }
}
```
All keys are strings. The outer key is always the full book name. Chapter keys start at `"1"`. Verse `"0"` is reserved for prologues.

### Search Index JSON

At `translations/{T}/{T}_search_index.json`:
```json
{
  "Genesis 1:1": "in the beginning god created the heavens and the earth.",
  "Genesis 1:2": "now the earth was formless and empty..."
}
```
All text values are pre-lowercased at build time. The key format is always `"{Book} {chapter}:{verse}"` with no padding.

### BSB Structure Scaffold

At `translations/BSB/bsb_structure.json`:
```json
{
  "Genesis": {
    "1": [
      { "v": 1, "type": "heading", "text": "The Creation" },
      { "v": 1, "type": "para_break" }
    ]
  }
}
```
`v` is the verse number the event precedes. `type` is either `"heading"` or `"para_break"`. Headings are suppressed when the user disables the "Show Headings" setting.

### Translation Index (index.json)

At `translations/index.json`:
```json
{
  "translations": [
    { "id": "KJV", "label": "King James Version", "copyright": "Public domain" },
    { "id": "BSB", "label": "Berean Standard Bible", "copyright": "..." }
  ]
}
```
`id` must match the directory name under `translations/` exactly (case-sensitive on Linux, the GitHub Actions runner OS).

---

## State Management

`app.state` is a plain object. It is the only mutable global state. All modules receive `app` and mutate `app.state` directly — there is no reactive system or event bus. The persistence contract is:

- Settings are written to `localStorage` by `settings.js` whenever they change.
- Reading position (`book`, `chapter`, `scrollY`) is written to `localStorage` by `reading-state.js` on navigation.
- When a user is signed in, reading position and settings are also written to Firebase RTDB at `/users/{uid}/`.
- On boot, `reading-state.js` reads from `localStorage` first. Firebase sync happens after `onAuthStateChanged` fires, which can be several seconds into the session.

The `passageCache` in `localStorage` stores the last rendered HTML with its book/chapter/translation key. On boot, if the cache key matches `app.state`, the HTML is injected directly without a fetch. This is what makes the app feel instant on repeat visits.

Downloaded translations are persisted to IndexedDB (`translation-store.js`) so they survive sessions without re-fetching from Firebase.

---

## The Debug Panel

Triple-tap the header bar (mobile) or triple-click it (desktop) to open. It shows:

- Environment and network info
- Full boot timing breakdown
- localStorage snapshot
- passage cache hit/miss
- All network fetches with timing and status
- JS errors caught during the session
- Service worker cache contents

Tap the panel to copy to clipboard. Tap outside to close.

**This entire panel must be removed before merging to `main`.** Search `app.js` for `// REMOVE BEFORE MERGING TO MAIN` to find all the affected blocks.

---

## Known Gaps & Best-Practice Notes

1. **`app.js` is a coordination hub but also contains unrelated code.** The debug panel, PWA install prompt, service worker registration, and `BibleApp` class are all in one file. The debug panel in particular should live in `debug.js` and be tree-shaken or conditionally imported in development builds only.

2. **No module bundling for the app.** ES modules load as individual network requests. On a cold cache with 15+ JS files, this adds latency. A bundler like Vite would solve this without changing the source code. Low priority while the SW precaches everything, but worth considering as the file count grows.

3. **`bookAbbreviations` is hardcoded in `app.js`.** It duplicates data from `book-aliases.js`. The abbreviation map should live only in `book-aliases.js` and be imported where needed.

4. **`LOCAL_TRANSLATIONS` is defined in `bible-api.js` but must be kept manually in sync** with the actual `translations/` directory contents. If a translation directory exists but is not in this Set, the app will try to fetch it from Firebase and fail. The `audit-translations.yml` workflow catches this, but a developer adding a new translation manually could miss it.

5. **No error boundaries in the UI.** If `loadPassage()` throws after clearing `passageText.innerHTML`, the user sees an empty passage area. The `try/catch` in `init()` calls `revealApp()` as a fallback, but individual passage loads that fail mid-render can leave partial HTML. A consistent error display helper would help.

6. **Firebase SDK is loaded via dynamic import in `app.js`.** The `await import('https://www.gstatic.com/firebasejs/...')` inside `init()` is for the connectivity listener only. This is an external CDN call that bypasses the service worker cache. It should either be vendored (the `vendor/` directory exists for this) or removed and replaced with the already-bundled SDK in `config/firebase-config.bundle.js`.

7. **`bsb-structure.js` only supports BSB.** The scaffold system (`eventsForChapter`, `loadStructure`) is generic enough to support any translation, but only BSB has a corresponding `bsb_structure.json`. The file is named after BSB specifically. If you build scaffolds for other translations, generalise the loader and rename accordingly.

---

## Adding a New Translation

1. Obtain the source text (tab-delimited, USFM, or other format).
2. Write or adapt a conversion script in `scripts/` — use `convert_bsb.py` as a reference.
3. Create a GitHub Actions workflow in `.github/workflows/` following the pattern in `convert-bsb.yml`.
4. Run the workflow. It will commit per-book JSON files to `translations/{NEW_TRANSLATION}/`.
5. Run `split-translations.yml` to generate the search index.
6. Run `generate-meta.yml` to create `meta.json` for the new translation.
7. Add `"NEW_TRANSLATION"` to `LOCAL_TRANSLATIONS` in [`bible-api.js`](../bible-api.js).
8. Run `upload-translation-index.yml` or manually update [`translations/index.json`](../translations/index.json) with the new entry.
9. Verify the translation loads in the app by switching to it in the translation picker.

---

## Local Development

```bash
# Clone the repo
git clone https://github.com/stevenfarless/lege-lux.git
cd bible

# Install test dependencies (Playwright, Vitest only — app has no npm runtime deps)
npm install

# Start the dev server
python dev-serve.py
# Opens at http://localhost:8080

# Run unit tests
npm test

# Run Playwright tests (requires a running server)
npx playwright test
```

The app has **zero npm runtime dependencies**. `npm install` only installs Playwright and Vitest for testing. The app itself runs on bare HTML/CSS/JS with no build step.

Firebase credentials in `firebase-config.js` and `config/firebase-config.bundle.js` are already checked in and intentionally public — see the [Firebase & Auth](#firebase--auth) section for why this is acceptable.
