// bookmarks.js
// Local-first red, green, and blue verse bookmarks with Firebase sync support.

const BOOKMARKS_KEY = "bookmarksV1";
const BOOKMARK_COLORS = ["red", "green", "blue"];
const BOOKMARK_COLOR_SET = new Set(BOOKMARK_COLORS);
const VERSE_ID_PATTERN = /^[1-9]\d*(?:[a-z]+|-[1-9]\d*[a-z]*)?$/i;

function normalizeVerseId(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!VERSE_ID_PATTERN.test(raw)) return null;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

function emptyBookmarks() {
  return { version: 1, items: {} };
}

function isValidBookmarkItem(item) {
  return (
    item &&
    typeof item === "object" &&
    typeof item.book === "string" &&
    Number.isInteger(Number(item.chapter)) &&
    normalizeVerseId(item.verse) !== null &&
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
      verse: normalizeVerseId(item.verse),
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
  } catch (_) { }
}

function makeBookKey(book) {
  return String(book || "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getBookmarkId(book, chapter, verse) {
  return `${makeBookKey(book)}_${Number(chapter)}_${normalizeVerseId(verse)}`;
}

function getSelectedVerse(app) {
  return normalizeVerseId(app.state?.selectedVerse);
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

function getActiveBookmarkByColor(app, color, ignoredId = null) {
  const state = normalizeBookmarks(app.bookmarks);

  for (const [id, item] of Object.entries(state.items)) {
    if (id === ignoredId) continue;
    if (item.deleted === true) continue;
    if (item.color !== color) continue;

    return { id, item };
  }

  return null;
}

function formatBookmarkReference(app, item) {
  return `${displayBook(app, item.book)} ${item.chapter}:${item.verse}`;
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
      return String(a.verse).localeCompare(String(b.verse), undefined, { numeric: true });
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
      `.verse[data-verse="${item.verse}"]`,
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

}

export function closeBookmarkColorPicker() {
  document
    .querySelectorAll(".verse-tool-btn--bookmark-menu-open")
    .forEach((button) => {
      const originalTitle = button.dataset.bookmarkOriginalTitle;
      if (originalTitle) {
        button.title = originalTitle;
        delete button.dataset.bookmarkOriginalTitle;
      }
      button.classList.remove("verse-tool-btn--bookmark-menu-open");
    });

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
    closeBookmarkColorPicker();
    return;
  }

  const tray = anchor.closest(".verse-tools-tray");
  if (!tray) return;

  if (anchor.title) {
    anchor.dataset.bookmarkOriginalTitle = anchor.title;
    anchor.removeAttribute("title");
  }
  anchor.classList.add("verse-tool-btn--bookmark-menu-open");

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
      <span class="bookmark-choice-trash" aria-hidden="true">×</span>
      <span>Remove</span>
    </button>
  `;

  tray.appendChild(menu);

  const trayRect = tray.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const center = anchorRect.left - trayRect.left + anchorRect.width / 2;
  const halfMenu = menu.offsetWidth / 2;
  const minLeft = halfMenu + 8;
  const maxLeft = tray.clientWidth - halfMenu - 8;
  const left = Math.min(Math.max(center, minLeft), maxLeft);
  menu.style.left = `${left}px`;

  // bookmark-color-menu anchor
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

  app.bookmarks = normalizeBookmarks(app.bookmarks);
  const existing = app.bookmarks.items[reference.id];
  const conflict = getActiveBookmarkByColor(app, color, reference.id);

  if (conflict) {
    const conflictRef = formatBookmarkReference(app, conflict.item);
    const shouldOverride = window.confirm(
      `${capitalize(color)} is already being used for ${conflictRef}.\n\nPress OK to move it here, or Cancel to choose a different color.`,
    );

    if (!shouldOverride) return false;
  }

  const remoteWrites = [];

  if (conflict) {
    const deletedConflict = {
      ...conflict.item,
      updatedAt: now,
      deleted: true,
    };

    app.bookmarks.items[conflict.id] = deletedConflict;
    remoteWrites.push([conflict.id, deletedConflict]);
  }

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
  remoteWrites.push([reference.id, app.bookmarks.items[reference.id]]);

  saveLocalBookmarks(app);
  applyBookmarkMarkers(app);
  closeBookmarkColorPicker();
  app.showToast?.(
    conflict
      ? `${capitalize(color)} bookmark moved`
      : `${capitalize(color)} bookmark saved`,
  );

  try {
    await Promise.all(
      remoteWrites.map(([id, item]) => writeRemoteBookmark(app, id, item)),
    );
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
    const remove = event.target.closest("[data-bookmark-remove-id]");
    if (remove) {
      event.preventDefault();
      event.stopPropagation();
      void removeBookmarkById(app, remove.dataset.bookmarkRemoveId);
      return;
    }

    const card = event.target.closest("[data-bookmark-jump]");
    if (card && sheet.contains(card)) {
      event.preventDefault();
      void jumpToBookmark(app, card.dataset.bookmarkJump);
    }
  });

  sheet.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    const card = event.target.closest("[data-bookmark-jump]");
    if (!card || !sheet.contains(card)) return;

    event.preventDefault();
    void jumpToBookmark(app, card.dataset.bookmarkJump);
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
    card.dataset.bookmarkJump = id;
    card.setAttribute("role", "button");
    card.tabIndex = 0;

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

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bookmark-card__remove";
    remove.dataset.bookmarkRemoveId = id;
    remove.setAttribute("aria-label", "Remove bookmark");
    remove.textContent = "×";

    actions.append(remove);
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
    `.verse[data-verse="${item.verse}"]`,
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
    app.scrollToVerse?.(item.verse);
  });
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
