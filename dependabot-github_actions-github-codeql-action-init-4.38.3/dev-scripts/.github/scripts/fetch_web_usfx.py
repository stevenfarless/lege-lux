#!/usr/bin/env python3
"""
fetch_web_usfx.py

Downloads the World English Bible British Edition (WEBBE) USFX zip from
ebible.org, parses every book (canonical + Deuterocanon), writes
translations/WEB/{Book}.json files in the same minified chapter/verse
structure used by all other translations in this repo, then writes
translations/WEB/meta.json and pushes everything to the target branch
via the GitHub API in a single commit.

Usage (local):
    GITHUB_TOKEN=<pat> GITHUB_REPO=stevenfarless/lege-lux TARGET_BRANCH=main-book-update python fetch_web_usfx.py

Usage (GitHub Actions):
    Set GITHUB_TOKEN via secrets; GITHUB_REPO is set automatically.
    Branch is read from TARGET_BRANCH (defaults to main-book-update).

No external dependencies beyond the Python standard library.
"""

import io
import json
import os
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
import base64

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

USFX_URL = "https://ebible.org/Scriptures/eng-webbe_usfx.zip"
TRANSLATION_ID = "WEB"
TARGET_DIR = "translations/WEB"
BRANCH = os.environ.get("TARGET_BRANCH", "main-book-update")
REPO = os.environ.get("GITHUB_REPO", "stevenfarless/lege-lux")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
API_BASE = "https://api.github.com"

# USFX book id → canonical display name used as the filename (no .json)
BOOK_NAMES = {
    # Old Testament
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
    # New Testament
    "MAT": "Matthew", "MRK": "Mark", "LUK": "Luke", "JHN": "John",
    "ACT": "Acts", "ROM": "Romans", "1CO": "1 Corinthians",
    "2CO": "2 Corinthians", "GAL": "Galatians", "EPH": "Ephesians",
    "PHP": "Philippians", "COL": "Colossians", "1TH": "1 Thessalonians",
    "2TH": "2 Thessalonians", "1TI": "1 Timothy", "2TI": "2 Timothy",
    "TIT": "Titus", "PHM": "Philemon", "HEB": "Hebrews", "JAS": "James",
    "1PE": "1 Peter", "2PE": "2 Peter", "1JN": "1 John", "2JN": "2 John",
    "3JN": "3 John", "JUD": "Jude", "REV": "Revelation",
    # Deuterocanon / Apocrypha
    "TOB": "Tobit", "JDT": "Judith", "ESG": "Additions to Esther",
    "WIS": "Wisdom of Solomon", "SIR": "Sirach", "BAR": "Baruch",
    "LJE": "Letter of Jeremiah", "S3Y": "Prayer of Azariah",
    "SUS": "Susanna", "BEL": "Bel and the Dragon",
    "1MA": "1 Maccabees", "2MA": "2 Maccabees", "3MA": "3 Maccabees",
    "4MA": "4 Maccabees", "1ES": "1 Esdras", "2ES": "2 Esdras",
    "MAN": "Prayer of Manasseh", "PS2": "Psalm 151",
}

TESTAMENT_MAP = {
    "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI",
    "1CH","2CH","EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER",
    "LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP",
    "HAG","ZEC","MAL",
}
NT_BOOKS = {
    "MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL",
    "1TH","2TH","1TI","TIT","PHM","HEB","JAS","1PE","2PE","1JN","2JN",
    "3JN","JUD","REV",
}

META_INFO = {
    "id": "WEB",
    "label": "World English Bible",
    "abbreviation": "WEB",
    "language": "en",
    "textDirection": "ltr",
    "year": 2000,
    "canon": "deuterocanon",
    "philosophy": "dynamic",
    "manuscriptTradition": ["Majority Text", "NA28", "LXX"],
    "textualBasis": (
        "OT from the Masoretic Text and LXX. NT from the Majority Text "
        "(Byzantine). Deuterocanon from the LXX and related sources. "
        "Based on the American Standard Version (1901), updated to modern English."
    ),
    "copyright": "World English Bible (WEB). Public domain.",
}

# ---------------------------------------------------------------------------
# Step 1: Download and extract USFX
# ---------------------------------------------------------------------------

def download_usfx():
    print(f"Downloading {USFX_URL} ...")
    req = urllib.request.Request(USFX_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    print(f"  Downloaded {len(data):,} bytes")
    zf = zipfile.ZipFile(io.BytesIO(data))
    usfx_names = [n for n in zf.namelist() if n.endswith(".xml") or n.endswith("_usfx.xml") or "usfx" in n.lower()]
    usfx_names.sort(key=lambda x: (0 if "usfx" in x.lower() else 1, len(x)))
    if not usfx_names:
        usfx_names = [n for n in zf.namelist() if n.endswith(".xml")]
    if not usfx_names:
        print("ERROR: No XML file found in zip")
        sys.exit(1)
    chosen = usfx_names[0]
    print(f"  Parsing: {chosen}")
    return zf.read(chosen)

# ---------------------------------------------------------------------------
# Step 2: Parse USFX XML into {book_id: {ch: {v: text}}}
# ---------------------------------------------------------------------------

def parse_usfx(xml_bytes):
    books = {}
    current_book = None
    current_chapter = None
    current_verse = None
    verse_parts = []

    def flush_verse():
        nonlocal verse_parts, current_verse
        if current_book and current_chapter and current_verse:
            text = " ".join("".join(verse_parts).split()).strip()
            if text:
                books.setdefault(current_book, {})
                books[current_book].setdefault(current_chapter, {})
                books[current_book][current_chapter][current_verse] = text
        verse_parts = []

    for event, elem in ET.iterparse(io.BytesIO(xml_bytes), events=("start", "end")):
        local = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

        if event == "start":
            if local == "book":
                flush_verse()
                current_book = elem.get("id", "").upper()
                current_chapter = None
                current_verse = None
                verse_parts = []
            elif local == "c":
                flush_verse()
                current_chapter = elem.get("id")
                current_verse = None
                verse_parts = []
            elif local == "v":
                flush_verse()
                current_verse = elem.get("id")
                verse_parts = []
                if elem.text:
                    verse_parts.append(elem.text)
            elif local == "ve":
                flush_verse()
                current_verse = None
            else:
                if current_verse and local not in (
                    "note","f","x","fig","milestone","optionalLineBreak",
                    "table","tr","th","thr","tc","tcr"
                ):
                    if elem.text:
                        verse_parts.append(elem.text)

        elif event == "end":
            if local not in ("v","ve","c","book") and current_verse:
                if elem.tail:
                    verse_parts.append(elem.tail)

    flush_verse()
    return books

# ---------------------------------------------------------------------------
# Step 3: Build file list for commit
# ---------------------------------------------------------------------------

def build_files(books):
    files = []
    meta_books = []

    for book_id, chapters in books.items():
        if book_id not in BOOK_NAMES:
            continue
        book_name = BOOK_NAMES[book_id]
        chapter_count = len(chapters)

        out = {}
        for ch, verses in sorted(chapters.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 0):
            out[str(ch)] = {str(v): t for v, t in sorted(verses.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 0)}

        content = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        files.append({
            "path": f"{TARGET_DIR}/{book_name}.json",
            "content": content,
        })

        if book_id in TESTAMENT_MAP:
            testament = "Old Testament"
        elif book_id in NT_BOOKS:
            testament = "New Testament"
        else:
            testament = "Deuterocanon"

        meta_books.append({
            "name": book_name,
            "testament": testament,
            "chapters": chapter_count,
        })

    order = ["Old Testament", "New Testament", "Deuterocanon"]
    meta_books.sort(key=lambda b: (
        order.index(b["testament"]) if b["testament"] in order else 3,
        list(BOOK_NAMES.values()).index(b["name"]) if b["name"] in BOOK_NAMES.values() else 999
    ))
    meta = {"info": META_INFO, "books": meta_books}
    files.append({
        "path": f"{TARGET_DIR}/meta.json",
        "content": json.dumps(meta, indent=2, ensure_ascii=False),
    })

    return files

# ---------------------------------------------------------------------------
# Step 4: Commit all files via GitHub API (single commit)
# ---------------------------------------------------------------------------

def gh_api(method, path, body=None):
    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"GitHub API error {e.code}: {e.read().decode()}")
        raise

def push_files(files):
    owner, repo = REPO.split("/", 1)

    ref_data = gh_api("GET", f"/repos/{owner}/{repo}/git/ref/heads/{BRANCH}")
    base_sha = ref_data["object"]["sha"]
    print(f"Branch {BRANCH} tip: {base_sha}")

    commit_data = gh_api("GET", f"/repos/{owner}/{repo}/git/commits/{base_sha}")
    base_tree_sha = commit_data["tree"]["sha"]

    tree_entries = []
    for i, f in enumerate(files):
        print(f"  Creating blob {i+1}/{len(files)}: {f['path']}")
        blob = gh_api("POST", f"/repos/{owner}/{repo}/git/blobs", {
            "content": base64.b64encode(f["content"].encode("utf-8")).decode(),
            "encoding": "base64",
        })
        tree_entries.append({
            "path": f["path"],
            "mode": "100644",
            "type": "blob",
            "sha": blob["sha"],
        })

    tree = gh_api("POST", f"/repos/{owner}/{repo}/git/trees", {
        "base_tree": base_tree_sha,
        "tree": tree_entries,
    })

    commit = gh_api("POST", f"/repos/{owner}/{repo}/git/commits", {
        "message": (
            f"feat(translations): add WEB (World English Bible) full text with Deuterocanon\n\n"
            f"Source: {USFX_URL}\n"
            f"Includes canonical OT+NT and all available Deuterocanonical books.\n"
            f"All content is public domain."
        ),
        "tree": tree["sha"],
        "parents": [base_sha],
    })

    gh_api("PATCH", f"/repos/{owner}/{repo}/git/refs/heads/{BRANCH}", {
        "sha": commit["sha"],
        "force": False,
    })
    print(f"Committed: {commit['sha']}")
    print(f"  {len(files)} files pushed to {BRANCH}")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if not TOKEN:
        print("ERROR: GITHUB_TOKEN not set")
        sys.exit(1)

    xml_bytes = download_usfx()
    print("Parsing USFX...")
    books = parse_usfx(xml_bytes)
    known = {bid: name for bid, name in BOOK_NAMES.items() if bid in books}
    unknown = [bid for bid in books if bid not in BOOK_NAMES]
    print(f"  Books found: {len(books)} ({len(known)} recognized, {len(unknown)} skipped: {unknown})")

    files = build_files(books)
    print(f"  Files to commit: {len(files)}")

    push_files(files)
    print("Done.")
