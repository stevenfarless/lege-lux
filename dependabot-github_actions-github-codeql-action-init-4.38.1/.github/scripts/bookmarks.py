from pathlib import Path

APP = Path('app.js')
EVENTS = Path('events.js')
READING_STATE = Path('reading-state.js')
INTERACTIONS = Path('css/interactions.css')
INDEX = Path('index.html')
BOOKMARKS = Path('bookmarks.js')


def read(path):
    return path.read_text(encoding='utf-8')


def write(path, text):
    path.write_text(text.rstrip() + '\n', encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(label + ' anchor not found')
    return text.replace(old, new, 1)


BOOKMARKS_JS = r'''// bookmarks.js
// Local-first red, green, and blue verse bookmarks with Firebase sync support.

const BOOKMARKS_KEY = "bookmarksV1";
const BOOKMARK_COLORS = ["red", "green", "blue"];
const BOOKMARK_COLOR_SET = new Set(BOOKMARK_COLORS);

function emptyBookmarks() {
  return { version: 1, items: {} };
}

function isValidBookmarkItem(item) {
  return (
    item &&
    typeof item === "object" &&
    typeof item.book === "string" &&
    Number.isInteger(Number(item.chapter)) &&
    Number.isInteger(Number(item.verse)) &&
    Number.isFinite(Number(item.updatedAt)) &&
    (item.deleted === true || BOOKMARK_COLOR_SET.has(item.color))
  );
}

function normalizeBookmarks(value) {
  const state = emptyBookmarks();
  const items =
    value?.items && typeof value.items === "object" ? value.items : {};

  for (const [id, item] of Object.entries(items)) {
    if (!isValidBookmarkItem(item)) continue;

    state.items[id] = {
      book: item.book,
      chapter: Number(item.chapter),
      verse: Number(item.verse),
      color: BOOKMARK_COLOR_SET.has(item.color) ? item.color : "red",
      createdAt: Number(item.createdAt || item.updatedAt || Date.now()),
      updatedAt: Number(item.updatedAt),
      deleted: item.deleted === true,
      createdTranslation: item.createdTranslation || null,
    };
  }

  return state;
}

export function loadLocalBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? normalizeBookmarks(JSON.parse(raw)) : emptyBookmarks();
  } catch (_) {
    return emptyBookmarks();
  }
}

function saveLocalBookmarks(app) {
  app.bookmarks = normalizeBookmarks(app.bookmarks);

  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(app.bookmarks));
    app._dbgEvent?.("storage write: bookmarksV1");
  } catch (_) {}
}

function makeBookKey(book) {
  return String(book || "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getBookmarkId(book, chapter, verse) {
  return `${makeBookKey(book)}_${Number(chapter)}_${Number(verse)}`;
}

function getSelectedVerse(app) {
  const verse = Number(app.state?.selectedVerse);
  return Number.isInteger(verse) && verse > 0 ? verse : null;
}

function getBookmark(app, book, chapter, verse) {
  const id = getBookmarkId(book, chapter, verse);
  const item = app.bookmarks?.items?.[id];

  if (!item || item.deleted === true) return null;
  return item;
}

function getSelectedBookmark(app) {
  const verse = getSelectedVerse(app);
  if (!verse) return null;

  return getBookmark(
    app,
    app.state.currentBook,
    app.state.currentChapter,
    verse,
  );
}

function currentReference(app) {
  const verse = getSelectedVerse(app);
  if (!verse) return null;

  return {
    id: getBookmarkId(app.state.currentBook, app.state.currentChapter, verse),
    book: app.state.currentBook,
    chapter: Number(app.state.currentChapter),
    verse,
  };
}

function getVisibleBookmarks(app) {
  const order = app.getAllBooks?.() || [];

  return Object.values(app.bookmarks?.items || {})
    .filter((item) => item && item.deleted !== true)
    .sort((a, b) => {
      const aBook = order.indexOf(a.book);
      const bBook = order.indexOf(b.book);
      const safeABook = aBook === -1 ? Number.MAX_SAFE_INTEGER : aBook;
      const safeBBook = bBook === -1 ? Number.MAX_SAFE_INTEGER : bBook;

      if (safeABook !== safeBBook) return safeABook - safeBBook;
      if (Number(a.chapter) !== Number(b.chapter)) {
        return Number(a.chapter) - Number(b.chapter);
      }
      return Number(a.verse) - Number(b.verse);
    });
}

async function writeRemoteBookmark(app, id, item) {
  if (!app.canWriteRemoteState?.()) return false;

  await app.database
    .ref(`users/${app.currentUser.uid}/bookmarksV1/items/${id}`)
    .set(item);

  return true;
}

export function applyBookmarkMarkers(app) {
  const passage = app.passageText;
  if (!passage) return;

  passage
    .querySelectorAll(".verse-bookmark-ribbon")
    .forEach((marker) => marker.remove());

  passage
    .querySelectorAll(".verse[data-bookmark-color]")
    .forEach((verse) => verse.removeAttribute("data-bookmark-color"));

  const state = normalizeBookmarks(app.bookmarks);
  app.bookmarks = state;

  for (const item of Object.values(state.items)) {
    if (item.deleted) continue;
    if (item.book !== app.state.currentBook) continue;
    if (Number(item.chapter) !== Number(app.state.currentChapter)) continue;

    const verseEl = passage.querySelector(
      `.verse[data-verse="${Number(item.verse)}"]`,
    );

    if (!verseEl) continue;

    verseEl.dataset.bookmarkColor = item.color;

    const marker = document.createElement("span");
    marker.className = `verse-bookmark-ribbon verse-bookmark-ribbon--${item.color}`;
    marker.setAttribute("aria-hidden", "true");

    verseEl.insertBefore(marker, verseEl.firstChild);
  }

  updateBookmarkToolState(app);
  renderBookmarksSheet(app);
}

export function updateBookmarkToolState(app) {
  const wrapper = app.passageText?.querySelector("[data-verse-glow]");
  const button = wrapper?.querySelector('[data-verse-tool="bookmark"]');
  const current = getSelectedBookmark(app);

  if (!button) return;

  button.classList.toggle("verse-tool-btn--bookmarked", Boolean(current));
  button.dataset.bookmarkColor = current?.color || "";
  button.setAttribute(
    "aria-label",
    current ? `Bookmark saved as ${current.color}` : "Bookmark",
  );

  const icon = button.querySelector(".verse-tool-letter");
  if (icon) icon.textContent = "B";
}

export function closeBookmarkColorPicker() {
  document.querySelectorAll(".bookmark-color-menu").forEach((menu) => {
    menu.remove();
  });
}

export function openBookmarkColorPicker(app, anchor) {
  const reference = currentReference(app);

  if (!reference) {
    app.showToast?.("No verse selected");
    return;
  }

  const existing = document.querySelector(".bookmark-color-menu");
  if (existing) {
    existing.remove();
    return;
  }

  const tray = anchor.closest(".verse-tools-tray");
  if (!tray) return;

  const menu = document.createElement("div");
  menu.className = "bookmark-color-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <button class="bookmark-color-choice" type="button" data-bookmark-color-choice="red" role="menuitem">
      <span class="bookmark-choice-ribbon bookmark-choice-ribbon--red" aria-hidden="true"></span>
      <span>Red</span>
    </button>
    <button class="bookmark-color-choice" type="button" data-bookmark-color-choice="green" role="menuitem">
      <span class="bookmark-choice-ribbon bookmark-choice-ribbon--green" aria-hidden="true"></span>
      <span>Green</span>
    </button>
    <button class="bookmark-color-choice" type="button" data-bookmark-color-choice="blue" role="menuitem">
      <span class="bookmark-choice-ribbon bookmark-choice-ribbon--blue" aria-hidden="true"></span>
      <span>Blue</span>
    </button>
    <button class="bookmark-color-choice bookmark-color-choice--remove" type="button" data-bookmark-remove role="menuitem">
      <span class="bookmark-choice-trash" aria-hidden="true">⌫</span>
      <span>Remove</span>
    </button>
  `;

  tray.appendChild(menu);

  menu.querySelectorAll("[data-bookmark-color-choice]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void setSelectedVerseBookmarkColor(app, button.dataset.bookmarkColorChoice);
    });
  });

  menu
    .querySelector("[data-bookmark-remove]")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void removeSelectedVerseBookmark(app);
    });

  setTimeout(() => {
    const closeOnOutsidePointer = (event) => {
      if (menu.contains(event.target) || anchor.contains(event.target)) return;
      closeBookmarkColorPicker();
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
  }, 0);
}

export async function setSelectedVerseBookmarkColor(app, color) {
  if (!BOOKMARK_COLOR_SET.has(color)) return false;

  const reference = currentReference(app);
  if (!reference) {
    app.showToast?.("No verse selected");
    return false;
  }

  const now = Date.now();
  const existing = app.bookmarks?.items?.[reference.id];

  app.bookmarks = normalizeBookmarks(app.bookmarks);
  app.bookmarks.items[reference.id] = {
    book: reference.book,
    chapter: reference.chapter,
    verse: reference.verse,
    color,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deleted: false,
    createdTranslation: existing?.createdTranslation || app.state.translation || null,
  };

  saveLocalBookmarks(app);
  applyBookmarkMarkers(app);
  closeBookmarkColorPicker();
  app.showToast?.(`${capitalize(color)} bookmark saved`);

  try {
    await writeRemoteBookmark(app, reference.id, app.bookmarks.items[reference.id]);
  } catch (error) {
    console.error("setSelectedVerseBookmarkColor: Firebase write failed", error);
  }

  return true;
}

export async function removeSelectedVerseBookmark(app) {
  const reference = currentReference(app);
  if (!reference) {
    app.showToast?.("No verse selected");
    return false;
  }

  return removeBookmarkById(app, reference.id);
}

async function removeBookmarkById(app, id) {
  const existing = app.bookmarks?.items?.[id];
  if (!existing || existing.deleted === true) {
    closeBookmarkColorPicker();
    return false;
  }

  const item = {
    ...existing,
    updatedAt: Date.now(),
    deleted: true,
  };

  app.bookmarks = normalizeBookmarks(app.bookmarks);
  app.bookmarks.items[id] = item;

  saveLocalBookmarks(app);
  applyBookmarkMarkers(app);
  closeBookmarkColorPicker();
  app.showToast?.("Bookmark removed");

  try {
    await writeRemoteBookmark(app, id, item);
  } catch (error) {
    console.error("removeBookmarkById: Firebase write failed", error);
  }

  return true;
}

export async function syncBookmarks(app) {
  if (!app.currentUser || !app.database) return false;

  const local = normalizeBookmarks(app.bookmarks);
  let remote = emptyBookmarks();

  try {
    const snapshot = await app.database
      .ref(`users/${app.currentUser.uid}/bookmarksV1/items`)
      .once("value");

    remote = normalizeBookmarks({
      version: 1,
      items: snapshot?.val() || {},
    });
  } catch (error) {
    console.error("syncBookmarks: Firebase read failed", error);
    return false;
  }

  const merged = emptyBookmarks();
  const pushItems = {};
  const ids = new Set([
    ...Object.keys(local.items),
    ...Object.keys(remote.items),
  ]);

  for (const id of ids) {
    const localItem = local.items[id];
    const remoteItem = remote.items[id];

    if (
      localItem &&
      (!remoteItem || localItem.updatedAt > remoteItem.updatedAt)
    ) {
      merged.items[id] = localItem;
      pushItems[id] = localItem;
    } else if (remoteItem) {
      merged.items[id] = remoteItem;
    }
  }

  app.bookmarks = merged;
  saveLocalBookmarks(app);
  applyBookmarkMarkers(app);

  try {
    const writes = Object.entries(pushItems).map(([id, item]) =>
      app.database
        .ref(`users/${app.currentUser.uid}/bookmarksV1/items/${id}`)
        .set(item),
    );

    await Promise.all(writes);
  } catch (error) {
    console.error("syncBookmarks: Firebase write failed", error);
  }

  return true;
}

export function installBookmarkSheet(app) {
  if (document.getElementById("bookmarksBtn")) return;

  const controls = document.querySelector(".header-controls");
  const settingsButton = document.getElementById("settingsBtn");
  if (!controls || !settingsButton) return;

  const button = document.createElement("button");
  button.className = "icon-btn";
  button.id = "bookmarksBtn";
  button.type = "button";
  button.title = "Bookmarks";
  button.setAttribute("aria-label", "Bookmarks");
  button.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-3-6 3V4z"></path>
    </svg>`;

  controls.insertBefore(button, settingsButton);
  button.addEventListener("click", () => openBookmarksSheet(app));
}

function ensureBookmarksSheet(app) {
  let sheet = document.getElementById("bookmarksSheet");
  if (sheet) return sheet;

  sheet = document.createElement("div");
  sheet.id = "bookmarksSheet";
  sheet.className = "bookmarks-sheet";
  sheet.setAttribute("aria-hidden", "true");
  sheet.innerHTML = `
    <div class="bookmarks-sheet__scrim" data-bookmarks-close></div>
    <section class="bookmarks-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="bookmarksSheetTitle">
      <div class="bookmarks-sheet__handle" aria-hidden="true"></div>
      <div class="bookmarks-sheet__header">
        <h2 id="bookmarksSheetTitle">Bookmarks</h2>
        <span class="bookmarks-sync-status" data-bookmarks-sync-status>Local</span>
      </div>
      <div class="bookmarks-sheet__list" data-bookmarks-list></div>
      <button class="bookmarks-add-btn" type="button" data-bookmarks-add>
        <span aria-hidden="true">+</span>
        <span>Add Bookmark</span>
      </button>
    </section>`;

  document.body.appendChild(sheet);

  sheet.querySelector("[data-bookmarks-close]")?.addEventListener("click", () => {
    closeBookmarksSheet();
  });

  sheet.querySelector("[data-bookmarks-add]")?.addEventListener("click", () => {
    closeBookmarksSheet();
    app.showToast?.("Select a verse, then tap Bookmark");
  });

  sheet.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-bookmark-jump]");
    if (jump) {
      event.preventDefault();
      void jumpToBookmark(app, jump.dataset.bookmarkJump);
      return;
    }

    const remove = event.target.closest("[data-bookmark-remove-id]");
    if (remove) {
      event.preventDefault();
      void removeBookmarkById(app, remove.dataset.bookmarkRemoveId);
    }
  });

  return sheet;
}

export function openBookmarksSheet(app) {
  const sheet = ensureBookmarksSheet(app);
  renderBookmarksSheet(app);
  sheet.classList.add("bookmarks-sheet--open");
  sheet.setAttribute("aria-hidden", "false");
}

export function closeBookmarksSheet() {
  const sheet = document.getElementById("bookmarksSheet");
  if (!sheet) return;

  sheet.classList.remove("bookmarks-sheet--open");
  sheet.setAttribute("aria-hidden", "true");
}

function renderBookmarksSheet(app) {
  const sheet = document.getElementById("bookmarksSheet");
  if (!sheet) return;

  const list = sheet.querySelector("[data-bookmarks-list]");
  const status = sheet.querySelector("[data-bookmarks-sync-status]");
  if (!list || !status) return;

  status.textContent = app.canWriteRemoteState?.() ? "Synced" : "Local";
  list.replaceChildren();

  const items = getVisibleBookmarks(app);

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "bookmarks-empty";
    empty.textContent = "No bookmarks yet.";
    list.appendChild(empty);
    return;
  }

  for (const item of items) {
    const id = getBookmarkId(item.book, item.chapter, item.verse);
    const card = document.createElement("article");
    card.className = "bookmark-card";
    card.dataset.bookmarkColor = item.color;

    const ribbon = document.createElement("span");
    ribbon.className = `bookmark-card__ribbon bookmark-card__ribbon--${item.color}`;
    ribbon.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "bookmark-card__body";

    const ref = document.createElement("strong");
    ref.textContent = `${displayBook(app, item.book)} ${item.chapter}:${item.verse}`;

    const preview = document.createElement("span");
    preview.textContent = getVisibleVersePreview(app, item) || "Tap to open this bookmark.";

    body.append(ref, preview);

    const actions = document.createElement("div");
    actions.className = "bookmark-card__actions";

    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "bookmark-card__action";
    jump.dataset.bookmarkJump = id;
    jump.setAttribute("aria-label", "Open bookmark");
    jump.textContent = "↗";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bookmark-card__action";
    remove.dataset.bookmarkRemoveId = id;
    remove.setAttribute("aria-label", "Remove bookmark");
    remove.textContent = "⋮";

    actions.append(jump, remove);
    card.append(ribbon, body, actions);
    list.appendChild(card);
  }
}

function getVisibleVersePreview(app, item) {
  if (
    item.book !== app.state.currentBook ||
    Number(item.chapter) !== Number(app.state.currentChapter)
  ) {
    return "";
  }

  const verse = app.passageText?.querySelector(
    `.verse[data-verse="${Number(item.verse)}"]`,
  );
  const textEl = verse?.querySelector(".verse-text") ?? verse;
  const text = textEl ? app.stripHTML?.(textEl.innerHTML).trim() : "";

  return text.length > 85 ? `${text.slice(0, 85)}…` : text;
}

function displayBook(app, book) {
  return app.getDisplayName?.(book) || book;
}

async function jumpToBookmark(app, id) {
  const item = app.bookmarks?.items?.[id];
  if (!item || item.deleted === true) return;

  closeBookmarksSheet();
  await app.loadPassage(item.book, item.chapter, false, "bookmark-jump");

  requestAnimationFrame(() => {
    app.scrollToVerse?.(Number(item.verse));
  });
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
'''

BOOKMARKS.write_text(BOOKMARKS_JS.rstrip() + "\n", encoding="utf-8")

app = read(APP)
if 'from "./bookmarks.js";' not in app:
    app = replace_once(
        app,
        'import { getHapticsDebugState, hapticFirm } from "./haptics.js";\n',
        '''import { getHapticsDebugState, hapticFirm } from "./haptics.js";
import {
  loadLocalBookmarks,
  applyBookmarkMarkers,
  updateBookmarkToolState,
  openBookmarkColorPicker,
  syncBookmarks,
  installBookmarkSheet,
} from "./bookmarks.js";
''',
        "bookmarks import",
    )

if '"bookmarksV1",' not in app:
    app = replace_once(
        app,
        '    "passageCache",\n',
        '    "passageCache",\n    "bookmarksV1",\n',
        "debug localStorage key",
    )

if 'k === "bookmarksV1"' not in app:
    app = replace_once(
        app,
        '''      } else if (k === "readingPosition" && raw) {
        const p = JSON.parse(raw);
        ls[k] = `book=${p.book} ch=${p.chapter} scrollY=${p.scrollY}`;
      } else {''',
        '''      } else if (k === "readingPosition" && raw) {
        const p = JSON.parse(raw);
        ls[k] = `book=${p.book} ch=${p.chapter} scrollY=${p.scrollY}`;
      } else if (k === "bookmarksV1" && raw) {
        const p = JSON.parse(raw);
        const items = Object.values(p.items || {});
        const active = items.filter((item) => item && item.deleted !== true).length;
        const deleted = items.filter((item) => item && item.deleted === true).length;
        ls[k] = `${active} active, ${deleted} deleted tombstones`;
      } else {''',
        "debug bookmarks summary",
    )

if "this.bookmarks = loadLocalBookmarks();" not in app:
    app = replace_once(
        app,
        "    this.referencePickerDraft = null;\n",
        "    this.referencePickerDraft = null;\n    this.bookmarks = loadLocalBookmarks();\n",
        "bookmarks constructor state",
    )

if 'await this.syncBookmarks();' not in app:
    app = replace_once(
        app,
        '''      this._syncWritesEnabled = true;
      if (this.hasLocalPositionChangedSinceAuthStart()) {
        saveReadingPosition(this, "auth-restoration-newer-local-position");
        this._dbgEvent("auth restoration: saved newer local position");
      }
      this.maybeShowTranslationSyncModal();''',
        '''      this._syncWritesEnabled = true;
      if (this.hasLocalPositionChangedSinceAuthStart()) {
        saveReadingPosition(this, "auth-restoration-newer-local-position");
        this._dbgEvent("auth restoration: saved newer local position");
      }
      await this.syncBookmarks();
      this.maybeShowTranslationSyncModal();''',
        "auth bookmark sync",
    )

if "this.applyBookmarkMarkers();" not in app:
    app = replace_once(
        app,
        '''      document.body.classList.add("passage-ready");
      updateNavigationState(this);
      return true;''',
        '''      document.body.classList.add("passage-ready");
      updateNavigationState(this);
      this.applyBookmarkMarkers();
      return true;''',
        "cache restore bookmark markers",
    )

if 'source,\n    );\n    this.applyBookmarkMarkers();' not in app:
    app = replace_once(
        app,
        '''      source,
    );
    this.swipe?.syncAdjacentPanels();''',
        '''      source,
    );
    this.applyBookmarkMarkers();
    this.swipe?.syncAdjacentPanels();''',
        "passage render bookmark markers",
    )

if "installBookmarkSheet()" not in app:
    app = replace_once(
        app,
        '''  dismissTranslationSyncForSession() {
    return dismissTranslationSyncForSession(this);
  }''',
        '''  dismissTranslationSyncForSession() {
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
  }''',
        "bookmark wrapper methods",
    )

write(APP, app)

reading_state = read(READING_STATE)
if 'data-verse-tool="bookmark"' not in reading_state:
    reading_state = replace_once(
        reading_state,
        '<button class="verse-tool-btn has-tooltip" type="button" aria-label="Bookmark" title="Bookmark" data-tooltip="Bookmark"><span class="verse-tool-letter">B</span></button>',
        '<button class="verse-tool-btn has-tooltip" type="button" aria-label="Bookmark" title="Bookmark" data-tooltip="Bookmark" data-verse-tool="bookmark" aria-haspopup="menu"><span class="verse-tool-letter">B</span></button>',
        "bookmark tray button",
    )

if "app.updateBookmarkToolState?.();" not in reading_state:
    reading_state = replace_once(
        reading_state,
        '''  trigger.addEventListener("click", () =>
    toggleVerseTray(wrapper, trigger, tray),
  );
}''',
        '''  trigger.addEventListener("click", () =>
    toggleVerseTray(wrapper, trigger, tray),
  );

  app.updateBookmarkToolState?.();
}''',
        "bookmark tool state refresh",
    )

write(READING_STATE, reading_state)

events = read(EVENTS)
if "app.installBookmarkSheet?.();" not in events:
    events = replace_once(
        events,
        '''  installBugReportUi(app);

  app.searchToggleBtn?.addEventListener("click", () => app.toggleSearch());''',
        '''  installBugReportUi(app);
  app.installBookmarkSheet?.();

  app.searchToggleBtn?.addEventListener("click", () => app.toggleSearch());''',
        "bookmark sheet install",
    )

if 'data-verse-tool="bookmark"' not in events:
    events = replace_once(
        events,
        '''    verseSelectionTarget.addEventListener("click", (event) => {
      const shareButton = event.target.closest('[data-verse-tool="share"]');
      if (!shareButton || !verseSelectionTarget.contains(shareButton)) return;

      event.preventDefault();
      event.stopPropagation();

      app.shareSelectedVerse();
    });

    verseSelectionTarget.addEventListener("click", (event) => {
      const heading = event.target.closest(".pericope-heading");''',
        '''    verseSelectionTarget.addEventListener("click", (event) => {
      const shareButton = event.target.closest('[data-verse-tool="share"]');
      if (!shareButton || !verseSelectionTarget.contains(shareButton)) return;

      event.preventDefault();
      event.stopPropagation();

      app.shareSelectedVerse();
    });

    verseSelectionTarget.addEventListener("click", (event) => {
      const bookmarkButton = event.target.closest('[data-verse-tool="bookmark"]');
      if (!bookmarkButton || !verseSelectionTarget.contains(bookmarkButton)) return;

      event.preventDefault();
      event.stopPropagation();

      app.openBookmarkColorPicker(bookmarkButton);
    });

    verseSelectionTarget.addEventListener("click", (event) => {
      const heading = event.target.closest(".pericope-heading");''',
        "bookmark click handler",
    )

write(EVENTS, events)

index = read(INDEX)
if 'href="bookmarks.js"' not in index:
    index = replace_once(
        index,
        '    <link rel="modulepreload" href="reading-state.js" />\n',
        '    <link rel="modulepreload" href="reading-state.js" />\n    <link rel="modulepreload" href="bookmarks.js" />\n',
        "bookmarks module preload",
    )

write(INDEX, index)

css = read(INTERACTIONS)
BOOKMARKS_CSS = r'''
/* Colored verse bookmarks */

.verse-tools-tray {
  position: relative;
}

.verse-bookmark-ribbon {
  display: inline-block;
  width: 0.75em;
  height: 1.1em;
  margin-right: 0.35em;
  vertical-align: -0.12em;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%);
  filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.45));
}

.verse-bookmark-ribbon--red,
.bookmark-choice-ribbon--red,
.bookmark-card__ribbon--red {
  background: #d43b35;
}

.verse-bookmark-ribbon--green,
.bookmark-choice-ribbon--green,
.bookmark-card__ribbon--green {
  background: #5fad3f;
}

.verse-bookmark-ribbon--blue,
.bookmark-choice-ribbon--blue,
.bookmark-card__ribbon--blue {
  background: #4b83e6;
}

.verse[data-bookmark-color="red"] .verse-num {
  color: #e36f66;
}

.verse[data-bookmark-color="green"] .verse-num {
  color: #8dcc6b;
}

.verse[data-bookmark-color="blue"] .verse-num {
  color: #78a6ff;
}

.verse-tool-btn--bookmarked[data-bookmark-color="red"] {
  border-color: rgba(212, 59, 53, 0.8);
  box-shadow: 0 0 12px rgba(212, 59, 53, 0.25);
}

.verse-tool-btn--bookmarked[data-bookmark-color="green"] {
  border-color: rgba(95, 173, 63, 0.8);
  box-shadow: 0 0 12px rgba(95, 173, 63, 0.25);
}

.verse-tool-btn--bookmarked[data-bookmark-color="blue"] {
  border-color: rgba(75, 131, 230, 0.8);
  box-shadow: 0 0 12px rgba(75, 131, 230, 0.25);
}

.bookmark-color-menu {
  position: absolute;
  left: 50%;
  bottom: 72px;
  z-index: 5;
  display: grid;
  gap: 2px;
  min-width: 160px;
  padding: 10px;
  background: rgba(28, 28, 26, 0.96);
  border: 1px solid rgba(207, 178, 42, 0.45);
  border-radius: 10px;
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.45),
    0 0 18px rgba(207, 178, 42, 0.18);
  transform: translateX(-50%);
}

.bookmark-color-menu::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -8px;
  width: 14px;
  height: 14px;
  background: rgba(28, 28, 26, 0.96);
  border-right: 1px solid rgba(207, 178, 42, 0.45);
  border-bottom: 1px solid rgba(207, 178, 42, 0.45);
  transform: translateX(-50%) rotate(45deg);
}

.bookmark-color-choice {
  display: grid;
  grid-template-columns: 24px 1fr;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  color: var(--text-primary);
  background: transparent;
  border: 0;
  border-radius: 8px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.bookmark-color-choice:hover,
.bookmark-color-choice:focus-visible {
  background: rgba(207, 178, 42, 0.12);
  outline: none;
}

.bookmark-color-choice--remove {
  margin-top: 4px;
  padding-top: 11px;
  border-top: 1px solid rgba(207, 178, 42, 0.22);
}

.bookmark-choice-ribbon {
  display: inline-block;
  width: 16px;
  height: 22px;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%);
}

.bookmark-choice-trash {
  color: var(--text-muted);
  font-size: 1rem;
  line-height: 1;
}

/* Bookmark overview sheet */

.bookmarks-sheet {
  position: fixed;
  inset: 0;
  z-index: 80;
  pointer-events: none;
}

.bookmarks-sheet__scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0);
  transition: background 0.2s ease;
}

.bookmarks-sheet__panel {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  max-height: min(72vh, 620px);
  padding: 0.75rem 1rem max(1rem, env(safe-area-inset-bottom));
  overflow: auto;
  color: var(--text-primary);
  background: rgba(28, 28, 26, 0.98);
  border-top: 1px solid rgba(207, 178, 42, 0.24);
  border-radius: 18px 18px 0 0;
  box-shadow: 0 -18px 36px rgba(0, 0, 0, 0.42);
  transform: translateY(105%);
  transition: transform 0.24s ease;
}

.bookmarks-sheet--open {
  pointer-events: auto;
}

.bookmarks-sheet--open .bookmarks-sheet__scrim {
  background: rgba(0, 0, 0, 0.35);
}

.bookmarks-sheet--open .bookmarks-sheet__panel {
  transform: translateY(0);
}

.bookmarks-sheet__handle {
  width: 44px;
  height: 4px;
  margin: 0 auto 0.75rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
}

.bookmarks-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.bookmarks-sheet__header h2 {
  margin: 0;
  color: var(--accent-color);
  font-size: 1.25rem;
}

.bookmarks-sync-status {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.bookmarks-sheet__list {
  display: grid;
  gap: 0.5rem;
}

.bookmarks-empty {
  margin: 0;
  padding: 1rem;
  color: var(--text-muted);
  border: 1px solid rgba(207, 178, 42, 0.18);
  border-radius: 10px;
}

.bookmark-card {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.7rem;
  border: 1px solid rgba(207, 178, 42, 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.bookmark-card__ribbon {
  width: 20px;
  height: 32px;
  align-self: start;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%);
}

.bookmark-card__body {
  display: grid;
  min-width: 0;
  gap: 0.18rem;
}

.bookmark-card__body strong {
  color: var(--accent-color);
  font-size: 0.95rem;
}

.bookmark-card__body span {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.86rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-card__actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.bookmark-card__action {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  border-radius: 999px;
  font-size: 1.15rem;
  cursor: pointer;
}

.bookmark-card__action:focus-visible,
.bookmark-card__action:hover {
  color: var(--accent-color);
  background: rgba(207, 178, 42, 0.1);
  outline: none;
}

.bookmarks-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.85rem 1rem;
  color: var(--accent-color);
  background: transparent;
  border: 1px solid rgba(207, 178, 42, 0.45);
  border-radius: 10px;
  font: inherit;
  cursor: pointer;
}
'''
if ".bookmark-color-menu" not in css:
    css = css.rstrip() + "\n" + BOOKMARKS_CSS.rstrip() + "\n"

write(INTERACTIONS, css)

print("bookmark workflow patch applied")
