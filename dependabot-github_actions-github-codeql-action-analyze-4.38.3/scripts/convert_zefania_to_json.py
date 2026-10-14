#!/usr/bin/env python3
"""
Convert a Zefania XML Bible file to the app's per-book JSON schema.

Used for the NET Bible source from seven1m/open-bibles:
  https://github.com/seven1m/open-bibles

  The NET file is: net.xml  (Zefania format)

Usage:
  # Clone seven1m/open-bibles first, then:
  python scripts/convert_zefania_to_json.py \
      --input path/to/open-bibles/net.xml \
      --translation NET \
      --copyright "Scripture quoted by permission. Quotations designated (NET) are from the NET Bible. Copyright 1996-2016 by Biblical Studies Press, L.L.C. http://netbible.com. All rights reserved." \
      --output-dir translations/NET/NET_books
"""

import argparse
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

# Zefania OSIS/Zefania book numbers -> canonical app book name
BOOK_NUMBER_NAMES = {
    1: "Genesis", 2: "Exodus", 3: "Leviticus", 4: "Numbers", 5: "Deuteronomy",
    6: "Joshua", 7: "Judges", 8: "Ruth", 9: "1 Samuel", 10: "2 Samuel",
    11: "1 Kings", 12: "2 Kings", 13: "1 Chronicles", 14: "2 Chronicles",
    15: "Ezra", 16: "Nehemiah", 17: "Esther", 18: "Job", 19: "Psalm",
    20: "Proverbs", 21: "Ecclesiastes", 22: "Song of Solomon", 23: "Isaiah",
    24: "Jeremiah", 25: "Lamentations", 26: "Ezekiel", 27: "Daniel",
    28: "Hosea", 29: "Joel", 30: "Amos", 31: "Obadiah", 32: "Jonah",
    33: "Micah", 34: "Nahum", 35: "Habakkuk", 36: "Zephaniah",
    37: "Haggai", 38: "Zechariah", 39: "Malachi",
    40: "Matthew", 41: "Mark", 42: "Luke", 43: "John", 44: "Acts",
    45: "Romans", 46: "1 Corinthians", 47: "2 Corinthians", 48: "Galatians",
    49: "Ephesians", 50: "Philippians", 51: "Colossians",
    52: "1 Thessalonians", 53: "2 Thessalonians", 54: "1 Timothy",
    55: "2 Timothy", 56: "Titus", 57: "Philemon", 58: "Hebrews",
    59: "James", 60: "1 Peter", 61: "2 Peter", 62: "1 John",
    63: "2 John", 64: "3 John", 65: "Jude", 66: "Revelation",
}

# Also handle string bnumber attributes (some Zefania files use strings)
BOOK_NAME_LOOKUP = {
    "Gen": 1, "Exo": 2, "Lev": 3, "Num": 4, "Deu": 5,
    "Jos": 6, "Jdg": 7, "Rut": 8, "1Sa": 9, "2Sa": 10,
    "1Ki": 11, "2Ki": 12, "1Ch": 13, "2Ch": 14, "Ezr": 15,
    "Neh": 16, "Est": 17, "Job": 18, "Psa": 19, "Pro": 20,
    "Ecc": 21, "Sol": 22, "Isa": 23, "Jer": 24, "Lam": 25,
    "Eze": 26, "Dan": 27, "Hos": 28, "Joe": 29, "Amo": 30,
    "Oba": 31, "Jon": 32, "Mic": 33, "Nah": 34, "Hab": 35,
    "Zep": 36, "Hag": 37, "Zac": 38, "Mal": 39,
    "Mat": 40, "Mar": 41, "Luk": 42, "Joh": 43, "Act": 44,
    "Rom": 45, "1Co": 46, "2Co": 47, "Gal": 48, "Eph": 49,
    "Phi": 50, "Col": 51, "1Th": 52, "2Th": 53, "1Ti": 54,
    "2Ti": 55, "Tit": 56, "Phm": 57, "Heb": 58, "Jas": 59,
    "1Pe": 60, "2Pe": 61, "1Jo": 62, "2Jo": 63, "3Jo": 64,
    "Jud": 65, "Rev": 66,
}


def get_text(elem) -> str:
    """Recursively get all text from an element, stripping tags."""
    parts = []
    if elem.text:
        parts.append(elem.text.strip())
    for child in elem:
        parts.append(get_text(child))
        if child.tail:
            parts.append(child.tail.strip())
    return ' '.join(p for p in parts if p)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to Zefania XML file")
    parser.add_argument("--translation", required=True)
    parser.add_argument("--copyright", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    tree = ET.parse(args.input)
    root = tree.getroot()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat()

    # Zefania structure: <XMLBIBLE> -> <BIBLEBOOK> -> <CHAPTER> -> <VERS>
    books_written = 0
    for book_elem in root.iter("BIBLEBOOK"):
        bnumber = book_elem.get("bnumber")
        bname = book_elem.get("bname", "")

        book_number = None
        if bnumber and bnumber.isdigit():
            book_number = int(bnumber)
        elif bname[:3] in BOOK_NAME_LOOKUP:
            book_number = BOOK_NAME_LOOKUP[bname[:3]]

        if book_number not in BOOK_NUMBER_NAMES:
            print(f"  Skipping unknown book: bnumber={bnumber!r} bname={bname!r}")
            continue

        book_name = BOOK_NUMBER_NAMES[book_number]
        chapters = {}

        for chapter_elem in book_elem:
            cnumber = chapter_elem.get("cnumber")
            if not cnumber:
                continue
            verses = {}
            for verse_elem in chapter_elem:
                vnumber = verse_elem.get("vnumber")
                if not vnumber:
                    continue
                text = get_text(verse_elem).strip()
                if text:
                    verses[vnumber] = text
            if verses:
                chapters[cnumber] = verses

        if not chapters:
            print(f"  Skipping {book_name} (no content)")
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
        print(f"  {book_name} -> {out_path.name}")
        books_written += 1

    print(f"\nDone. {books_written} books written to {output_dir}")


if __name__ == "__main__":
    main()
