// events.js
// Wires all DOM event listeners to BibleApp instance methods.
// New feature bindings go here — app.js does not need to change.

import { setLightMode, changeColorTheme, applyLightMode } from "./ui.js";
import { attachDragToResize } from "./bottom-sheet-drag.js";
import { runMegasearch, performKeywordSearch } from "./search.js";
import { applyReadingFont, populateAboutVersion } from "./settings.js";
import { initSwipe } from "./swipe.js";
import { installPsalmTranslations } from "./psalm-translations.js";
import {
  handleChangeEmail,
  handleChangePassword,
  handleForgotPassword,
} from "./auth.js";
import { attachButtonHaptics, hapticFirm } from "./haptics.js";

const BUG_REPORT_EMAIL = "legelux+bugs@proton.me";

const BUG_REPORT_MODAL_HTML = `
<div id="bugReportModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="bugReportModalTitle" aria-hidden="true" inert>
    <div class="modal-content modal-content--sm">
        <div class="modal-header">
            <h2 id="bugReportModalTitle" tabindex="-1">Report a Bug</h2>
            <button class="close-btn close-control" id="closeBugReportModal" aria-label="Close" type="button">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7L17 17M17 7L7 17"></path>
                </svg>
            </button>
        </div>
        <div class="modal-body">
            <p>First copy the debug log. Then open an email and paste the log under the marked line.</p>
            <div class="btn-row">
                <button id="copyBugReportLog" class="primary-btn" type="button">Copy Debug Log</button>
                <button id="openBugReportEmail" class="secondary-btn" type="button" disabled>Open Email</button>
            </div>
            <p id="bugReportStatus" aria-live="polite"></p>
            <textarea id="bugReportManualLog" class="input-field" rows="8" hidden readonly></textarea>
        </div>
    </div>
</div>`;

const CHANGE_EMAIL_HTML = `
<div id="changeEmailModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="changeEmailModalTitle" aria-hidden="true" inert>
                <div class="modal-content">
                        <div class="modal-header">
                                <h2 id="changeEmailModalTitle" tabindex="-1">Change Email</h2>
                                <button class="close-btn" id="closeChangeEmailModal" aria-label="Close" type="button">&times;</button>
                        </div>
                        <div class="modal-body">
                                <form id="changeEmailForm">
                                        <input type="hidden" name="username" autocomplete="username">
                                        <div class="setting-item">
                                                <label for="changeEmailCurrent">Current Password</label>
                                                <input type="password" id="changeEmailCurrent" class="input-field" placeholder="Enter current password" autocomplete="current-password">
                                        </div>
                                        <div class="setting-item">
                                                <label for="changeEmailNew">New Email</label>
                                                <input type="email" id="changeEmailNew" class="input-field" placeholder="Enter current email" autocomplete="email">
                                        </div>
                                        <button type="submit" class="primary-btn" style="width:100%;margin-top:var(--spacing-md)">Update Email</button>
                                </form>
                        </div>
                </div>
        </div>`;

const CHANGE_PASSWORD_HTML = `
<div id="changePasswordModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="changePasswordModalTitle" aria-hidden="true" inert>
                <div class="modal-content">
                        <div class="modal-header">
                                <h2 id="changePasswordModalTitle" tabindex="-1">Change Password</h2>
                                <button class="close-btn" id="closeChangePasswordModal" aria-label="Close" type="button">&times;</button>
                        </div>
                        <div class="modal-body">
                                <form id="changePasswordForm">
                                        <input type="hidden" name="username" autocomplete="username">
                                        <div class="setting-item">
                                                <label for="changePasswordCurrent">Current Password</label>
                                                <input type="password" id="changePasswordCurrent" class="input-field" placeholder="Enter current password" autocomplete="current-password">
                                        </div>
                                        <div class="setting-item">
                                                <label for="changePasswordNew">New Password</label>
                                                <input type="password" id="changePasswordNew" class="input-field" placeholder="At least 6 characters" autocomplete="new-password">
                                        </div>
                                        <button type="submit" class="primary-btn" style="width:100%;margin-top:var(--spacing-md)">Update Password</button>
                                </form>
                        </div>
                </div>
        </div>`;

function injectModal(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html.trim();
  const el = tmp.firstElementChild;
  document.body.appendChild(el);
  return el;
}

function teardown(modal, app) {
  app.closeModal(modal);
  modal.addEventListener("transitionend", () => modal.remove(), { once: true });
  setTimeout(() => {
    if (modal.isConnected) modal.remove();
  }, 400);
}

function openChangeEmailModal(app) {
  const modal = injectModal(CHANGE_EMAIL_HTML);
  const usernameField = modal.querySelector('input[name="username"]');
  if (usernameField) usernameField.value = app.currentUser?.email ?? "";

  app.openModal(modal);

  modal
    .querySelector("#closeChangeEmailModal")
    .addEventListener("click", () => teardown(modal, app));
  modal.querySelector("#changeEmailForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handleChangeEmail(app).then(() => teardown(modal, app));
  });
}

function openChangePasswordModal(app) {
  const modal = injectModal(CHANGE_PASSWORD_HTML);
  const usernameField = modal.querySelector('input[name="username"]');
  if (usernameField) usernameField.value = app.currentUser?.email ?? "";

  app.openModal(modal);

  modal
    .querySelector("#closeChangePasswordModal")
    .addEventListener("click", () => teardown(modal, app));
  modal.querySelector("#changePasswordForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handleChangePassword(app).then(() => teardown(modal, app));
  });
}

function buildBugReportMailto() {
  const body = [
    "Describe the issue here:",
    "",
    "",
    "",
    "__________________________________",
    "PASTE the copied debug log below this line:",
    "__________________________________",
    "",
    "",
    "",
    "",
  ].join("\n");

  return (
    "mailto:" +
    encodeURIComponent(BUG_REPORT_EMAIL) +
    "?subject=" +
    encodeURIComponent("Bug Report") +
    "&body=" +
    encodeURIComponent(body)
  );
}

function redactDebugReportText(text) {
  if (typeof text !== "string") return text;
  return text.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "[redacted-email]",
  );
}

function installBugReportUi(app) {
  const controls = document.querySelector(".header-controls");
  const settingsButton = document.getElementById("settingsBtn");

  if (!controls || !settingsButton || document.getElementById("bugReportBtn"))
    return;

  const button = document.createElement("button");
  button.className = "icon-btn";
  button.id = "bugReportBtn";
  button.type = "button";
  button.title = "Report a bug";
  button.setAttribute("aria-label", "Report a bug");
  button.innerHTML =
    '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6" y="7" width="12" height="13" rx="5" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></rect><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7V5a3 3 0 0 1 6 0v2M12 11v9M6 12H3M18 12h3M7 17l-2 2M17 17l2 2M8 8 6 6M16 8l2-2"></path></svg>';
  controls.insertBefore(button, settingsButton);

  const modal = injectModal(BUG_REPORT_MODAL_HTML);
  const closeButton = modal.querySelector("#closeBugReportModal");
  const copyButton = modal.querySelector("#copyBugReportLog");
  const emailButton = modal.querySelector("#openBugReportEmail");
  const status = modal.querySelector("#bugReportStatus");
  const manualLog = modal.querySelector("#bugReportManualLog");

  function resetModal() {
    emailButton.disabled = true;
    status.textContent = "";
    manualLog.hidden = true;
    manualLog.value = "";
  }

  button.addEventListener("click", () => {
    resetModal();
    app.openModal(modal);
  });

  closeButton.addEventListener("click", () => app.closeModal(modal));

  modal.addEventListener("click", (event) => {
    if (event.target === modal) app.closeModal(modal);
  });

  copyButton.addEventListener("click", async () => {
    let report =
      typeof window._buildDebugReport === "function"
        ? window._buildDebugReport()
        : "Debug log unavailable. Please describe what happened.";

    report = redactDebugReportText(report);

    try {
      await navigator.clipboard.writeText(report);
      status.textContent =
        "Debug log copied. Tap Open Email, then paste the log under the marked line.";
      emailButton.disabled = false;
      manualLog.hidden = true;
    } catch (_) {
      manualLog.value = report;
      manualLog.hidden = false;
      manualLog.focus();
      manualLog.select();
      status.textContent =
        "Copy failed. Manually copy the log below, then tap Open Email.";
      emailButton.disabled = false;
    }
  });

  emailButton.addEventListener("click", () => {
    window.location.href = buildBugReportMailto();
  });
}

function syncReadingDisplay(app) {
  document.body.classList.toggle(
    "hide-verse-numbers",
    !app.state.showVerseNumbers,
  );
  document.body.classList.toggle(
    "muted-verse-numbers",
    !app.state.coloredVerseNumbers,
  );
  document.body.classList.toggle(
    "hide-chapter-arrows",
    !app.state.showChapterArrows,
  );
  document.body.classList.toggle(
    "verse-by-verse-mode",
    !!app.state.verseByVerse,
  );

  for (const panel of document.querySelectorAll(
    "#passageText, #swipePrev, #swipeNext",
  )) {
    panel.classList.toggle("verse-by-verse", !!app.state.verseByVerse);
  }
}

function installCanonFallback(app) {
  const loadPassage = app.loadPassage.bind(app);

  app.loadPassage = async (
    book,
    chapter,
    restoreScroll = false,
    source = "unspecified",
  ) => {
    const books = app.getAllBooks();
    const activeBook = app.state.currentBook;

    if (activeBook && !books.includes(activeBook)) {
      app._dbgEvent?.(
        `loadPassage: "${activeBook}" not in canon, redirecting to Genesis 1`,
      );
      return loadPassage("Genesis", 1, restoreScroll, source);
    }

    return loadPassage(book, chapter, restoreScroll, source);
  };
}

function normalizeModalMarkup() {
  document
    .querySelectorAll(".accordion-section[data-settings-section]")
    .forEach((section) => {
      if (!section.hasAttribute("data-section")) {
        section.setAttribute(
          "data-section",
          section.getAttribute("data-settings-section"),
        );
      }
    });
}

/**
 * @param {object} app - BibleApp instance
 */
export function attachEventListeners(app) {
  normalizeModalMarkup();
  installCanonFallback(app);
  installPsalmTranslations(app);
  attachButtonHaptics(app);
  installBugReportUi(app);
  app.installBookmarkSheet?.();

  app.searchToggleBtn?.addEventListener("click", () => app.toggleSearch());
  app.closeSearchBtn?.addEventListener("click", () => app.closeSearch());
  app.searchInput?.addEventListener("input", (e) =>
    app.handleSearch(e.target.value, "type"),
  );
  app.searchInput?.addEventListener("keydown", (e) =>
    app.handleSearchKeydown(e),
  );
  app.searchInput?.addEventListener("paste", () =>
    setTimeout(() => app.handleSearch(app.searchInput.value, "paste"), 0),
  );

  document
    .getElementById("megasearchToggle")
    ?.addEventListener("change", (e) => {
      const query = app.searchLastQuery || "";
      if (e.target.checked) {
        if (query.trim().length >= 3 && app.currentSearchResults?.length > 0) {
          runMegasearch(app, query);
        }
      } else if (query.trim().length > 0) {
        performKeywordSearch(app, query);
      }
    });

  app.prevChapterBtn?.addEventListener("click", () => app.navigateChapter(-1));
  app.nextChapterBtn?.addEventListener("click", () => app.navigateChapter(1));
  app.bookSelector?.addEventListener("click", () => {
    app.referencePickerDraft = null;
    app.openBookModal();
  });
  app.chapterSelector?.addEventListener("click", () => {
    app.referencePickerDraft = null;
    app.openChapterModal();
  });
  app.verseSelector?.addEventListener("click", () => {
    app.referencePickerDraft = null;
    app.openVerseModal();
  });

  initSwipe(app);

  app.translationSelectorBtn?.addEventListener("click", () =>
    app.openTranslationModal(),
  );
  document
    .getElementById("copyPassage")
    ?.addEventListener("click", () => app.copyPassage());

  const verseSelectionTarget =
    document.getElementById("swipeViewport") ?? app.passageText;

  if (verseSelectionTarget) {
    const HOLD_MS = 500;
    const MOVE_LIMIT = 12;
    const selectPericopeHeading = (heading) => {
      const startVerse = heading.dataset.startVerse;
      const endVerse = heading.dataset.endVerse;
      if (!startVerse || !endVerse) return;

      const verses = Array.from(
        app.passageText?.querySelectorAll('.verse[data-verse]') || [],
      );
      const startIndex = verses.findIndex(
        (verse) => verse.dataset.verse === startVerse,
      );
      const endIndex = verses.findIndex(
        (verse) => verse.dataset.verse === endVerse,
      );
      if (startIndex < 0 || endIndex < startIndex) return;

      const startEl = verses[startIndex];
      const endEl = verses[endIndex];

      app.state.selectedVerse = null;
      app.applyVerseGlow?.();

      const range = document.createRange();
      range.setStartBefore(startEl);
      range.setEndAfter(endEl);

      const selection = window.getSelection();
      if (!selection) return;

      selection.removeAllRanges();
      selection.addRange(range);

      app._dbgUserAction?.(`selected pericope: ${startVerse}-${endVerse}`);
    };

    let holdTimer = null;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let pressedVerse = null;
    let pressedHeading = null;
    let holdActivated = false;

    const selectVerse = (verse) => {
      const raw = verse?.dataset.verse;
      if (!raw) return;
      const value = /^\d+$/.test(raw) ? Number(raw) : raw.toLowerCase();

      if (app.state.selectedVerse === value) {
        app.state.selectedVerse = null;
        app.applyVerseGlow();
      } else {
        app.scrollToVerse(value);
      }
    };

    const clearSelectedVerse = () => {
      if (app.state.selectedVerse == null) return;
      app.state.selectedVerse = null;
      app.applyVerseGlow();
    };

    const cancelVersePress = () => {
      clearTimeout(holdTimer);
      holdTimer = null;
      pointerId = null;
      pressedVerse = null;
      pressedHeading = null;
    };

    verseSelectionTarget.addEventListener("click", (event) => {
      const copyButton = event.target.closest('[data-verse-tool="copy"]');
      if (!copyButton || !verseSelectionTarget.contains(copyButton)) return;

      event.preventDefault();
      event.stopPropagation();

      app.copySelectedVerse();
    });

    verseSelectionTarget.addEventListener("click", (event) => {
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
      const heading = event.target.closest(".pericope-heading");
      if (!heading || !verseSelectionTarget.contains(heading)) return;

      event.preventDefault();
      event.stopPropagation();
      selectPericopeHeading(heading);
    });

    verseSelectionTarget.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;

      const heading = event.target.closest(".pericope-heading");
      if (!heading || !verseSelectionTarget.contains(heading)) return;

      event.preventDefault();
      selectPericopeHeading(heading);
    });

    verseSelectionTarget.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".verse-tools-tray, .verse-tools-trigger"))
        return;

      const heading = event.target.closest(".pericope-heading");
      if (!heading || !verseSelectionTarget.contains(heading)) return;

      if (app.state.verseSelectionGesture !== "hold") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      cancelVersePress();

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      pressedHeading = heading;
      holdActivated = false;

      holdTimer = setTimeout(() => {
        if (!pressedHeading) return;
        holdActivated = true;
        hapticFirm(app);
        selectPericopeHeading(pressedHeading);
      }, HOLD_MS);
    });

    verseSelectionTarget.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".verse-tools-tray, .verse-tools-trigger"))
        return;

      const verse = event.target.closest(".verse");
      if (!verse) return;

      if (app.state.verseSelectionGesture !== "hold") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      cancelVersePress();

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      pressedVerse = verse;
      holdActivated = false;

      holdTimer = setTimeout(() => {
        if (!pressedVerse) return;
        holdActivated = true;
        hapticFirm(app);
        selectVerse(pressedVerse);
      }, HOLD_MS);
    });

    verseSelectionTarget.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;

      const movedX = Math.abs(event.clientX - startX);
      const movedY = Math.abs(event.clientY - startY);

      if (movedX > MOVE_LIMIT || movedY > MOVE_LIMIT) cancelVersePress();
    });

    const finishVersePress = (event) => {
      if (event.pointerId !== pointerId) return;

      if (holdActivated) {
        event.preventDefault();
        event.stopPropagation();
      }

      cancelVersePress();
    };

    verseSelectionTarget.addEventListener("pointerup", finishVersePress);
    verseSelectionTarget.addEventListener("pointercancel", finishVersePress);
    verseSelectionTarget.addEventListener("click", (event) => {
      if (event.target.closest(".verse-tools-tray, .verse-tools-trigger"))
        return;

      const verse = event.target.closest(".verse");
      if (!verse) return;

      event.preventDefault();

      if (app.state.verseSelectionGesture === "tap") {
        selectVerse(verse);
        return;
      }

      if (app.state.selectedVerse != null) {
        clearSelectedVerse();
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (app.state.selectedVerse == null) return;
      if (
        event
          .composedPath()
          .some(
            (element) =>
              element instanceof Element &&
              element.matches(
                ".selected-verse-glow, .verse-tools-tray, .verse-tools-trigger",
              ),
          )
      )
        return;
      clearSelectedVerse();
    });

    verseSelectionTarget.addEventListener("contextmenu", (event) => {
      if (event.target.closest(".verse, .pericope-heading"))
        event.preventDefault();
    });
  }

  app.referencesModal = document.getElementById("referencesModal");
  app.closeReferencesModal = document.getElementById("closeReferencesModal");
  app.footnotesSection = document.getElementById("footnotesSection");
  app.footnotesContent = document.getElementById("footnotesContent");
  app.crossReferencesSection = document.getElementById(
    "crossReferencesSection",
  );
  app.crossReferencesContent = document.getElementById(
    "crossReferencesContent",
  );

  [
    app.referencePickerModal,
    app.settingsModal,
    app.loginModal,
    app.signupModal,
    app.userMenuModal,
    app.referencesModal,
    app.translationModal,
    app.translationSyncModal,
    app.deuterocanonInfoModal,
  ].forEach((modal) => {
    if (!modal) return;
    modal.addEventListener("click", (e) => {
      if (e.target !== modal) return;
      if (modal === app.referencePickerModal) app.closeReferencePicker();
      else app.closeModal(modal);
    });
  });

  const openSettings = () => {
    app.hideSyncPrompt();
    app.openModal(app.settingsModal);
    populateAboutVersion();

    const canOfferSync = Boolean(
      app.authAvailable === true && app.authStateResolved && !app.currentUser,
    );

    if (!canOfferSync) return;

    const promptShown = app.maybeShowSyncPrompt();

    if (promptShown) {
      const settingsBody = app.settingsModal?.querySelector(".modal-body");

      if (settingsBody) settingsBody.scrollTop = 0;
    }
  };

  app.settingsBtn?.addEventListener("click", openSettings);
  app.closeReferencePickerModal?.addEventListener("click", () =>
    app.closeReferencePicker(),
  );
  app.referencePickerBack?.addEventListener("click", () =>
    app.goBackReferencePicker(),
  );
  app.closeDeuterocanonInfoModal?.addEventListener("click", () =>
    app.closeModal(app.deuterocanonInfoModal),
  );
  app.closeSettingsModal?.addEventListener("click", () =>
    app.closeModal(app.settingsModal),
  );
  app.closeLoginModal?.addEventListener("click", () =>
    app.closeModal(app.loginModal),
  );
  app.closeSignupModal?.addEventListener("click", () =>
    app.closeModal(app.signupModal),
  );
  app.closeUserMenuModal?.addEventListener("click", () =>
    app.closeModal(app.userMenuModal),
  );
  app.closeReferencesModal?.addEventListener("click", () =>
    app.closeModal(app.referencesModal),
  );
  app.closeTranslationModal?.addEventListener("click", () =>
    app.closeModal(app.translationModal),
  );

  attachDragToResize(app);

  app.verseNumbersToggle?.addEventListener("input", (e) => {
    app.state.showVerseNumbers = e.currentTarget.checked;
    syncReadingDisplay(app);
  });
  app.verseNumbersToggle?.addEventListener("change", () =>
    app.toggleSetting("showVerseNumbers"),
  );

  app.coloredVerseNumbersToggle?.addEventListener("input", (e) => {
    app.state.coloredVerseNumbers = e.currentTarget.checked;
    syncReadingDisplay(app);
  });
  app.coloredVerseNumbersToggle?.addEventListener("change", () => {
    app.toggleSetting("coloredVerseNumbers");
  });

  app.headingsToggle?.addEventListener("change", () =>
    app.toggleSetting("showHeadings"),
  );

  app.chapterArrowsToggle?.addEventListener("input", (e) => {
    app.state.showChapterArrows = e.currentTarget.checked;
    syncReadingDisplay(app);
  });
  app.chapterArrowsToggle?.addEventListener("change", () =>
    app.toggleSetting("showChapterArrows"),
  );
  app.hideInterfaceOnScrollToggle?.addEventListener("change", () =>
    app.toggleSetting("hideInterfaceOnScroll"),
  );
  app.hapticsToggle?.addEventListener("change", () =>
    app.toggleSetting("hapticsEnabled"),
  );

  app.verseByVerseToggle?.addEventListener("input", (e) => {
    app.state.verseByVerse = e.currentTarget.checked;
    syncReadingDisplay(app);
  });
  app.verseByVerseToggle?.addEventListener("change", () =>
    app.toggleVerseByVerse(),
  );
  app.fontSizeDecrease?.addEventListener("click", () => {
    void app.updateFontSize((app.state.fontSize || 20) - 1);
  });

  app.fontSizeIncrease?.addEventListener("click", () => {
    void app.updateFontSize((app.state.fontSize || 20) + 1);
  });

  app.verseSelectionGestureSelect?.addEventListener("change", async (event) => {
    const gesture = event.currentTarget.value === "tap" ? "tap" : "hold";
    app.state.verseSelectionGesture = gesture;
    localStorage.setItem("verseSelectionGesture", gesture);

    if (app.canWriteRemoteState()) {
      await app.database
        .ref(`users/${app.currentUser.uid}/settings/verseSelectionGesture`)
        .set(gesture);
    }
  });

  const readingFontSelector = document.getElementById("readingFontSelector");
  if (readingFontSelector) {
    readingFontSelector.addEventListener("change", async () => {
      const font = readingFontSelector.value;
      await applyReadingFont(app, font);
      app.state.readingFont = font;
      localStorage.setItem("readingFont", font);

      if (app.canWriteRemoteState()) {
        await app.database
          .ref(`users/${app.currentUser.uid}/settings/readingFont`)
          .set(font);
      }
    });
  }

  document.querySelectorAll('input[name="lightMode"]').forEach((radio) => {
    radio.addEventListener("change", (event) => {
      if (!event.currentTarget.checked) return;

      app._dbgUserAction?.(`changeAppearance: ${event.currentTarget.value}`);
      setLightMode(app, event.currentTarget.value);
    });
  });

  const themeSelector = document.getElementById("themeSelector");
  let lastAppliedTheme = app.state.colorTheme;

  const applyThemeSelection = async (event) => {
    const theme = event.currentTarget.value;
    if (!theme || theme === lastAppliedTheme) return;

    lastAppliedTheme = theme;
    app._dbgUserAction?.(`changeTheme: ${theme}`);
    app.state.colorTheme = theme;
    localStorage.setItem("colorTheme", theme);
    await changeColorTheme(app, theme);
  };

  themeSelector?.addEventListener("input", applyThemeSelection);
  themeSelector?.addEventListener("change", applyThemeSelection);

  document.getElementById("userBtn")?.addEventListener("click", () => {
    app.hideSyncPrompt();
    app.handleUserButtonClick();
  });
  app.syncPromptDismiss?.addEventListener("click", () =>
    app.dismissSyncPrompt(),
  );
  app.syncPromptSignIn?.addEventListener("click", () =>
    app.openSyncPromptLogin(),
  );
  document
    .getElementById("changeEmailBtn")
    ?.addEventListener("click", () => openChangeEmailModal(app));
  document
    .getElementById("changePasswordBtn")
    ?.addEventListener("click", () => openChangePasswordModal(app));
  document
    .getElementById("forgotPasswordBtn")
    ?.addEventListener("click", () => handleForgotPassword(app));

  const openSignupModal = (event) => {
    event.preventDefault();
    app.closeModal(app.loginModal);
    app.openModal(app.signupModal);
  };

  document
    .getElementById("showSignup")
    ?.addEventListener("click", openSignupModal);
  document
    .getElementById("showSignupLink")
    ?.addEventListener("click", openSignupModal);

  document
    .getElementById("showLoginLink")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      app.closeModal(app.signupModal);
      app.openModal(app.loginModal);
    });

  document.getElementById("loginForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    app.handleLogin();
  });

  document.getElementById("signupForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    app.handleSignup();
  });

  document
    .getElementById("logoutBtn")
    ?.addEventListener("click", () => app.handleLogout());

  window.addEventListener(
    "scroll",
    () => {
      app.handleChromeScroll();
      clearTimeout(app.scrollTimeout);
      app.scrollTimeout = setTimeout(() => app.saveReadingPosition(), 500);
    },
    { passive: true },
  );

  document.addEventListener("keydown", (event) =>
    app.handleKeyboardShortcuts(event),
  );
}
