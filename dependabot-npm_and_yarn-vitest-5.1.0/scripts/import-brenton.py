#!/usr/bin/env python3
"""Import the public-domain Brenton Septuagint from eBible.org into Lege Lux."""

from __future__ import annotations

import json
import re
import shutil
import tempfile
import urllib.request
import zipfile
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "translations" / "BST"
STRUCTURE_OUT = OUT / "BST_structure"
SOURCE_URL = "https://ebible.org/Scriptures/eng-Brenton_usfm.zip"

IGNORED_USFM_IDS = {'FRT', 'INT', 'XXA', 'OTH', 'XXC', 'BAK', 'XXB'}

BOOK_MAP = {
    "GEN": ("Genesis", "Old Testament"),
    "EXO": ("Exodus", "Old Testament"),
    "LEV": ("Leviticus", "Old Testament"),
    "NUM": ("Numbers", "Old Testament"),
    "DEU": ("Deuteronomy", "Old Testament"),
    "JOS": ("Joshua", "Old Testament"),
    "JDG": ("Judges", "Old Testament"),
    "RUT": ("Ruth", "Old Testament"),
    "1SA": ("1 Samuel", "Old Testament"),
    "2SA": ("2 Samuel", "Old Testament"),
    "1KI": ("1 Kings", "Old Testament"),
    "2KI": ("2 Kings", "Old Testament"),
    "1CH": ("1 Chronicles", "Old Testament"),
    "2CH": ("2 Chronicles", "Old Testament"),
    "EZR": ("Ezra", "Old Testament"),
    "NEH": ("Nehemiah", "Old Testament"),
    "EST": ("Esther", "Old Testament"),
    "ESG": ("Esther", "Old Testament"),
    "JOB": ("Job", "Old Testament"),
    "PSA": ("Psalm", "Old Testament"),
    "PRO": ("Proverbs", "Old Testament"),
    "ECC": ("Ecclesiastes", "Old Testament"),
    "SNG": ("Song of Solomon", "Old Testament"),
    "ISA": ("Isaiah", "Old Testament"),
    "JER": ("Jeremiah", "Old Testament"),
    "LAM": ("Lamentations", "Old Testament"),
    "EZK": ("Ezekiel", "Old Testament"),
    "DAN": ("Daniel", "Old Testament"),
    "DAG": ("Daniel", "Old Testament"),
    "HOS": ("Hosea", "Old Testament"),
    "JOL": ("Joel", "Old Testament"),
    "AMO": ("Amos", "Old Testament"),
    "OBA": ("Obadiah", "Old Testament"),
    "JON": ("Jonah", "Old Testament"),
    "MIC": ("Micah", "Old Testament"),
    "NAM": ("Nahum", "Old Testament"),
    "HAB": ("Habakkuk", "Old Testament"),
    "ZEP": ("Zephaniah", "Old Testament"),
    "HAG": ("Haggai", "Old Testament"),
    "ZEC": ("Zechariah", "Old Testament"),
    "MAL": ("Malachi", "Old Testament"),
    "1ES": ("1 Esdras", "Deuterocanon"),
    "TOB": ("Tobit", "Deuterocanon"),
    "JDT": ("Judith", "Deuterocanon"),
    "WIS": ("Wisdom of Solomon", "Deuterocanon"),
    "SIR": ("Sirach", "Deuterocanon"),
    "BAR": ("Baruch", "Deuterocanon"),
    "LJE": ("Letter of Jeremiah", "Deuterocanon"),
    "S3Y": ("Prayer of Azariah", "Deuterocanon"),
    "SUS": ("Susanna", "Deuterocanon"),
    "BEL": ("Bel and the Dragon", "Deuterocanon"),
    "1MA": ("1 Maccabees", "Deuterocanon"),
    "2MA": ("2 Maccabees", "Deuterocanon"),
    "3MA": ("3 Maccabees", "Deuterocanon"),
    "4MA": ("4 Maccabees", "Deuterocanon"),
    "MAN": ("Prayer of Manasseh", "Deuterocanon"),
    "PS2": ("Psalm 151", "Deuterocanon"),
}

ORDER = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
    "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
    "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah",
    "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
    "Zechariah", "Malachi",
    "1 Esdras", "Tobit", "Judith", "Wisdom of Solomon", "Sirach", "Baruch",
    "Letter of Jeremiah", "Prayer of Azariah", "Susanna", "Bel and the Dragon",
    "1 Maccabees", "2 Maccabees", "Prayer of Manasseh", "3 Maccabees",
    "4 Maccabees", "Psalm 151",
]
ORDER_INDEX = {name: index for index, name in enumerate(ORDER)}

NOTE_RE = re.compile(r"\\(?:f|x)\s.*?\\(?:f|x)\*", re.DOTALL)
FIG_RE = re.compile(r"\\fig\s.*?\\fig\*", re.DOTALL)
INLINE_MARKER_RE = re.compile(r"\\[A-Za-z0-9]+\*?")
VERSE_RE = re.compile(r"^\\v\s+([0-9]+[a-z]?(?:-[0-9]+[a-z]?)?)\s*(.*)$", re.I)
CHAPTER_RE = re.compile(r"^\\c\s+(\d+)")
ID_RE = re.compile(r"^\\id\s+([A-Za-z0-9]+)", re.M)
HEADING_RE = re.compile(r"^\\s\d*\s+(.+)$", re.I)
PARA_RE = re.compile(r"^\\(p|m|q\d?|qr|qc|b|mi|pi\d?|li\d?|ph\d?|pc|cls|pmo|pm|pmc|nb)\s*(.*)$", re.I)
STRUCTURAL_RE = re.compile(r"^\\(?:id|ide|h|toc\d?|mt\d?|mte\d?|ms\d?|r|d|sp|cl|cp|rem|sts)\b", re.I)


def clean_text(value: str) -> str:
    value = INLINE_MARKER_RE.sub("", value)
    value = value.replace("~", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def event_verse(value: str):
    return int(value) if value.isdigit() else value


def parse_usfm(path: Path):
    content = path.read_text(encoding="utf-8-sig")
    content = NOTE_RE.sub("", content)
    content = FIG_RE.sub("", content)
    id_match = ID_RE.search(content)
    if not id_match:
        raise ValueError(f"{path.name}: missing USFM id")
    code = id_match.group(1).upper()

    chapters: OrderedDict[str, OrderedDict[str, str]] = OrderedDict()
    events: list[dict] = []
    chapter = None
    verse = None
    buffer: list[str] = []
    pending_events: list[dict] = []

    def flush() -> None:
        nonlocal verse, buffer
        if chapter is not None and verse is not None:
            text = clean_text(" ".join(buffer))
            if text or verse not in chapters.setdefault(chapter, OrderedDict()):
                chapters.setdefault(chapter, OrderedDict())[verse] = text
        verse = None
        buffer = []

    def queue_break() -> None:
        if not any(event.get("type") == "para_break" for event in pending_events):
            pending_events.append({"type": "para_break"})

    def attach_pending(target_verse: str) -> None:
        if chapter is None or not pending_events:
            return
        for pending in pending_events:
            event = {"ch": int(chapter), "v": event_verse(target_verse), **pending}
            events.append(event)
        pending_events.clear()

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        chapter_match = CHAPTER_RE.match(line)
        if chapter_match:
            flush()
            chapter = chapter_match.group(1)
            chapters.setdefault(chapter, OrderedDict())
            pending_events.clear()
            continue

        heading_match = HEADING_RE.match(line)
        if heading_match:
            heading = clean_text(heading_match.group(1))
            if heading:
                pending_events.append({"type": "heading", "text": heading})
            continue

        verse_match = VERSE_RE.match(line)
        if verse_match:
            flush()
            if chapter is None:
                raise ValueError(f"{path.name}: verse before chapter")
            verse = verse_match.group(1)
            if verse in chapters[chapter]:
                raise ValueError(f"{path.name}: duplicate verse {chapter}:{verse}")
            attach_pending(verse)
            if verse_match.group(2):
                buffer.append(verse_match.group(2))
            continue

        para_match = PARA_RE.match(line)
        if para_match:
            trailing = para_match.group(2)
            if verse is not None and trailing:
                buffer.append(trailing)
            elif not trailing:
                queue_break()
            continue

        if verse is None or STRUCTURAL_RE.match(line):
            continue

        if not line.startswith("\\"):
            buffer.append(line)
        else:
            buffer.append(line)

    flush()
    return code, chapters, events


def normalize_term(word: str) -> str:
    w = word.lower()
    if len(w) > 3:
        w = re.sub(r"[’']s$", "", w)
    if len(w) < 3:
        return w
    if w.endswith("est") and len(w) > 5:
        return normalize_term(w[:-2])
    if w.endswith("eth") and len(w) > 4:
        return normalize_term(w[:-3])
    if w.endswith("ing") and len(w) > 5:
        return normalize_term(w[:-3])
    if w.endswith("ed") and len(w) > 4 and w[-3] not in "aeiou":
        return w[:-2]
    if w.endswith("es") and len(w) > 4 and w[-3] not in "aeiou":
        return w[:-2]
    if w.endswith("e") and len(w) >= 4 and w[-2] not in "aeiou":
        return w[:-1]
    if w.endswith("s") and len(w) > 4 and w[-2] not in "aeiou":
        return w[:-1]
    return w


def build_search_index(books) -> dict:
    refs: list[str] = []
    texts: list[str] = []
    postings: dict[str, list[int]] = {}
    token_re = re.compile(r"[A-Za-z0-9']+")

    for book_name, _, chapters, _ in books:
        for chapter, verses in chapters.items():
            for verse, text in verses.items():
                verse_id = len(refs)
                lower = str(text).lower()
                refs.append(f"{book_name} {chapter}:{verse}")
                texts.append(lower)
                terms = set()
                for raw in token_re.findall(lower):
                    terms.add(raw)
                    terms.add(normalize_term(raw))
                for term in terms:
                    if term:
                        postings.setdefault(term, []).append(verse_id)

    return {"version": 2, "refs": refs, "texts": texts, "postings": postings}


def segment(native_start, native_end, baseline_chapter, baseline_start, baseline_end, offset=0):
    return {
        "nativeVerseStart": native_start,
        "nativeVerseEnd": native_end,
        "baselineChapter": baseline_chapter,
        "baselineVerseStart": baseline_start,
        "baselineVerseEnd": baseline_end,
        "verseOffsetToBaseline": offset,
    }


def build_psalm_versification() -> dict:
    chapters = {}
    chapters["9"] = {
        "label": "MT 9–10",
        "baselineChapters": [9, 10],
        "segments": [
            segment(1, 1, 9, 1, 1, 0),
            segment(2, 21, 9, 1, 20, -1),
            segment(22, 39, 10, 1, 18, -21),
        ],
    }
    for chapter in range(10, 113):
        chapters[str(chapter)] = {
            "label": f"MT {chapter + 1}",
            "baselineChapters": [chapter + 1],
        }
    chapters["113"] = {
        "label": "MT 114–115",
        "baselineChapters": [114, 115],
        "segments": [
            segment(1, 8, 114, 1, 8, 0),
            segment(9, 26, 115, 1, 18, -8),
        ],
    }
    chapters["114"] = {
        "label": "MT 116:1–9",
        "baselineChapters": [116],
        "reversePriority": 0,
        "segments": [segment(1, 9, 116, 1, 9, 0)],
    }
    chapters["115"] = {
        "label": "MT 116:10–19",
        "baselineChapters": [116],
        "reversePriority": 1,
        "segments": [segment(1, 10, 116, 10, 19, 9)],
    }
    for chapter in range(116, 146):
        chapters[str(chapter)] = {
            "label": f"MT {chapter + 1}",
            "baselineChapters": [chapter + 1],
        }
    chapters["146"] = {
        "label": "MT 147:1–11",
        "baselineChapters": [147],
        "reversePriority": 0,
        "segments": [segment(1, 11, 147, 1, 11, 0)],
    }
    chapters["147"] = {
        "label": "MT 147:12–20",
        "baselineChapters": [147],
        "reversePriority": 1,
        "segments": [segment(1, 9, 147, 12, 20, 11)],
    }
    chapters["151"] = {
        "label": "no MT equivalent",
        "baselineChapters": [],
    }
    return {"chapters": chapters}


def build_jeremiah_versification() -> dict:
    # Brenton's own chapter table gives these Hebrew/English correspondences.
    baseline = {
        25: [25, 49], 26: [46], 27: [50], 28: [51], 29: [47, 49],
        30: [49], 31: [48], 32: [25], 33: [26], 34: [27], 35: [28],
        36: [29], 37: [30], 38: [31], 39: [32], 40: [33], 41: [34],
        42: [35], 43: [36], 44: [37], 45: [38], 46: [39], 47: [40],
        48: [41], 49: [42], 50: [43], 51: [44, 45], 52: [52],
    }
    chapters = {}
    for native, equivalents in baseline.items():
        label = "Hebrew/English " + " & ".join(str(value) for value in equivalents)
        chapters[str(native)] = {
            "label": label,
            "baselineChapters": equivalents,
        }
    return {"chapters": chapters}


def build_versification() -> dict:
    return {
        "scheme": "brenton-lxx",
        "baselineScheme": "protestant",
        "books": {
            "Psalm": build_psalm_versification(),
            "Joel": {
                "chapters": {
                    "2": {
                        "label": "Protestant 2:1–27",
                        "baselineChapters": [2],
                        "reversePriority": 0,
                        "segments": [segment(1, 27, 2, 1, 27, 0)],
                    },
                    "3": {
                        "label": "Protestant 2:28–32",
                        "baselineChapters": [2],
                        "reversePriority": 1,
                        "segments": [segment(1, 5, 2, 28, 32, 27)],
                    },
                    "4": {
                        "label": "Protestant 3",
                        "baselineChapters": [3],
                    },
                }
            },
            "Malachi": {
                "chapters": {
                    "3": {
                        "label": "Protestant 3–4",
                        "baselineChapters": [3, 4],
                        "segments": [
                            segment(1, 18, 3, 1, 18, 0),
                            segment(19, 24, 4, 1, 6, -18),
                        ],
                    }
                }
            },
            "Jeremiah": build_jeremiah_versification(),
        },
    }


def metadata_entry() -> dict:
    return {
        "id": "BST",
        "label": "Brenton Septuagint Translation",
        "abbreviation": "BST",
        "language": "en",
        "textDirection": "ltr",
        "year": 1851,
        "canon": "septuagint",
        "philosophy": "formal",
        "copyright": "Brenton Septuagint Translation (1851). Public domain.",
    }


def write_json(path: Path, data: object, *, indent: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=indent) + ("\n" if indent else ""),
        encoding="utf-8",
    )


def register_translation() -> None:
    index_path = ROOT / "translations" / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    entries = [entry for entry in index["translations"] if entry.get("id") != "BST"]
    entries.append(metadata_entry())
    entries.sort(key=lambda entry: entry["id"])
    index["translations"] = entries
    write_json(index_path, index, indent=2)


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="brenton-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        zip_path = temp_dir / "brenton.zip"
        request = urllib.request.Request(
            SOURCE_URL,
            headers={"User-Agent": "Lege-Lux-Brenton-Importer/2.0"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            zip_path.write_bytes(response.read())

        source_dir = temp_dir / "source"
        source_dir.mkdir()
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(source_dir)

        parsed = []
        seen_destinations: set[str] = set()
        unknown_codes: list[str] = []

        paths = sorted(source_dir.rglob("*.usfm")) + sorted(source_dir.rglob("*.USFM"))
        for path in paths:
            code, chapters, events = parse_usfm(path)
            if code in IGNORED_USFM_IDS:
                continue
            mapped = BOOK_MAP.get(code)
            if not mapped:
                unknown_codes.append(code)
                continue

            name, testament = mapped
            if name in seen_destinations:
                raise RuntimeError(f"Duplicate destination book {name} from source id {code}")
            seen_destinations.add(name)
            parsed.append((name, testament, chapters, events))

        if unknown_codes:
            raise RuntimeError("Unmapped Brenton USFM ids: " + ", ".join(sorted(set(unknown_codes))))
        if len(parsed) != 53:
            raise RuntimeError(f"Expected 53 Brenton books; parsed {len(parsed)}")

        parsed.sort(key=lambda item: ORDER_INDEX.get(item[0], 10_000))

        if OUT.exists():
            shutil.rmtree(OUT)
        STRUCTURE_OUT.mkdir(parents=True)

        book_meta = []
        verse_count = 0
        structure_count = 0
        for name, testament, chapters, events in parsed:
            write_json(OUT / f"{name}.json", chapters)
            write_json(STRUCTURE_OUT / f"{name}.json", events, indent=2)
            chapter_numbers = [int(ch) for ch in chapters if str(ch).isdigit()]
            book_meta.append({
                "name": name,
                "testament": testament,
                "chapters": max(chapter_numbers) if chapter_numbers else len(chapters),
            })
            verse_count += sum(len(verses) for verses in chapters.values())
            structure_count += len(events)

        info = metadata_entry() | {
            "manuscriptTradition": ["Septuagint"],
            "textualBasis": (
                "Sir Lancelot C. L. Brenton's English translation of the Greek Septuagint. "
                "Imported from the eBible.org eng-Brenton USFM edition with native LXX "
                "chapter/verse numbering and lettered LXX verses preserved. The eBible EZR "
                "file repeats Nehemiah as chapters 11–23 while also supplying a standalone "
                "NEH file; Lege Lux retains Ezra 1–10 and the standalone Nehemiah copy to "
                "avoid duplicating the same text in the book picker."
            ),
            "source": SOURCE_URL,
        }
        meta = {
            "translation": "BST",
            "books": book_meta,
            "versification": build_versification(),
        }
        write_json(OUT / "info.json", info, indent=2)
        write_json(OUT / "meta.json", meta, indent=2)
        write_json(OUT / "BST_search_index.json", build_search_index(parsed))
        register_translation()

        print(
            f"Imported BST: {len(parsed)} books, {verse_count} verses, "
            f"{structure_count} structure events"
        )


if __name__ == "__main__":
    main()
