// reading-state.js
// Responsibility: navigation, verse selection, highlight, reading position.

export function initializeState() {
  return {
    currentBook: "Genesis",
    currentChapter: 1,
    selectedVerse: null,
    fontSize: 20,
    showVerseNumbers: true,
    showHeadings: true,
    showFootnotes: false,
    showCrossReferences: false,
    verseByVerse: false,
    hideInterfaceOnScroll: true,
    colorTheme: "vespers",
    lightMode: "system",
    translation: "KJV",
  };
}

export function navigateChapter(app, direction) {
  const books = app.getAllBooks();
  const currentIndex = books.indexOf(app.state.currentBook);

  // Guard: if currentBook is not in the canonical list, bail out rather than
  // silently jumping to Genesis 1 (books[-1 + 1] = books[0]).
  if (currentIndex === -1) {
    console.warn(
      `navigateChapter: "${app.state.currentBook}" not found in book list.`,
    );
    return;
  }

  let newChapter = app.state.currentChapter + direction;
  let newBook = app.state.currentBook;

  const chapterCount = app.getChapterCount(app.state.currentBook);

  if (newChapter < 1) {
    if (currentIndex > 0) {
      newBook = books[currentIndex - 1];
      newChapter = app.getChapterCount(newBook);
    } else {
      return;
    }
  } else if (newChapter > chapterCount) {
    if (currentIndex < books.length - 1) {
      newBook = books[currentIndex + 1];
      newChapter = 1;
    } else {
      return;
    }
  }

  app.state.selectedVerse = null;
  app.loadPassage(newBook, newChapter);
}

export function scrollToVerse(app, verseNumber) {
  app.saveReadingPosition?.("verse-selection-start");
  app.state.selectedVerse = verseNumber;
  app.currentVerseSpan.textContent = `${verseNumber}`;
  app.applyVerseGlow();

  const target = app.passageText.querySelector("[data-verse-glow]");
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function applyVerseGlow(app) {
  // Remove trigger and tray before unwrapping so they aren't left as
  // orphaned siblings in the passage — this is the failure mode when
  // the cache is restored with a previously-mutated innerHTML.
  app.passageText.querySelectorAll("[data-verse-glow]").forEach((wrapper) => {
    wrapper
      .querySelectorAll(".verse-tools-trigger, .verse-tools-tray")
      .forEach((el) => el.remove());
    const parent = wrapper.parentNode;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    parent.removeChild(wrapper);
  });

  if (app.state.selectedVerse === null) return;

  const target = app.passageText.querySelector(
    `.verse[data-verse="${app.state.selectedVerse}"]`,
  );
  if (!target) return;

  // Wrap the target verse in a block-level div that carries the glow styling.
  const wrapper = document.createElement("div");
  wrapper.className = "selected-verse-glow";
  wrapper.setAttribute("data-verse-glow", "");
  target.parentNode.insertBefore(wrapper, target);
  wrapper.appendChild(target);

  // Chevron trigger button — centered at bottom of glow box.
  // On desktop: shows a "or press Enter" hint via CSS ::after (pointer device only).
  const trigger = document.createElement("button");
  trigger.className = "verse-tools-trigger";
  trigger.setAttribute("aria-label", "Open verse tools");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
  wrapper.appendChild(trigger);

  // Tray — renders below the glow box, collapsed by default.
  const tray = document.createElement("div");
  tray.className = "verse-tools-tray";
  tray.setAttribute("aria-hidden", "true");
  tray.innerHTML = `
    <div class="verse-tools-actions verse-tools-actions--top">
        <button class="verse-tool-btn verse-tool-btn--square has-tooltip" type="button" aria-label="References" title="References" data-tooltip="References"><span class="verse-tool-letter">R</span></button>
    </div>
    <div class="verse-tools-actions">
        <button class="verse-tool-btn has-tooltip" type="button" aria-label="Highlight" title="Highlight" data-tooltip="Highlight"><span class="verse-tool-letter">H</span></button>
        <button class="verse-tool-btn has-tooltip" type="button" aria-label="Add bookmark" title="Bookmark" data-tooltip="Bookmark" data-verse-tool="bookmark" aria-haspopup="menu">
            <svg class="verse-tool-icon verse-tool-icon--bookmark-add" width="21" height="21" viewBox="0 0 26 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M6.35 4.2c0-.72.58-1.3 1.3-1.3H14c.72 0 1.3.58 1.3 1.3v15.1l-4.48-2.75-4.47 2.75V4.2z" stroke-width="2.25"></path>
              <path d="M21.8 8.9v5.3" stroke-width="2.45"></path>
              <path d="M19.2 11.55h5.2" stroke-width="2.45"></path>
            </svg>
        </button>
        <button class="verse-tool-btn has-tooltip" type="button" aria-label="Note" title="Note" data-tooltip="Note"><span class="verse-tool-letter">N</span></button>
        <button class="verse-tool-btn has-tooltip" type="button" aria-label="Copy" title="Copy" data-tooltip="Copy" data-verse-tool="copy">
            <svg class="verse-tool-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            </button>
        <button class="verse-tool-btn has-tooltip" type="button" aria-label="Share" title="Share" data-tooltip="Share" data-verse-tool="share">
          <svg class="verse-tool-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <path d="M8.6 10.5 15.4 6.5"></path>
            <path d="M8.6 13.5 15.4 17.5"></path>
          </svg>
        </button>
    </div>`;
  wrapper.appendChild(tray);

  trigger.addEventListener("click", () =>
    toggleVerseTray(wrapper, trigger, tray),
  );

  app.updateBookmarkToolState?.();
}

export function toggleVerseTray(wrapperOrApp, triggerArg, trayArg) {
  let wrapper;
  let trigger;
  let tray;

  if (wrapperOrApp && wrapperOrApp.passageText) {
    wrapper = wrapperOrApp.passageText.querySelector("[data-verse-glow]");
    if (!wrapper) return;

    trigger = wrapper.querySelector(".verse-tools-trigger");
    tray = wrapper.querySelector(".verse-tools-tray");
  } else {
    wrapper = wrapperOrApp;
    trigger = triggerArg;
    tray = trayArg;
  }

  if (!trigger || !tray) return;

  const isOpen = tray.classList.toggle("verse-tools-tray--open");
  trigger.classList.toggle("verse-tools-trigger--open", isOpen);
  trigger.setAttribute("aria-expanded", String(isOpen));
  tray.setAttribute("aria-hidden", String(!isOpen));
}
