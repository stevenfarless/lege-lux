# Changelog

All notable changes to this project will be documented in this file. Versions follow [Semantic Versioning](https://semver.org/). Unreleased changes accumulate here until a version is tagged.

> This file was moved from the root to `docs/CHANGELOG.md`.

---

## [Unreleased]

### Changed
- Translation auto-switch delayed 1 second after download completes so the checkmark is visible before the modal closes and the reader switches

---

## [v1.11.0-dev] — 2026-06-05

### Translation downloads

- `LOCAL_TRANSLATIONS` narrowed to KJV + BSB only; all other translations download on demand
- `TranslationStore` IndexedDB layer added — downloaded books are stored per-translation and loaded from IDB before falling back to network
- Tapping a non-installed translation triggers an inline download with a progress bar showing book count (`done / total`)
- Custom SVG icons: download arrow, animated spinner, checkmark for downloaded state
- `hidden` attribute on the progress bar no longer overridden by `display:flex` — CSS specificity fix
- Song of Solomon 404 resolved; download button styling corrected
- `translations/index.json` updated with `precache:true` on BSB and KJV entries

### Translation modal redesign

- List split into **Installed** and **Available** sections with section heading styles
- Modal stays open after a download completes — user taps any installed translation to switch; multiple translations can be downloaded sequentially without reopening the modal
- Installed translations show a checkmark; tapping one switches and closes the modal

### Swipe-to-delete / hover-to-delete

- On touch: swiping an installed translation row left reveals a trash icon; swipe past threshold to confirm, swipe back to cancel
- Trash button hidden by default — visible only after swipe threshold is crossed
- Touch listeners scoped to the row element only — `touchmove`/`touchend` never attach to `document`, preventing swipe events from bleeding through the modal backdrop onto the Bible text
- Only one row can be open at a time; touching another row collapses the open one
- On desktop (hover-capable): trash icon appears inline on hover

### Fly animation

- After download completes, the item pauses with the checkmark for 500 ms then flies as a `position:fixed` clone to its alphabetical slot in the Installed section
- On uninstall, the item flies in reverse to its alphabetical slot in Available
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` at 420 ms
- Clone appended to `document.body` to escape the modal scroll container; destination node hidden until `transitionend`, then revealed and clone removed
- Multiple in-flight animations are independent

### Search fixes

- Empty search index (IDB entry is `{}`) now treated as `null` so the book-by-book scan fallback is used instead of returning 0 results
- `bookList` now passed to `parseReference` in `groupSearchResultsByCanon`, fixing lazy-quantifier misparsing of book names that caused results to drop from OT/NT grouping

### CI

- Bundler renamed from `.js` to `.cjs` to work under `"type": "module"` in `package.json`
- CI pull step uses `--rebase` before push to avoid rejection on concurrent bot commits

---

## [v1.10.0-dev] — 2026-06-03

### Swipe gesture chapter navigation

- Three-panel drag-follow navigation (`swipe.js`) wraps `#passageText` in a `#swipeViewport` clipping container on init
- Prev/next panels pre-rendered after every `loadPassage()` resolves via `syncAdjacentPanels()`
- `touchmove` translates all three panels in real time with a 30° angle guard to avoid conflicting with vertical scroll
- `touchend` commits (≥35% vw) with a slide animation that promotes the incoming panel, or cancels with a spring-back
- Modal-open and search-open states suppress swipe; gesture lock prevents concurrent panel swaps during commit animation
- Font size copied to incoming panel on commit; `swipe.js` added to SW `APP_SHELL` precache

### Reading font selector

- New font selector in Settings: Gentium Book Plus (default serif), Andika, Ubuntu, OpenDyslexic3
- Selection persists to `localStorage` and Firebase for signed-in users
- All four fonts ship as self-hosted `woff2` files with `@font-face` declarations; preloaded via `<link rel="preload">` to reduce LCP
- `applyReadingFont()` in `settings.js` manages body class swaps

### Typography

- Default passage font changed from Crimson Text to **Gentium Book Plus** — updates `--font-serif` CSS token; affects `.passage`, `.passage-text`, and `.search-result-content`
- Dracula dark mode: logo now renders in Dracula orange

### Bug fixes

- **SW translation coverage** — `TRANSLATIONS` array updated from 8 to 16 entries; CSB, ESV, ISV, MEV, NIV, NKJV, NLT, NRSVUE were missing from `PER_BOOK_PRECACHE` logic
- **Passage paragraph spacing** — removed bottom margin from `.passage-para`; restored heading clearance (`margin-top`)
- **Empty verses** — `bible-api.js` now emits a `.verse-spacer` div for empty verse slots to preserve paragraph structure
- **Deuterocanon testament label** — renamed `'Other'` to `'Deuterocanon'` in NRSVUE and WEB `meta.json`
- **OpenDyslexic3 font URL** — corrected broken `src` URL for `OpenDyslexic3-Bold` `@font-face`
- **Font class typo** — fixed `classList.remove` referencing wrong class during font switching
- **Swipe panel refs** — touch handlers now read from `app.swipe` to prevent stale-closure breakage; corrected inverted ref assignment post-commit

### Performance

- **SW precache reduced** — `HIGH_VALUE_BOOKS` trimmed to Genesis + John only (was + Matthew, Romans, Psalm), saving ~1.8 MB from the install payload

### CI / Security

- CodeQL `js/http-to-file-access` false positives suppressed in `build-web-structure.mjs` and `fetch-apocrypha.js`
- CodeQL `js/incomplete-url-substring-sanitization` fixed in fetch log classifier via `URL` parsing
- CodeQL workflow now triggers on `workflow_dispatch` and the `exp` branch
- `upload-all` workflow added to upload translations then index from `exp` in a single run

---

## [v1.9.0-dev] — 2026-06-01

### Bug fixes

- **Deuterocanonical book prefetch** — `_prefetchCurrentBook()` now skips cross-translation prefetching when the current book is outside the 66-book Protestant canon, preventing a flood of 404s on startup for translations that don't include those books

### Accessibility

- **Orphaned `<label>` elements** — added missing `for` attributes to 6 labels in Settings and auth forms (`themeSelector`, `fontSizeSlider`, `loginEmail`, `loginPassword`, `signupEmail`, `signupPassword`); previously unassociated labels broke click-to-focus behavior and produced accessibility warnings

---

## [v1.8.0-dev] — 2026-05-31

### WEB translation

- Added full World English Bible (WEB) text including canonical OT+NT and all available Deuterocanonical books
- Source: [ebible.org](https://ebible.org/Scriptures/eng-webbe_usfx.zip) — public domain
- `fetch_and_fix_web` script combines USFX fetch and meta repair into a single workflow run
- `meta.json` chapter counts repaired and new books/translations registered automatically

### WEB structure scaffold

- `extract_web_structure.py` parses USFX to extract section headings and paragraph breaks
- Generates `WEB_structure` per-book JSON scaffold for use by the reader UI
- Build workflow registered on `dev` and targets `exp` branch for output

### CI / workflow improvements

- `sync-translations` workflow rewritten to bidirectionally sync translation folders between two branches in a single run
- `ls-tree` output normalized to bare filenames before `comm` comparison and `GITHUB_OUTPUT` assignment
- Filename regex updated to handle `NN-ABBReng-webbe.usfx` format
- Heredoc workflow replaced with a committed script to fix regex escaping across runner environments
- `fix-meta` workflow added to repair chapter counts on demand
- CI data source switched from `main-book-update` to `dev`; added subdirectory recursion for `BSB_structure`

### Bug fixes

- Removed spurious `ASV_search_index` entry from ASV `meta.json`
- Fixed `TARGET_BRANCH` env var collision with `GITHUB_REF_NAME` in scripts
- Search index files excluded from `meta.json` registration

---

## [v1.8.0-exp] — 2026-05-31

### Extended canon support (Apocrypha / Deuterocanon)

- Translations with deuterocanonical books (NRSVUE, WEB) now show an **Apocrypha / Deuterocanon** section in the book picker between the Old and New Testaments
- `buildBibleBooks()` in `bible-structure.js` enforces OT → Apocrypha/Deuterocanon → NT ordering regardless of source order in `meta.json`
- A `?` info button next to the section heading opens an **About the Apocrypha / Deuterocanon** modal with quotes from Luther, the Thirty-Nine Articles, the Belgic Confession, and the Book of Common Prayer

### Data fixes

- Removed spurious `info` book entry from all affected translation `meta.json` files: NRSVUE, CSB, ESV, ISV, MEV, NIV, NKJV, NLT — leftover artifact from source data conversion

### Bug fixes

- `closeDeuterocanonInfoModal` was registered in `REQUIRED_IDS` but never assigned on `app`, so the close button silently no-oped — now explicitly assigned in `cacheElements()`
- Close button displayed `Ã«` (Latin-1 mojibake) instead of `×` — corrected in `index.html`

---

## [v1.7.0-dev] — 2026-05-31

### Per-book translation files

- All 8 local translations (ASV, BLB, BSB, KJV, LEB, MSB, NET, WEB) split into one JSON file per book instead of a single monolith per translation
- `split_translations.py` generates `{Book}.json` and `{T}_search_index.json` per translation; run via `.github/workflows/split-translations.yml`
- Service worker precaches 5 high-value books × 8 translations (~3 MB) instead of full monoliths (~35 MB) on activation
- `bible-api.js` loads only the book needed for the current passage, then caches it in memory

### Bug fixes

- `HIGH_VALUE_BOOKS` entry corrected to `'Psalm'` to match filename output from `BOOK_ORDER` in `split_translations.py`
- Deduplicated concurrent search index fetches via `_searchIndexFetchPromise` map — two rapid searches before the first ~500 KB index resolved previously issued duplicate requests
- Deduplicated concurrent BSB structure fetches via `_fetchPromise` map
- Renamed `_prefetchAdjacentChapters` → `_prefetchAdjacentBooks` at definition and all call sites
- Reverted hardcoded branch default back to dynamic `GITHUB_REF` in `split-translations.yml`

### Promise-coalescing pattern

All three async loaders now use the same guard: check settled cache → check in-flight promise map → fetch, store promise, delete in `finally`. Applies to `_loadBook`, `_loadSearchIndex`, and `loadStructure`.

---

## [v1.6.0-dev] — 2026-05-28

### Search overhaul (megasearch)

- **Delegated touch handling** — `#searchResults` uses a single delegated `touchend`/`click` listener instead of per-element listeners; eliminates ghost-taps and double-render on iOS
- **Scroll vs. tap discrimination** — `touchend` is ignored if the finger moved >10 px or the container `scrollTop` changed since `touchstart`
- **Search panel closes before passage load** — prevents an iOS race where the panel and passage rendered simultaneously
- **Enter key activates focused result** — `activateSelectedSearchResult` is called on Enter whenever a result is highlighted; falls back to blur-only when nothing is selected
- **Prefix matching** — trailing `\b` removed from `_buildWordRegex` so "hate" matches "hated", "hateful", "hateth"; leading `\b` retained to exclude mid-word hits like "whatever"

### Translations

- **BLB added to translation selector** — `BLB_bible.json` was already in the repo; added to `index.json` so it appears in the UI

### Bug fixes

- `loadStructure()` now fetches from local `./translations/BSB/BSB_structure/` files instead of Firebase, removing the RTDB dependency for BSB entirely

### CI / Testing

- Playwright smoke suite expanded to 18 tests covering navigation, translation switching, search (keyword + reference + close), reading position, passage cache, settings (verse numbers, verse-by-verse, font size, color theme, light mode), and keyboard arrow navigation
- `openSettingsSection` helper opens and expands the correct accordion before any interaction with hidden selectors
- Passage cache test asserts against the actual `passageCache` key shape `{ book, chapter, html }`
- Clipboard test removed — `navigator.clipboard.readText()` is inaccessible in headless Chromium

---

## [v1.5.0-dev] — 2026-05-26

### App architecture split

`app.js` split into focused modules — `settings.js`, `keyboard.js`, and `events.js`. All modules preloaded via `<link rel="modulepreload">` in `index.html` to eliminate the module waterfall on first load.

### Search overhaul

- **Prebuilt flat search index** — `searchPassages()` checks for a prebuilt `ref → lowercased-text` index at `/searchIndex/{translation}` in RTDB; when present the entire corpus is searched in a single round trip and cached in memory
- **Whole-word matching** — `.includes(q)` replaced with a `\b`-bounded `RegExp` in both the fast path and the per-book fallback (closes #144)
- **Grouped results by canon** — results organized under collapsible Old Testament / New Testament headings, each with collapsible per-book groups; first testament and first book auto-expand
- **Passage reference fast path** — queries that look like references (`John 3:16`, `1 Sam 3`) skip keyword search entirely
- **Numbered book fix** — `parseReference` now correctly captures book names with numeric prefixes (`1 Samuel`, `2 Kings`, `3 John`)

### Debug panel

Triple-tap the header (or triple-click on desktop) opens a diagnostic overlay showing boot timings, cache state, localStorage values, and a full session event log.

### Performance & startup

- Cache restore on startup: if `passageCache` matches the saved reading position, the app skips the RTDB fetch entirely and reveals immediately
- If the cache exists but the saved position differs, cached content is painted first for a fast first render, then the correct passage loads in the background
- Service worker registration moved off the critical path — runs in background, does not block `init()`

### Bug fixes

- `S` keyboard shortcut (toggle section headings) was missing from the help modal — added (closes #127)
- Service worker registration path confirmed correct (`./sw.js`, `scope: './'`) (closes #80)

---

## [v1.4.0-dev] — 2026-05-25

Snapshot of `dev` capturing the search branch merge before the `appsplit` refactor lands.

---

## [v1.3.0-firebase] — 2026-05-23

### Bug fixes

- **`parseReference` fails on numbered books** — lazy `.+?` capture stopped at the first space before a digit, so `1 Samuel 3:1`, `2 Kings 5:1`, and `3 John 1:4` parsed as `book="1"` and were dropped by `groupSearchResultsByCanon`; replaced with a greedy capture that consumes the full book name

---

## [v1.2.0-firebase] — 2026-05-23

### Bug fixes

- **Firebase init race** — replaced polling `initializeBibleApp()` + `DOMContentLoaded` with a top-level `async` IIFE that `await`s `firebase-config.js` before constructing `BibleApp`; eliminates the freeze on "Loading passage..." in production (closes #116)
- **`bible-api.js` import path & export** — corrected the module import path and exported `FIREBASE_DB_URL` so dependent modules resolve correctly
- **Search results always empty** — `searchPassages()` was returning `{ reference, content }` but `renderSearchResults()` destructures `{ book, chapter, verse, text }`; reshaped the push to match
- **BSB scaffold never loading** — `loadStructure()` was called with no arguments and `eventsForChapter()` received 3 args against a 2-arg signature; both call sites fixed
- **`handleKeyboardShortcuts` SyntaxError** — missing closing brace on the `v` key block caused a parse-time error that prevented the entire module from loading
- **`localStorage` `SecurityError`** — wrapped all `localStorage` calls in `try/catch` so private/sandboxed contexts fall back to defaults instead of throwing
- **Missing theme toggle button** — `themeToggle` button was absent from the header in `index.html`; added

### Added

- **`H` keyboard shortcut** — toggles section headings visibility

---

## [v1.2.0-dev.1] — 2026-05-23

### Multi-translation support via Firebase RTDB

- BSB, CSB, NLT, MEV, NKJV, LEB, NIV, ISV and more loaded on demand from Firebase Realtime Database
- Passage navigation, prose and verse-by-verse modes, paragraph rendering, section headings and footnotes, verse glow with scroll-to-verse, Firebase Auth with reading position sync, service worker, settings accordion, keyboard shortcuts — all functional
- Search not yet functional in this build

---

## [v1.1.0-firebase] — 2026-05-23

### Firebase RTDB backend

- Replaced the ESV API with Firebase Realtime Database for serving all Bible translations
- Multi-translation support via `/translations/{id}/{book}`
- Translation selector populates dynamically from `/translationIndex`
- Copyright footer driven by `translationIndex` metadata
- Service worker no longer caches Firebase RTDB requests
- Upload workflow derives translation index from live RTDB keys

---

## [v1.0.0-esv-api] — 2026-05-19

> **Archive release.** Last stable version before the data layer was replaced. ESV API integration is no longer maintained.

The app was feature-complete for single-translation (ESV) reading: passage navigation, full-text search, verse-by-verse and prose modes, verse glow, section headings and footnotes toggle, Firebase Auth with reading position sync, settings accordion, keyboard shortcuts, service worker with update toast, and build info badge.

The ESV API required each user to supply their own API key. In May 2026 the data layer was replaced with self-hosted JSON translation files served from Firebase RTDB, enabling multiple translations with no API key required.

---

## [v0.0.10-json-alpha] — 2026-05-21

### Service worker & update toast (closes #77)

- `sw.js` caches all assets under an `esv-bible-{BUILD_ID}` cache key where `BUILD_ID` is the commit SHA injected at deploy time
- On activation, the service worker deletes caches from previous deploys, claims open tabs, and posts a `NEW_VERSION` message to each one
- The app responds with a non-blocking **A new version is available — Refresh** toast (auto-dismisses after 30 s)
- `visibilitychange` on a backgrounded tab triggers `reg.update()` so long-lived tabs check for new deploys without a full reload

### CI

- `deploy-gh-pages.yml` replaces the `__BUILD_ID__` placeholder in `sw.js` and `index.html` with `$GITHUB_SHA` before publishing
- `convert-bsb.yml` weekly cron removed — now `workflow_dispatch` only

---

## [v0.0.9-json-alpha] — 2026-05-21

### Translations

- NLT (New Living Translation) and MEV (Modern English Version) added to the translations registry with full copyright strings

---

## [v0.0.8-json-alpha] — 2026-05-19

### Multi-translation support

- App now loads Bible text from a local `translations/` registry instead of a single API
- `translations/index.json` populates the translation selector and copyright map at runtime — adding a translation requires only dropping files into the registry
- NRSVue and BSB included alongside ESV and CSB; CI workflow automates future imports

### BSB section headings and paragraph breaks

- Section headings (`\s1`) and paragraph breaks (`\b`) parsed from BSB USFM source files into per-book scaffold JSONs at `translations/BSB/BSB_structure/`
- Scaffold is versification-based — all 66 books covered — and applies to every active translation
- GitHub Actions workflow regenerates the scaffold automatically when BSB source files change

### Bug fixes

- `Song of Solomon` not found in CSB due to key casing mismatch (`"Song Of Solomon"`) — normalized
- `BSB_structure/` files were generated as empty arrays; all 66 files now populated with correct scaffold data
- Legacy `NRSVue` → `NRSVUE` storage key normalization on load prevents broken translation state for returning users
- `styles.css` restored after being truncated; pericope heading and passage paragraph CSS rules re-appended

---

## [v0.0.11-alpha] — 2026-05-23

### Firebase modular SDK migration

- Replaced compat namespace API (`firebase.initializeApp`, `firebase.auth()`, `firebase.database()`) with Firebase SDK v9 modular imports
- Thin compat shim wraps `getAuth`/`getDatabase`/`ref`/`get`/`set` to preserve existing call patterns in `app.js` and `ui.js`
- Three compat CDN script tags removed from `index.html`; Firebase now loads exactly once via ES module imports in `firebase-config.js`

### Build info badge

- Badge injected into the header at deploy time displaying `branch #run · sha`; hidden on `main` via `data-branch` CSS attribute
- `__BUILD_INFO__` placeholder in source; CI replaces at deploy time

### Branch strategy

- `main` branch-protected, PR-only, no direct pushes
- `dev` is the active development branch and repository default
- CI workflows (Playwright, unit tests, deploy) all target `dev`
- Concurrency group added to deploy workflow to prevent race-condition push failures

### Bug fixes

- Playwright smoke tests: accordion selector corrected from `.accordion-content` to `.accordion-panel`
- `index.html` element IDs aligned with `app.js` expectations
- `autocomplete` attributes added to all auth form inputs
