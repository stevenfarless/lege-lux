#!/usr/bin/env python3
"""
build-search-index.py

Builds a flat ref -> normalized-text search index for a given translation
and writes it to Firebase RTDB at /searchIndex/{translation}.

Usage:
    python scripts/build-search-index.py --translation BSB

Requires:
    pip install firebase-admin

Environment / file:
    /tmp/service_account.json  — Firebase service account key JSON
"""

import argparse
import json
import sys
import firebase_admin
from firebase_admin import credentials, db

FIREBASE_DB_URL = "https://esv-bible-6dffb-default-rtdb.firebaseio.com"
SERVICE_ACCOUNT_PATH = "/tmp/service_account.json"

BOOK_LOAD_ORDER = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
    "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
    "Ezra", "Nehemiah", "Esther", "Job", "Psalm", "Proverbs",
    "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
    "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
    "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke",
    "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians",
    "Galatians", "Ephesians", "Philippians", "Colossians",
    "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
    "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
    "1 John", "2 John", "3 John", "Jude", "Revelation",
]

BOOK_KEY_ALIASES = {
    "Song of Solomon": "Song Of Solomon",
}


def resolve_book_key(book_data: dict, canonical: str) -> str | None:
    if canonical in book_data:
        return canonical
    alias = BOOK_KEY_ALIASES.get(canonical)
    if alias and alias in book_data:
        return alias
    lower_map = {k.lower(): k for k in book_data}
    return lower_map.get(canonical.lower())


def build_index(translation: str) -> dict:
    """Fetch all 66 books from RTDB and return a flat ref->text dict."""
    index = {}
    rtdb_ref = db.reference(f"translations/{translation}")

    for book in BOOK_LOAD_ORDER:
        print(f"  Fetching {book}...", end=" ", flush=True)
        try:
            book_data = rtdb_ref.child(book).get()

            # Try alias if primary key returned nothing
            if book_data is None:
                alias = BOOK_KEY_ALIASES.get(book)
                if alias:
                    book_data = rtdb_ref.child(alias).get()

            # Try case-insensitive fallback via shallow index
            if book_data is None:
                shallow = rtdb_ref.get(shallow=True) or {}
                resolved = resolve_book_key(shallow, book)
                if resolved:
                    book_data = rtdb_ref.child(resolved).get()

            if not book_data or not isinstance(book_data, dict):
                print("SKIP (no data)")
                continue

            verse_count = 0
            for chapter_str, chapter_data in book_data.items():
                if not isinstance(chapter_data, dict):
                    continue
                for verse_str, text in chapter_data.items():
                    if not str(verse_str).isdigit() or int(verse_str) < 1:
                        continue
                    ref = f"{book} {chapter_str}:{verse_str}"
                    index[ref] = str(text or "").lower()
                    verse_count += 1

            print(f"{verse_count} verses")

        except Exception as e:
            print(f"ERROR: {e}")
            continue

    return index


def main():
    parser = argparse.ArgumentParser(description="Build RTDB search index for a translation.")
    parser.add_argument("--translation", required=True, help="Translation abbreviation, e.g. BSB")
    args = parser.parse_args()

    translation = args.translation.strip().upper()
    print(f"Building search index for {translation}...")

    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})

    index = build_index(translation)

    if not index:
        print(f"ERROR: No verses found for {translation}. Aborting.", file=sys.stderr)
        sys.exit(1)

    print(f"\nWriting {len(index)} verse entries to /searchIndex/{translation}...")
    db.reference(f"searchIndex/{translation}").set(index)
    print("Done.")


if __name__ == "__main__":
    main()
