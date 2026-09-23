import {
  idbDeleteTranslation,
  idbGetBook,
  idbIsDownloaded,
  idbMarkDownloaded,
  idbPutBook,
} from "./translation-store.js";

const SCOTTISH_PSALTER_ID = "MP1650";
const SCOTTISH_PSALTER_NAME = "Scottish Psalter (1650)";
const SCOTTISH_PSALTER_LABEL = "MP1650";
const SCOTTISH_PSALTER_DESCRIPTION = "Traditional metrical Psalms for singing.";
const SCOTTISH_PSALTER_DATA_URL = "./special-psalms/MP1650/Psalm.json";
const PSALM_TRANSLATION_KEY = "psalmTranslation";
const LINE_BREAK_TOKEN = "__LEGE_LUX_MP1650_LINE_BREAK__";

const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M11.29,16.71a1,1,0,0,0,1.42,0l4-4a1,1,0,0,0-1.42-1.42L13,13.59V3a1,1,0,0,0-2,0V13.59l-2.29-2.3a1,1,0,1,0-1.42,1.42Z"/><path d="M19,20H5a1,1,0,0,0,0,2H19a1,1,0,0,0,0-2Z"/></svg>`;
const DOWNLOADED_ICON = `<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M34.459 1.375a2.999 2.999 0 0 0-4.149.884L13.5 28.17l-8.198-7.58a2.999 2.999 0 1 0-4.073 4.405l10.764 9.952s.309.266.452.359a2.999 2.999 0 0 0 4.15-.884L35.343 5.524a2.999 2.999 0 0 0-.884-4.149z"/></svg>`;
const SPINNER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="translation-dl-spinner" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

function readPsalmTranslation() {
  try {
    return localStorage.getItem(PSALM_TRANSLATION_KEY) === SCOTTISH_PSALTER_ID
      ? SCOTTISH_PSALTER_ID
      : null;
  } catch (_) {
    return null;
  }
}

function writePsalmTranslation(value) {
  try {
    if (value === SCOTTISH_PSALTER_ID) {
      localStorage.setItem(PSALM_TRANSLATION_KEY, value);
    } else {
      localStorage.removeItem(PSALM_TRANSLATION_KEY);
    }
  } catch (_) {}
}

function isScottishPsalterActive(app, book = app.state.currentBook) {
  return book === "Psalm" && readPsalmTranslation() === SCOTTISH_PSALTER_ID;
}

function isValidPsalter(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const psalmNumbers = Object.keys(data).map(Number).sort((a, b) => a - b);
  if (psalmNumbers.length !== 150) return false;
  for (let number = 1; number <= 150; number++) {
    if (psalmNumbers[number - 1] !== number) return false;
    const verses = data[String(number)];
    if (!verses || typeof verses !== "object" || Array.isArray(verses)) return false;
    if (Object.keys(verses).length === 0) return false;
    for (const text of Object.values(verses)) {
      if (typeof text !== "string" || text.length === 0 || text.includes(LINE_BREAK_TOKEN)) {
        return false;
      }
    }
  }
  return true;
}

function syncPresentation(app) {
  const active = isScottishPsalterActive(app);
  if (app.currentTranslationSpan) {
    app.currentTranslationSpan.textContent = active
      ? SCOTTISH_PSALTER_LABEL
      : app.state.translation || "KJV";
  }

  if (app.copyright) {
    if (active) {
      app.copyright.textContent = `${SCOTTISH_PSALTER_NAME} · Public domain`;
    }
  }

  syncSpecialItemActiveState(app);
}

function syncSpecialItemActiveState(app) {
  if (!app.translationList) return;
  const special = app.translationList.querySelector(
    '[data-psalm-translation="MP1650"] .translation-modal-item',
  );
  if (!special) return;

  const active = isScottishPsalterActive(app);
  if (active) {
    app.translationList
      .querySelectorAll(".translation-modal-item--active")
      .forEach((item) => item.classList.remove("translation-modal-item--active"));
  }
  special.classList.toggle("translation-modal-item--active", active);
}

function setInlineStatus(item, description, icon, message, { error = false } = {}) {
  description.textContent = message;
  item.classList.toggle("translation-modal-item--downloading", !error && message.startsWith("Downloading"));
  if (error) {
    icon.innerHTML = DOWNLOAD_ICON;
    setTimeout(() => {
      description.textContent = SCOTTISH_PSALTER_DESCRIPTION;
    }, 3000);
  }
}

async function downloadPsalter(item, description, icon) {
  if (!navigator.onLine) {
    setInlineStatus(item, description, icon, "Connect to internet to download", { error: true });
    return false;
  }

  icon.innerHTML = SPINNER_ICON;
  setInlineStatus(item, description, icon, "Downloading…");

  try {
    const response = await fetch(SCOTTISH_PSALTER_DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!isValidPsalter(data)) throw new Error("Invalid Psalter data");

    const stored = await idbPutBook(SCOTTISH_PSALTER_ID, "Psalm", data);
    if (!stored) throw new Error("IndexedDB write failed");
    const marked = await idbMarkDownloaded(SCOTTISH_PSALTER_ID);
    if (!marked) throw new Error("Could not mark Psalter installed");

    item.classList.remove("translation-modal-item--downloading");
    item.classList.add("translation-modal-item--downloaded");
    icon.innerHTML = DOWNLOADED_ICON;
    description.textContent = SCOTTISH_PSALTER_DESCRIPTION;
    return true;
  } catch (error) {
    await idbDeleteTranslation(SCOTTISH_PSALTER_ID);
    console.error("Scottish Psalter download failed", error);
    setInlineStatus(item, description, icon, "Download failed — try again", { error: true });
    return false;
  }
}

async function selectScottishPsalter(app, item, description, icon) {
  let installed = await idbIsDownloaded(SCOTTISH_PSALTER_ID);
  if (installed) {
    const stored = await idbGetBook(SCOTTISH_PSALTER_ID, "Psalm");
    installed = isValidPsalter(stored);
    if (!installed) await idbDeleteTranslation(SCOTTISH_PSALTER_ID);
  }

  if (!installed) {
    installed = await downloadPsalter(item, description, icon);
    if (!installed) return;
  }

  writePsalmTranslation(SCOTTISH_PSALTER_ID);
  await app.loadPassage(
    app.state.currentBook,
    app.state.currentChapter,
    false,
    "psalm-translation-change",
  );
  syncPresentation(app);
  app.closeModal(app.translationModal);
}

async function injectPsalterOption(app) {
  if (!app.translationList || app.state.currentBook !== "Psalm") return;
  if (app.translationList.querySelector('[data-psalm-translation="MP1650"]')) {
    syncSpecialItemActiveState(app);
    return;
  }
  if (!app.translationList.querySelector(".translation-modal-item")) return;

  const installed = await idbIsDownloaded(SCOTTISH_PSALTER_ID);
  if (app.state.currentBook !== "Psalm") return;
  if (app.translationList.querySelector('[data-psalm-translation="MP1650"]')) return;

  const heading = document.createElement("li");
  heading.className = "translation-modal-section-heading";
  heading.textContent = "Metrical Psalters";
  heading.setAttribute("role", "presentation");
  heading.dataset.psalmTranslationHeading = "true";

  const wrapper = document.createElement("li");
  wrapper.className = "translation-modal-item-wrapper";
  wrapper.dataset.psalmTranslation = SCOTTISH_PSALTER_ID;

  const item = document.createElement("div");
  item.className = "translation-modal-item";

  const name = document.createElement("span");
  name.className = "translation-modal-item__name";
  name.textContent = SCOTTISH_PSALTER_NAME;

  const description = document.createElement("span");
  description.className = "translation-modal-item__desc";
  description.textContent = SCOTTISH_PSALTER_DESCRIPTION;

  const icon = document.createElement("span");
  icon.className = "translation-modal-item__status-icon";
  if (installed) {
    item.classList.add("translation-modal-item--downloaded");
    icon.innerHTML = DOWNLOADED_ICON;
  } else {
    icon.innerHTML = DOWNLOAD_ICON;
  }

  item.appendChild(name);
  item.appendChild(description);
  item.appendChild(icon);
  item.addEventListener("click", () => {
    if (item.classList.contains("translation-modal-item--downloading")) return;
    void selectScottishPsalter(app, item, description, icon);
  });
  wrapper.appendChild(item);

  const availableHeading = Array.from(
    app.translationList.querySelectorAll(".translation-modal-section-heading"),
  ).find((entry) => entry.textContent === "Available");

  if (availableHeading) {
    app.translationList.insertBefore(heading, availableHeading);
    app.translationList.insertBefore(wrapper, availableHeading);
  } else {
    app.translationList.appendChild(heading);
    app.translationList.appendChild(wrapper);
  }

  syncSpecialItemActiveState(app);
}

function installTranslationListIntegration(app) {
  if (!app.translationList) return;

  const observer = new MutationObserver(() => {
    void injectPsalterOption(app);
  });
  observer.observe(app.translationList, { childList: true });

  app.translationList.addEventListener(
    "click",
    (event) => {
      if (app.state.currentBook !== "Psalm") return;
      if (event.target.closest(".translation-modal-delete-btn")) return;
      if (event.target.closest('[data-psalm-translation="MP1650"]')) return;

      const item = event.target.closest(".translation-modal-item");
      if (!item) return;
      const selectable =
        !item.querySelector(".translation-modal-item__status-icon") ||
        item.classList.contains("translation-modal-item--downloaded");
      if (!selectable) return;

      writePsalmTranslation(null);
    },
    true,
  );
}

function installPassageAdapter(app) {
  const bibleApi = app.bibleApi;
  const fetchPassage = bibleApi.fetchPassage.bind(bibleApi);

  bibleApi.fetchPassage = async (reference, scaffoldEvents = [], showHeadings = true) => {
    const parsed = bibleApi._parseReference(reference);
    if (
      !parsed ||
      parsed.book !== "Psalm" ||
      readPsalmTranslation() !== SCOTTISH_PSALTER_ID
    ) {
      return fetchPassage(reference, scaffoldEvents, showHeadings);
    }

    const psalms = await idbGetBook(SCOTTISH_PSALTER_ID, "Psalm");
    if (!isValidPsalter(psalms)) {
      writePsalmTranslation(null);
      syncPresentation(app);
      return fetchPassage(reference, scaffoldEvents, showHeadings);
    }

    const chapterData = psalms[String(parsed.chapter)];
    if (!chapterData) return null;

    const lineatedChapter = Object.fromEntries(
      Object.entries(chapterData).map(([verse, text]) => [
        verse,
        text.replace(/\n/g, LINE_BREAK_TOKEN),
      ]),
    );
    const verseEnd =
      parsed.verseStart !== null ? parsed.verseEnd ?? parsed.verseStart : null;
    const html = bibleApi._buildPassageHtml(
      parsed.chapter,
      lineatedChapter,
      parsed.verseStart,
      verseEnd,
      scaffoldEvents,
      showHeadings,
    );
    if (!html) return null;

    const canonical =
      parsed.verseStart !== null
        ? `Psalm ${parsed.chapter}:${parsed.verseStart}${verseEnd !== parsed.verseStart ? `-${verseEnd}` : ""}`
        : `Psalm ${parsed.chapter}`;

    return {
      passages: [html.replaceAll(LINE_BREAK_TOKEN, '<br class="psalter-line-break">')],
      canonical,
    };
  };
}

function installCacheAdapter(app) {
  const savePassageCache = app._savePassageCache.bind(app);
  app._savePassageCache = (book, chapter, translation, title, html, source) => {
    savePassageCache(book, chapter, translation, title, html, source);
    try {
      const raw = localStorage.getItem("passageCache");
      if (!raw) return;
      const cached = JSON.parse(raw);
      cached.psalmTranslation = isScottishPsalterActive(app, book)
        ? SCOTTISH_PSALTER_ID
        : null;
      localStorage.setItem("passageCache", JSON.stringify(cached));
    } catch (_) {}
  };

  const restorePassageCache = app._restorePassageCache.bind(app);
  app._restorePassageCache = () => {
    try {
      const raw = localStorage.getItem("passageCache");
      if (raw) {
        const cached = JSON.parse(raw);
        const expected = isScottishPsalterActive(app, cached.book)
          ? SCOTTISH_PSALTER_ID
          : null;
        if ((cached.psalmTranslation || null) !== expected) return false;
      }
    } catch (_) {}

    const restored = restorePassageCache();
    syncPresentation(app);
    return restored;
  };
}

function installPresentationAdapters(app) {
  const updateNavigationState = app.updateNavigationState.bind(app);
  app.updateNavigationState = (...args) => {
    const result = updateNavigationState(...args);
    syncPresentation(app);
    return result;
  };

  const updateCopyright = app.updateCopyright.bind(app);
  app.updateCopyright = (...args) => {
    if (isScottishPsalterActive(app)) {
      if (app.copyright) {
        app.copyright.textContent = `${SCOTTISH_PSALTER_NAME} · Public domain`;
      }
      return;
    }
    return updateCopyright(...args);
  };

  const loadPassage = app.loadPassage.bind(app);
  app.loadPassage = async (...args) => {
    const result = await loadPassage(...args);
    syncPresentation(app);
    return result;
  };

  for (const method of ["copySelectedVerse", "shareSelectedVerse", "copyPassage"]) {
    if (typeof app[method] !== "function") continue;
    const original = app[method].bind(app);
    app[method] = (...args) => {
      if (!isScottishPsalterActive(app)) return original(...args);
      const translation = app.state.translation;
      app.state.translation = SCOTTISH_PSALTER_LABEL;
      try {
        return original(...args);
      } finally {
        app.state.translation = translation;
      }
    };
  }
}

export function installPsalmTranslations(app) {
  installPassageAdapter(app);
  installCacheAdapter(app);
  installPresentationAdapters(app);
  installTranslationListIntegration(app);
  syncPresentation(app);
}
