from pathlib import Path

MODALS = Path('modals.js')
CSS = Path('css/modals.css')


def read(path):
    return path.read_text(encoding='utf-8')


def write(path, text):
    path.write_text(text.rstrip() + '\n', encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(label + ' anchor not found')
    return text.replace(old, new, 1)


OLD_MODAL_BLOCK = '''    view.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'picker-actions picker-actions--footer';

    const goButton = document.createElement('button');
    goButton.className = 'secondary-btn reference-picker-go';
    goButton.type = 'button';
    goButton.textContent = 'Go to chapter';
    goButton.addEventListener('click', async () => {
        const targetBook = draft.book || app.state.currentBook;
        const targetChapter = draft.chapter || app.state.currentChapter;

        app._dbgUserAction?.('picker go: ' + targetBook + ' ' + targetChapter);
        await app.loadPassage(targetBook, targetChapter, false, 'chapter-picker-go');
        closeReferencePicker(app);
    });

    actions.appendChild(goButton);
    view.appendChild(actions);'''

NEW_MODAL_BLOCK = '''    const actions = document.createElement('div');
    actions.className = 'picker-actions picker-actions--top';

    const goButton = document.createElement('button');
    goButton.className = 'secondary-btn reference-picker-go';
    goButton.type = 'button';
    goButton.textContent = 'Go';
    goButton.addEventListener('click', async () => {
        const targetBook = draft.book || app.state.currentBook;
        const targetChapter = draft.chapter || app.state.currentChapter;

        app._dbgUserAction?.('picker go: ' + targetBook + ' ' + targetChapter);
        await app.loadPassage(targetBook, targetChapter, false, 'chapter-picker-go');
        closeReferencePicker(app);
    });

    actions.appendChild(goButton);
    view.appendChild(actions);
    view.appendChild(grid);'''

OLD_CSS_BLOCK = '''.picker-actions--footer {
    margin-top: 0.75rem;
}

.reference-picker-go {
    width: auto;
    margin-inline: auto;
    padding: 0.35rem 0.75rem;
    border-color: transparent;
}'''

NEW_CSS_BLOCK = '''.picker-actions--top {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.5rem;
    padding: 0.15rem 0 0.35rem;
    background-color: var(--bg-card);
}

.reference-picker-go {
    width: auto;
    min-width: 4rem;
    margin: 0;
    padding: 0.35rem 0.75rem;
    border-color: transparent;
}'''

modals = read(MODALS)
if "goButton.textContent = 'Go';" not in modals:
    modals = replace_once(modals, OLD_MODAL_BLOCK, NEW_MODAL_BLOCK, 'chapter picker go block')
if 'picker-actions--footer' in modals or "goButton.textContent = 'Go to chapter';" in modals:
    raise SystemExit('old chapter go block remains in modals.js')
write(MODALS, modals)

css = read(CSS)
if '.picker-actions--top' not in css:
    css = replace_once(css, OLD_CSS_BLOCK, NEW_CSS_BLOCK, 'chapter picker go css')
if '.picker-actions--footer' in css:
    raise SystemExit('old footer action style remains in css/modals.css')
if 'background-color: var(--bg-card);' not in css:
    raise SystemExit('sticky action background missing')
write(CSS, css)

print('picker go action moved')
