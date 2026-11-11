#!/usr/bin/env python3
"""Convert a flat verse-record JSON array into per-book Lege Lux files."""

import argparse
import json
import re
import sys
from pathlib import Path

from split_translations import BOOK_ORDER, split_translation

TRANSLATION_ID_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9_-]*$")
REQUIRED_FIELDS = ("book", "chapter", "verse", "text")


def _positive_int(value, field: str, record_number: int) -> int:
    if isinstance(value, bool):
        raise ValueError(f"record {record_number}: {field} must be a positive integer")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"record {record_number}: {field} must be a positive integer"
        ) from exc
    if parsed <= 0 or str(value).strip() != str(parsed):
        raise ValueError(f"record {record_number}: {field} must be a positive integer")
    return parsed


def convert_records(
    records: list,
    expected_version: str | None = None,
    expected_language: str | None = None,
) -> tuple[dict, int]:
    if not isinstance(records, list):
        raise ValueError("source JSON must be an array of verse records")
    if not records:
        raise ValueError("source JSON contains no verse records")

    bible: dict[str, dict[str, dict[str, str]]] = {}
    seen_refs: set[tuple[int, int, int]] = set()
    versions: set[str] = set()
    languages: set[str] = set()

    for record_number, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            raise ValueError(f"record {record_number}: expected an object")

        missing = [field for field in REQUIRED_FIELDS if field not in record]
        if missing:
            raise ValueError(
                f"record {record_number}: missing required field(s): {', '.join(missing)}"
            )

        book_number = _positive_int(record["book"], "book", record_number)
        chapter = _positive_int(record["chapter"], "chapter", record_number)
        verse = _positive_int(record["verse"], "verse", record_number)

        if book_number > len(BOOK_ORDER):
            raise ValueError(
                f"record {record_number}: book must be between 1 and {len(BOOK_ORDER)}"
            )

        text = record["text"]
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"record {record_number}: text must be a non-empty string")
        text = text.strip()

        ref = (book_number, chapter, verse)
        if ref in seen_refs:
            book_name = BOOK_ORDER[book_number - 1]
            raise ValueError(
                f"record {record_number}: duplicate reference {book_name} {chapter}:{verse}"
            )
        seen_refs.add(ref)

        version = record.get("version")
        if expected_version and version is None:
            raise ValueError(f"record {record_number}: missing required field: version")
        if version is not None:
            if not isinstance(version, str) or not version.strip():
                raise ValueError(
                    f"record {record_number}: version must be a non-empty string"
                )
            versions.add(version.strip())

        language = record.get("language")
        if expected_language and language is None:
            raise ValueError(f"record {record_number}: missing required field: language")
        if language is not None:
            if not isinstance(language, str) or not language.strip():
                raise ValueError(
                    f"record {record_number}: language must be a non-empty string"
                )
            languages.add(language.strip())

        book_name = BOOK_ORDER[book_number - 1]
        chapter_map = bible.setdefault(book_name, {}).setdefault(str(chapter), {})
        chapter_map[str(verse)] = text

    if len(versions) > 1:
        raise ValueError(f"source contains multiple version values: {sorted(versions)}")
    if expected_version and versions != {expected_version}:
        found = next(iter(versions), "(missing)")
        raise ValueError(f'expected version "{expected_version}", found "{found}"')

    if len(languages) > 1:
        raise ValueError(f"source contains multiple language values: {sorted(languages)}")
    if expected_language and languages != {expected_language}:
        found = next(iter(languages), "(missing)")
        raise ValueError(f'expected language "{expected_language}", found "{found}"')

    missing_books = [book for book in BOOK_ORDER if book not in bible]
    if missing_books:
        raise ValueError(
            f"source is missing {len(missing_books)} book(s): "
            f"{', '.join(missing_books)}"
        )

    ordered_bible = {}
    for book in BOOK_ORDER:
        ordered_bible[book] = {
            chapter: {
                verse: bible[book][chapter][verse]
                for verse in sorted(bible[book][chapter], key=int)
            }
            for chapter in sorted(bible[book], key=int)
        }

    return ordered_bible, len(seen_refs)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert flat book/chapter/verse/text records to Lege Lux JSON."
    )
    parser.add_argument("source", type=Path, help="Flat verse-record JSON file")
    parser.add_argument("translation", help="Uppercase translation ID, such as NASB")
    parser.add_argument(
        "--keep-monolith",
        action="store_true",
        help="Keep the intermediate {ID}_bible.json file after splitting",
    )
    parser.add_argument("--expected-version", help="Required source version value")
    parser.add_argument("--expected-language", help="Required source language value")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    translation = args.translation.strip().upper()
    if not TRANSLATION_ID_PATTERN.fullmatch(translation):
        print(
            "ERROR: translation ID must contain only uppercase letters, numbers, "
            "underscores, or hyphens",
            file=sys.stderr,
        )
        raise SystemExit(1)

    translations_dir = Path("translations")
    output = translations_dir / translation / f"{translation}_bible.json"

    try:
        with args.source.open(encoding="utf-8") as source_file:
            records = json.load(source_file)
        bible, verse_count = convert_records(
            records,
            expected_version=args.expected_version,
            expected_language=args.expected_language,
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as output_file:
        json.dump(bible, output_file, ensure_ascii=False, separators=(",", ":"))

    print(
        f"Normalized {verse_count:,} verses across {len(bible)} books to {output}",
        flush=True,
    )

    if not split_translation(translation, translations_dir):
        print(f"ERROR: failed to split {translation}", file=sys.stderr)
        raise SystemExit(1)

    if not args.keep_monolith:
        output.unlink()

    print(f"Converted {translation} into per-book Lege Lux JSON files", flush=True)


if __name__ == "__main__":
    main()
