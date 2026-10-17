from pathlib import Path

BOOKMARKS = Path('bookmarks.js')
READING_STATE = Path('reading-state.js')
INTERACTIONS = Path('css/interactions.css')


def read(path):
    return path.read_text(encoding='utf-8')


def write(path, text):
    path.write_text(text.rstrip() + '\n', encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(label + ' anchor not found')
    return text.replace(old, new, 1)


reading_state = read(READING_STATE)
old_bookmark_button = '<button class="verse-tool-btn has-tooltip" type="button" aria-label="Bookmark" title="Bookmark" data-tooltip="Bookmark" data-verse-tool="bookmark" aria-haspopup="menu"><span class="verse-tool-letter">B</span></button>'
new_bookmark_button = '''<button class="verse-tool-btn has-tooltip" type="button" aria-label="Add bookmark" title="Bookmark" data-tooltip="Bookmark" data-verse-tool="bookmark" aria-haspopup="menu">
            <svg class="verse-tool-icon verse-tool-icon--bookmark-add" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18l-5-3-5 3V4z"></path>
              <path d="M12 7v6"></path>
              <path d="M9 10h6"></path>
            </svg>
        </button>'''
if 'verse-tool-icon--bookmark-add' not in reading_state:
    reading_state = replace_once(
        reading_state,
        old_bookmark_button,
        new_bookmark_button,
        'bookmark add icon button',
    )
write(READING_STATE, reading_state)

bookmarks = read(BOOKMARKS)
if 'querySelectorAll(".verse-tool-btn--bookmark-menu-open")' not in bookmarks:
    bookmarks = replace_once(
        bookmarks,
        '''export function closeBookmarkColorPicker() {
  document.querySelectorAll(".bookmark-color-menu").forEach((menu) => {
    menu.remove();
  });
}''',
        '''export function closeBookmarkColorPicker() {
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
}''',
        'bookmark color picker close cleanup',
    )

if 'bookmark-color-menu anchor' not in bookmarks:
    bookmarks = replace_once(
        bookmarks,
        '''  const existing = document.querySelector(".bookmark-color-menu");
  if (existing) {
    existing.remove();
    return;
  }

  const tray = anchor.closest(".verse-tools-tray");
  if (!tray) return;

  const menu = document.createElement("div");''',
        '''  const existing = document.querySelector(".bookmark-color-menu");
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

  const menu = document.createElement("div");''',
        'bookmark color picker open setup',
    )

if 'bookmark-color-menu anchor' not in bookmarks:
    bookmarks = replace_once(
        bookmarks,
        '''  tray.appendChild(menu);

  menu.querySelectorAll("[data-bookmark-color-choice]").forEach((button) => {''',
        '''  tray.appendChild(menu);

  const trayRect = tray.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const center = anchorRect.left - trayRect.left + anchorRect.width / 2;
  const halfMenu = menu.offsetWidth / 2;
  const minLeft = halfMenu + 8;
  const maxLeft = tray.clientWidth - halfMenu - 8;
  const left = Math.min(Math.max(center, minLeft), maxLeft);
  menu.style.left = `${left}px`;

  // bookmark-color-menu anchor
  menu.querySelectorAll("[data-bookmark-color-choice]").forEach((button) => {''',
        'bookmark color picker anchor position',
    )

if 'const icon = button.querySelector(".verse-tool-letter");' in bookmarks:
    bookmarks = replace_once(
        bookmarks,
        '''
  const icon = button.querySelector(".verse-tool-letter");
  if (icon) icon.textContent = "B";''',
        '',
        'old bookmark letter update',
    )

bookmarks = bookmarks.replace(
    '<span class="bookmark-choice-trash" aria-hidden="true">⌫</span>',
    '<span class="bookmark-choice-trash" aria-hidden="true">×</span>',
)

if 'const card = event.target.closest("[data-bookmark-jump]");' not in bookmarks:
    bookmarks = replace_once(
        bookmarks,
        '''  sheet.addEventListener("click", (event) => {
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
  });''',
        '''  sheet.addEventListener("click", (event) => {
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
  });''',
        'bookmark sheet card click handler',
    )

if 'card.dataset.bookmarkJump = id;' not in bookmarks:
    bookmarks = replace_once(
        bookmarks,
        '''    const card = document.createElement("article");
    card.className = "bookmark-card";
    card.dataset.bookmarkColor = item.color;''',
        '''    const card = document.createElement("article");
    card.className = "bookmark-card";
    card.dataset.bookmarkColor = item.color;
    card.dataset.bookmarkJump = id;
    card.setAttribute("role", "button");
    card.tabIndex = 0;''',
        'bookmark card jump target',
    )

if 'remove.className = "bookmark-card__remove";' not in bookmarks:
    bookmarks = replace_once(
        bookmarks,
        '''    const actions = document.createElement("div");
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

    actions.append(jump, remove);''',
        '''    const actions = document.createElement("div");
    actions.className = "bookmark-card__actions";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bookmark-card__remove";
    remove.dataset.bookmarkRemoveId = id;
    remove.setAttribute("aria-label", "Remove bookmark");
    remove.textContent = "×";

    actions.append(remove);''',
        'bookmark card remove action',
    )

write(BOOKMARKS, bookmarks)

css = read(INTERACTIONS)
if '.verse-tool-btn--bookmark-menu-open::after' not in css:
    css = replace_once(
        css,
        '''.verse-tool-btn--bookmarked[data-bookmark-color="blue"] {
  border-color: rgba(75, 131, 230, 0.8);
  box-shadow: 0 0 12px rgba(75, 131, 230, 0.25);
}

.bookmark-color-menu {''',
        '''.verse-tool-btn--bookmarked[data-bookmark-color="blue"] {
  border-color: rgba(75, 131, 230, 0.8);
  box-shadow: 0 0 12px rgba(75, 131, 230, 0.25);
}

.verse-tool-icon--bookmark-add {
  width: 18px;
  height: 18px;
}

.verse-tool-btn--bookmark-menu-open {
  z-index: 6;
}

.verse-tool-btn--bookmark-menu-open::after {
  display: none;
}

.bookmark-color-menu {''',
        'bookmark icon and tooltip css',
    )

css = css.replace('  bottom: 72px;\n', '  bottom: 68px;\n')

if '.bookmark-card:hover,' not in css:
    css = replace_once(
        css,
        '''.bookmark-card {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.7rem;
  border: 1px solid rgba(207, 178, 42, 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}''',
        '''.bookmark-card {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.7rem;
  border: 1px solid rgba(207, 178, 42, 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  touch-action: manipulation;
}

.bookmark-card:hover,
.bookmark-card:focus-visible {
  border-color: rgba(207, 178, 42, 0.38);
  background: rgba(207, 178, 42, 0.06);
  outline: none;
}''',
        'bookmark card tappable css',
    )

if '.bookmark-card__remove {' not in css:
    css = replace_once(
        css,
        '''.bookmark-card__action {
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
}''',
        '''.bookmark-card__remove {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  border-radius: 999px;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}

.bookmark-card__remove:focus-visible,
.bookmark-card__remove:hover {
  color: var(--accent-color);
  background: rgba(207, 178, 42, 0.1);
  outline: none;
}''',
        'bookmark card remove css',
    )

write(INTERACTIONS, css)

print('bookmark UI fixes applied')
