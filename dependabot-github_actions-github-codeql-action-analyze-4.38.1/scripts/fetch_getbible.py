#!/usr/bin/env python3
"""
Fetch WEB, ASV, YLT, or Darby from the getbible/v2 API and convert to
the app's per-book JSON schema:

  {
    "Info": { "Copyright": "...", "Language": "English", "Translation": "XXX", "Timestamp": "..." },
    "BookName": { "1": { "1": "verse", ... }, ... }
  }

Output: translations/<ID>/<ID>_books/<BookName>.json

Usage:
  python scripts/fetch_getbible.py --translation web
  python scripts/fetch_getbible.py --translation asv
  python scripts/fetch_getbible.py --translation ylt
  python scripts/fetch_getbible.py --translation darby
"""

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

TRANSLATIONS = {
    "web": {
        "id": "WEB",
        "label": "WEB — World English Bible",
        "copyright": "The World English Bible is in the public domain.",
        "getbible_abbr": "web",
    },
    "asv": {
        "id": "ASV",
        "label": "ASV — American Standard Version",
        "copyright": "American Standard Version (1901). Public domain.",
        "getbible_abbr": "asv",
    },
    "ylt": {
        "id": "YLT",
        "label": "YLT — Young's Literal Translation",
        "copyright": "Young's Literal Translation (1898). Public domain.",
        "getbible_abbr": "ylt",
    },
    "darby": {
        "id": "DARBY",
        "label": "DARBY — Darby Translation",
        "copyright": "Darby Translation (1890). Public domain.",
        "getbible_abbr": "darby",
    },
}

# getbible v2 book number -> canonical name used by this app (matches BSB_books filenames)
BOOK_NAMES = [
    None,  # index 0 unused
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
    "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
    "Nehemiah", "Esther", "Job", "Psalm", "Proverbs",
    "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
    "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
    "Zephaniah", "Haggai", "Zechariah", "Malachi",
    "Matthew", "Mark", "Luke", "John", "Acts",
    "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
    "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
    "1 Timothy", "2 Timothy", "Titus", "Philemon",
    "Hebrews", "James", "1 Peter", "2 Peter",
    "1 John", "2 John", "3 John", "Jude", "Revelation",
]

BASE_URL = "https://api.getbible.net/v2/{abbr}/{book}/{chapter}.json"


def fetch_book(abbr: str, book_number: int, book_name: str, translation_id: str, copyright_text: str) -> dict:
    chapters = {}
    chapter = 1
    while True:
        url = BASE_URL.format(abbr=abbr, book=book_number, chapter=chapter)
        resp = requests.get(url, timeout=30)
        if resp.status_code == 404:
            break
        resp.raise_for_status()
        data = resp.json()
        verses = {}
        for verse_obj in data.get("verses", []):
            verse_num = str(verse_obj["verse"])
            verses[verse_num] = verse_obj["text"].strip()
        if not verses:
            break
        chapters[str(chapter)] = verses
        chapter += 1
        time.sleep(0.1)  # be polite
    return {
        "Info": {
            "Copyright": copyright_text,
            "Language": "English",
            "Translation": translation_id,
            "Timestamp": datetime.now(timezone.utc).isoformat(),
        },
        book_name: chapters,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--translation", required=True, choices=TRANSLATIONS.keys())
    args = parser.parse_args()

    t = TRANSLATIONS[args.translation]
    abbr = t["getbible_abbr"]
    tid = t["id"]
    copyright_text = t["copyright"]

    out_dir = Path(f"translations/{tid}/{tid}_books")
    out_dir.mkdir(parents=True, exist_ok=True)

    for book_number, book_name in enumerate(BOOK_NAMES):
        if book_name is None:
            continue
        print(f"  Fetching {tid} {book_name}...")
        book_data = fetch_book(abbr, book_number, book_name, tid, copyright_text)
        out_path = out_dir / f"{book_name}.json"
        out_path.write_text(json.dumps(book_data, indent=2, ensure_ascii=False))
        print(f"    -> {out_path}")

    print(f"Done. {tid} written to {out_dir}")


if __name__ == "__main__":
    main()
