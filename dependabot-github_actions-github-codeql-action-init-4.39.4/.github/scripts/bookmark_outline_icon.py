import base64
from pathlib import Path

READING_STATE = Path('reading-state.js')
INTERACTIONS = Path('css/interactions.css')
BUTTON_B64 = 'PGJ1dHRvbiBjbGFzcz0idmVyc2UtdG9vbC1idG4gaGFzLXRvb2x0aXAiIHR5cGU9ImJ1dHRvbiIgYXJpYS1sYWJlbD0iQWRkIGJvb2ttYXJrIiB0aXRsZT0iQm9va21hcmsiIGRhdGEtdG9vbHRpcD0iQm9va21hcmsiIGRhdGEtdmVyc2UtdG9vbD0iYm9va21hcmsiIGFyaWEtaGFzcG9wdXA9Im1lbnUiPgogICAgICAgICAgICA8c3ZnIGNsYXNzPSJ2ZXJzZS10b29sLWljb24gdmVyc2UtdG9vbC1pY29uLS1ib29rbWFyay1hZGQiIHdpZHRoPSIyMSIgaGVpZ2h0PSIyMSIgdmlld0JveD0iMCAwIDI2IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBhcmlhLWhpZGRlbj0idHJ1ZSIgZm9jdXNhYmxlPSJmYWxzZSI+CiAgICAgICAgICAgICAgPHBhdGggZD0iTTYuMzUgNC4yYzAtLjcyLjU4LTEuMyAxLjMtMS4zSDE0Yy43MiAwIDEuMy41OCAxLjMgMS4zdjE1LjFsLTQuNDgtMi43NS00LjQ3IDIuNzVWNC4yeiIgc3Ryb2tlLXdpZHRoPSIyLjI1Ij48L3BhdGg+CiAgICAgICAgICAgICAgPHBhdGggZD0iTTIxLjggOC45djUuMyIgc3Ryb2tlLXdpZHRoPSIyLjQ1Ij48L3BhdGg+CiAgICAgICAgICAgICAgPHBhdGggZD0iTTE5LjIgMTEuNTVoNS4yIiBzdHJva2Utd2lkdGg9IjIuNDUiPjwvcGF0aD4KICAgICAgICAgICAgPC9zdmc+CiAgICAgICAgPC9idXR0b24+'


def write(path, text):
    path.write_text(text.rstrip() + '\n', encoding='utf-8')


text = READING_STATE.read_text(encoding='utf-8')
start = text.find('<button class="verse-tool-btn has-tooltip" type="button" aria-label="Add bookmark"')
if start == -1:
    raise SystemExit('bookmark button start not found')
end = text.find('        </button>', start)
if end == -1:
    raise SystemExit('bookmark button end not found')
end += len('        </button>')
new_button = base64.b64decode(BUTTON_B64).decode('utf-8')
if 'M6.35 4.2c0-.72.58-1.3 1.3-1.3H14' not in text:
    text = text[:start] + new_button + text[end:]
write(READING_STATE, text)

css = INTERACTIONS.read_text(encoding='utf-8')
old_css_18 = '''.verse-tool-icon--bookmark-add {
  width: 18px;
  height: 18px;
}'''
old_css_20 = '''.verse-tool-icon--bookmark-add {
  display: block;
  width: 20px;
  height: 20px;
  overflow: visible;
}'''
new_css = '''.verse-tool-icon--bookmark-add {
  display: block;
  width: 21px;
  height: 21px;
  overflow: visible;
}'''
if 'width: 21px;' not in css:
    if old_css_20 in css:
        css = css.replace(old_css_20, new_css, 1)
    elif old_css_18 in css:
        css = css.replace(old_css_18, new_css, 1)
    else:
        raise SystemExit('bookmark icon css anchor not found')
write(INTERACTIONS, css)
print('outline bookmark icon applied')
