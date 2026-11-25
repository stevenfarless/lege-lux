#!/usr/bin/env python3
"""
Convert a folder of USFM3 files (OEB or ULT) to the app's per-book JSON schema.

Works with:
  - OEB: https://github.com/openenglishbible/Open-English-Bible  (USFM files in usfm/)
  - ULT: https://git.door43.org/unfoldingWord/en_ult              (USFM3 files, one per book)

Usage:
  # Clone the source first, then:
  python scripts/convert_usfm_to_json.py \
      --input-dir path/to/usfm/files \
      --translation OEB \
      --copyright "Open English Bible. Public domain (CC0)." \
      --output-dir translations/OEB/OEB_books

  python scripts/convert_usfm_to_json.py \
      --input-dir path/to/en_ult \
      --translation ULT \
      --copyright "unfoldingWord Literal Text. CC BY-SA 4.0. https://unfoldingword.org/ult" \
      --output-dir translations/ULT/ULT_books

Requires: usfm-grammar
  pip install usfm-grammar
"""

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

# Book code -> canonical app book name (matches BSB_books filenames)
USFM_BOOK_CODES = {
    "GEN": "Genesis", "EXO": "Exodus", "LEV": "Leviticus", "NUM": "Numbers",
    "DEU": "Deuteronomy", "JOS": "Joshua", "JDG": "Judges", "RUT": "Ruth",
    "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings",
    "1CH": "1 Chronicles", "2CH": "2 Chronicles", "EZR": "Ezra",
    "NEH": "Nehemiah", "EST": "Esther", "JOB": "Job", "PSA": "Psalm",
    "PRO": "Proverbs", "ECC": "Ecclesiastes", "SNG": "Song of Solomon",
    "ISA": "Isaiah", "JER": "Jeremiah", "LAM": "Lamentations",
    "EZK": "Ezekiel", "DAN": "Daniel", "HOS": "Hosea", "JOL": "Joel",
    "AMO": "Amos", "OBA": "Obadiah", "JON": "Jonah", "MIC": "Micah",
    "NAM": "Nahum", "HAB": "Habakkuk", "ZEP": "Zephaniah", "HAG": "Haggai",
    "ZEC": "Zechariah", "MAL": "Malachi",
    "MAT": "Matthew", "MRK": "Mark", "LUK": "Luke", "JHN": "John",
    "ACT": "Acts", "ROM": "Romans", "1CO": "1 Corinthians",
    "2CO": "2 Corinthians", "GAL": "Galatians", "EPH": "Ephesians",
    "PHP": "Philippians", "COL": "Colossians", "1TH": "1 Thessalonians",
    "2TH": "2 Thessalonians", "1TI": "1 Timothy", "2TI": "2 Timothy",
    "TIT": "Titus", "PHM": "Philemon", "HEB": "Hebrews", "JAS": "James",
    "1PE": "1 Peter", "2PE": "2 Peter", "1JN": "1 John", "2JN": "2 John",
    "3JN": "3 John", "JUD": "Jude", "REV": "Revelation",
}

# Inline USFM markers to strip (non-content markup)
INLINE_STRIP_PATTERN = re.compile(
    r'\\(?:'
    r'add|nd|wj|tl|sig|sls|w|rb|rt|xt|fqa|fq|ft|fr|f|x|fe|ef'
    r'|k|pn|png|addpn|qt|em|bd|it|bdit|no|sc|sup'
    r')(?:\s[^\\]*?)?\\(?:'
    r'add\*|nd\*|wj\*|tl\*|sig\*|sls\*|w\*|rb\*|rt\*|xt\*|fqa\*|fq\*|ft\*|fr\*|f\*|x\*|fe\*|ef\*'
    r'|k\*|pn\*|png\*|addpn\*|qt\*|em\*|bd\*|it\*|bdit\*|no\*|sc\*|sup\*'
    r')'
)
NOTE_PATTERN = re.compile(r'\\(?:f|x|fe|ef)\s.*?\\(?:f|x|fe|ef)\*', re.DOTALL)
MARKER_PATTERN = re.compile(r'\\[a-z0-9]+\*?')


def clean_verse_text(text: str) -> str:
    text = NOTE_PATTERN.sub('', text)
    text = INLINE_STRIP_PATTERN.sub('', text)
    text = MARKER_PATTERN.sub('', text)
    return ' '.join(text.split()).strip()


def parse_usfm_file(path: Path) -> tuple[str, dict]:
    """
    Returns (book_code, chapters_dict) where chapters_dict is
    { "1": { "1": "verse text", ... }, "2": { ... } }
    """
    content = path.read_text(encoding="utf-8")
    lines = content.splitlines()

    book_code = None
    chapters: dict[str, dict[str, str]] = {}
    current_chapter = None
    current_verse = None
    verse_buffer = []

    def flush_verse():
        nonlocal current_verse, verse_buffer
        if current_chapter and current_verse and verse_buffer:
            raw = ' '.join(verse_buffer)
            chapters.setdefault(current_chapter, {})[current_verse] = clean_verse_text(raw)
        verse_buffer = []
        current_verse = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Book identification
        if line.startswith('\\id '):
            parts = line.split()
            if len(parts) >= 2:
                book_code = parts[1].upper()[:3]
            continue

        # Chapter marker
        c_match = re.match(r'^\\c\s+(\d+)', line)
        if c_match:
            flush_verse()
            current_chapter = c_match.group(1)
            continue

        # Verse marker
        v_match = re.match(r'^\\v\s+(\d+)\s*(.*)', line)
        if v_match:
            flush_verse()
            current_verse = v_match.group(1)
            rest = v_match.group(2).strip()
            if rest:
                verse_buffer.append(rest)
            continue

        # Continuation lines inside a verse (paragraph/poetry markers with text)
        if current_verse:
            # Strip leading paragraph/poetry/heading markers but keep their text
            para_match = re.match(r'^\\(?:p|m|q\d?|qr|qc|b|mi|pi\d?|li\d?|ph\d?|pc|cls|pmo|pm|pmc)\s*(.*)', line)
            if para_match:
                rest = para_match.group(1).strip()
                if rest:
                    verse_buffer.append(rest)
            elif not re.match(r'^\\(?:mt|ms|s\d?|r|d|sp|h|toc|rem|sts)', line):
                # Not a heading/title-only marker — keep the line
                verse_buffer.append(line)

    flush_verse()
    return book_code, chapters


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True, help="Directory containing .usfm files")
    parser.add_argument("--translation", required=True, help="Translation ID, e.g. OEB or ULT")
    parser.add_argument("--copyright", required=True, help="Copyright / license string")
    parser.add_argument("--output-dir", required=True, help="Output directory for per-book JSON files")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    usfm_files = sorted(input_dir.glob("**/*.usfm")) + sorted(input_dir.glob("**/*.USFM"))
    if not usfm_files:
        print(f"No .usfm files found in {input_dir}")
        return

    timestamp = datetime.now(timezone.utc).isoformat()
    converted = 0
    skipped = 0

    for usfm_path in usfm_files:
        book_code, chapters = parse_usfm_file(usfm_path)
        if not book_code or book_code not in USFM_BOOK_CODES:
            print(f"  Skipping {usfm_path.name} (unrecognised book code: {book_code!r})")
            skipped += 1
            continue
        book_name = USFM_BOOK_CODES[book_code]
        if not chapters:
            print(f"  Skipping {usfm_path.name} (no verses parsed)")
            skipped += 1
            continue

        output = {
            "Info": {
                "Copyright": args.copyright,
                "Language": "English",
                "Translation": args.translation,
                "Timestamp": timestamp,
            },
            book_name: chapters,
        }
        out_path = output_dir / f"{book_name}.json"
        out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False))
        print(f"  {book_code} -> {out_path.name} ({len(chapters)} chapters)")
        converted += 1

    print(f"\nDone. {converted} books converted, {skipped} skipped. Output: {output_dir}")


if __name__ == "__main__":
    main()
