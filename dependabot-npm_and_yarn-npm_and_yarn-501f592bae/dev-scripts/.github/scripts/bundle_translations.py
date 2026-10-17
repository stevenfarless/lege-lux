#!/usr/bin/env python3
"""
Bundles per-book JSON files for one or all translations into a single
bundle file per translation: bundles/{ABBR}_bundle.json

Bundle schema:
{
  "meta": { ...info fields... },
  "books": { "BookName": { "1": { "1": "...", ... }, ... }, ... },
  "index": {
    "v": ["BookName", ...],         // ordered list of unique book names
    "w": { "word": [int, ...], ... } // each int = packed verse ref:
                                     //   bookIdx<<20 | (chapter-1)<<10 | (verse-1)
                                     //   max 4096 books, 1024 chapters, 1024 verses
  }
}

Decoding a packed int in JS:
  const bookIdx = ref >>> 20;
  const chapter = ((ref >>> 10) & 0x3FF) + 1;
  const verse   = (ref & 0x3FF) + 1;
  const book    = bundle.index.v[bookIdx];

All book JSON files in translations/{ABBR}/ are included.
Files named meta.json, info.json, or matching *_search_index.json are skipped.
The book order in the bundle follows meta.json; any extra files
(deuterocanon, etc.) are appended after in alphabetical order.
"""

import json
import re
import sys
from pathlib import Path

TRANSLATIONS_DIR = Path("translations")
BUNDLES_DIR = Path("bundles")

SKIP_NAMES = {"meta.json", "info.json"}
SKIP_PATTERN = re.compile(r"_search_index\.json$", re.IGNORECASE)
RANGE_PATTERN = re.compile(r"^\d+-\d+$")  # e.g. "15-16"


def is_book_file(filename: str) -> bool:
    if filename in SKIP_NAMES:
        return False
    if SKIP_PATTERN.search(filename):
        return False
    if not filename.endswith(".json"):
        return False
    return True


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z']+", text.lower())


def pack_ref(book_idx: int, chapter: int, verse: int) -> int:
    return (book_idx << 20) | ((chapter - 1) << 10) | (verse - 1)


def build_bundle(abbr: str) -> dict:
    trans_dir = TRANSLATIONS_DIR / abbr

    meta_path = trans_dir / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"meta.json not found for {abbr}")

    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)

    info = meta.get("info", {})
    canonical_order = [b["name"] for b in meta.get("books", [])]
    canonical_set = set(canonical_order)

    all_book_files = {
        p.stem: p
        for p in trans_dir.iterdir()
        if p.is_file() and is_book_file(p.name)
    }

    extra_books = sorted(
        name for name in all_book_files if name not in canonical_set
    )
    ordered_books = [
        name for name in canonical_order if name in all_book_files
    ] + extra_books

    books: dict = {}
    book_name_list: list[str] = []
    inverted: dict[str, list[int]] = {}

    for book_name in ordered_books:
        path = all_book_files[book_name]
        with open(path, encoding="utf-8") as f:
            chapter_data: dict = json.load(f)

        books[book_name] = chapter_data

        book_idx = len(book_name_list)
        book_name_list.append(book_name)

        for ch_str, verses in chapter_data.items():
            ch = int(ch_str)
            for v_str, text in verses.items():
                if RANGE_PATTERN.match(v_str):
                    continue  # skip merged verse ranges like "15-16"
                v = int(v_str)
                packed = pack_ref(book_idx, ch, v)
                for word in tokenize(text):
                    if word not in inverted:
                        inverted[word] = []
                    inverted[word].append(packed)

    return {
        "meta": info,
        "books": books,
        "index": {
            "v": book_name_list,
            "w": inverted,
        },
    }


def bundle_translation(abbr: str) -> None:
    print(f"Bundling {abbr}...")
    bundle = build_bundle(abbr)
    BUNDLES_DIR.mkdir(exist_ok=True)
    out_path = BUNDLES_DIR / f"{abbr}_bundle.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = out_path.stat().st_size / 1024
    book_count = len(bundle["books"])
    word_count = len(bundle["index"]["w"])
    print(
        f"  {out_path}  {size_kb:.0f} KB  "
        f"{book_count} books  {word_count} index words"
    )


def main() -> None:
    target = sys.argv[1].strip() if len(sys.argv) > 1 else ""

    if target:
        abbrs = [target.upper()]
    else:
        abbrs = sorted(
            d.name
            for d in TRANSLATIONS_DIR.iterdir()
            if d.is_dir() and (d / "meta.json").exists()
        )

    for abbr in abbrs:
        try:
            bundle_translation(abbr)
        except Exception as e:
            print(f"ERROR: {abbr}: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
