from pathlib import Path

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
old_button = '''<button class="verse-tool-btn has-tooltip" type="button" aria-label="Add bookmark" title="Bookmark" data-tooltip="Bookmark" data-verse-tool="bookmark" aria-haspopup="menu">
            <svg class="verse-tool-icon verse-tool-icon--bookmark-add" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18l-5-3-5 3V4z"></path>
              <path d="M12 7v6"></path>
              <path d="M9 10h6"></path>
            </svg>
        </button>'''
new_button = '''<button class="verse-tool-btn has-tooltip" type="button" aria-label="Add bookmark" title="Bookmark" data-tooltip="Bookmark" data-verse-tool="bookmark" aria-haspopup="menu">
            <svg class="verse-tool-icon verse-tool-icon--bookmark-add" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M7.25 3.25C7.25 2.56 7.81 2 8.5 2h7c.69 0 1.25.56 1.25 1.25V20.75l-4.75-2.85-4.75 2.85V3.25Z" fill="currentColor"></path>
              <path d="M12 7.15v4.7M9.65 9.5h4.7" fill="none" stroke="#1c1c1a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        </button>'''

if 'stroke="#1c1c1a"' not in reading_state:
    reading_state = replace_once(
        reading_state,
        old_button,
        new_button,
        'bookmark add icon button',
    )

write(READING_STATE, reading_state)

css = read(INTERACTIONS)
old_css = '''.verse-tool-icon--bookmark-add {
  width: 18px;
  height: 18px;
}'''
new_css = '''.verse-tool-icon--bookmark-add {
  display: block;
  width: 20px;
  height: 20px;
  overflow: visible;
}'''

if 'overflow: visible;' not in css:
    css = replace_once(css, old_css, new_css, 'bookmark add icon css')

write(INTERACTIONS, css)

print('bookmark icon fix applied')
