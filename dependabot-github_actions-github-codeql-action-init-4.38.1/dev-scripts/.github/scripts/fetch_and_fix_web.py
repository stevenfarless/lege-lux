#!/usr/bin/env python3
"""
fetch_and_fix_web.py

Step 1 — Fetch WEB:
  Downloads the World English Bible (WEBBE) USFX zip from ebible.org,
  parses every book (canonical + Deuterocanon), and pushes:
    translations/WEB/{Book}.json       — verse text
    translations/WEB/WEB_structure/{Book}.json — section/para scaffold
    translations/WEB/meta.json
  to TARGET_BRANCH in a single commit.

Step 2 — Fix all meta:
  Walks every translation folder on TARGET_BRANCH, counts actual chapter
  keys in each book file, rewrites meta.json with correct counts, adds
  any missing books, and registers WEB in translations/index.json.
  All meta changes are pushed as a second single commit.

WEB_structure format (matches translations/BSB/BSB_structure):
  Array of objects, each one of:
    {"ch": N, "v": N, "type": "heading", "text": "..."}
    {"ch": N, "v": N, "type": "para_break"}
  One entry per section head or paragraph boundary, anchored to the
  verse that immediately follows it.

Usage (local):
    GITHUB_TOKEN=<pat> GITHUB_REPO=stevenfarless/lege-lux TARGET_BRANCH=main-book-update python fetch_and_fix_web.py

Usage (GitHub Actions):
    Set GITHUB_TOKEN via secrets; GITHUB_REPO via github.repository;
    TARGET_BRANCH as a plain env var.

No external dependencies beyond the Python standard library.
"""

import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

USFX_URL       = "https://ebible.org/Scriptures/eng-webbe_usfx.zip"
TRANSLATION_ID = "WEB"
TARGET_DIR     = "translations/WEB"
STRUCTURE_DIR  = "translations/WEB/WEB_structure"
BRANCH         = os.environ.get("TARGET_BRANCH", "main-book-update")
REPO           = os.environ.get("GITHUB_REPO", "stevenfarless/lege-lux")
TOKEN          = os.environ.get("GITHUB_TOKEN", "")
API            = "https://api.github.com"

SKIP_SUFFIXES  = ("_search_index",)

# ---------------------------------------------------------------------------
# Book maps
# ---------------------------------------------------------------------------

BOOK_NAMES = {
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
    "TOB": "Tobit", "JDT": "Judith", "ESG": "Additions to Esther",
    "WIS": "Wisdom of Solomon", "SIR": "Sirach", "BAR": "Baruch",
    "LJE": "Letter of Jeremiah", "S3Y": "Prayer of Azariah",
    "SUS": "Susanna", "BEL": "Bel and the Dragon",
    "1MA": "1 Maccabees", "2MA": "2 Maccabees", "3MA": "3 Maccabees",
    "4MA": "4 Maccabees", "1ES": "1 Esdras", "2ES": "2 Esdras",
    "MAN": "Prayer of Manasseh", "PS2": "Psalm 151",
}

OT_IDS = {
    "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI",
    "1CH","2CH","EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER",
    "LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP",
    "HAG","ZEC","MAL",
}
NT_IDS = {
    "MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL",
    "1TH","2TH","1TI","TIT","PHM","HEB","JAS","1PE","2PE","1JN","2JN",
    "3JN","JUD","REV",
}

OT_NAMES = {
    "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges",
    "Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles",
    "2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalm","Proverbs",
    "Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations",
    "Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah",
    "Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi",
}
NT_NAMES = {
    "Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians",
    "2 Corinthians","Galatians","Ephesians","Philippians","Colossians",
    "1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus",
    "Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John",
    "3 John","Jude","Revelation",
}

CANON_ORDER = [
    "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges",
    "Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles",
    "2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalm","Proverbs",
    "Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations",
    "Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah",
    "Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi",
    "Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians",
    "2 Corinthians","Galatians","Ephesians","Philippians","Colossians",
    "1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus",
    "Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John",
    "3 John","Jude","Revelation",
    "Tobit","Judith","Additions to Esther","Wisdom of Solomon","Sirach",
    "Baruch","Letter of Jeremiah","Prayer of Azariah","Susanna",
    "Bel and the Dragon","1 Maccabees","2 Maccabees","3 Maccabees",
    "4 Maccabees","1 Esdras","2 Esdras","Prayer of Manasseh","Psalm 151",
]

WEB_META_INFO = {
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

WEB_INDEX_ENTRY = {
    "id": "WEB",
    "label": "World English Bible",
    "abbreviation": "WEB",
    "language": "en",
    "textDirection": "ltr",
    "year": 2000,
    "canon": "deuterocanon",
    "philosophy": "dynamic",
    "copyright": "World English Bible (WEB). Public domain.",
}

# USFX tags that carry section heading text
HEADING_TAGS = {"s", "s1", "s2", "s3", "ms", "mr"}
# USFX tags that mark a paragraph / stanza break
PARA_TAGS    = {"p", "q", "q1", "q2", "q3", "b", "li", "li1", "li2", "pi", "pi1", "pi2", "nb"}
# Tags whose entire sub-tree should be ignored during verse text collection
IGNORE_TAGS  = {"note","f","x","fig","milestone","optionalLineBreak","table","tr","th","thr","tc","tcr"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def testament_for_id(book_id):
    if book_id in OT_IDS: return "Old Testament"
    if book_id in NT_IDS: return "New Testament"
    return "Deuterocanon"

def testament_for_name(name):
    if name in OT_NAMES: return "Old Testament"
    if name in NT_NAMES: return "New Testament"
    return "Deuterocanon"

def book_order(name):
    try: return CANON_ORDER.index(name)
    except ValueError: return len(CANON_ORDER)

def _collect_text(elem):
    """Collect all text recursively from an element, ignoring IGNORE_TAGS sub-trees."""
    parts = []
    if elem.text:
        parts.append(elem.text)
    for child in elem:
        ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if ctag not in IGNORE_TAGS:
            parts.extend(_collect_text(child))
        if child.tail:
            parts.append(child.tail)
    return parts

# ---------------------------------------------------------------------------
# GitHub API
# ---------------------------------------------------------------------------

def gh(method, path, body=None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  API {e.code} {method} {path}: {e.read().decode()[:300]}")
        raise

def get_blob_text(owner, repo, sha):
    blob = gh("GET", f"/repos/{owner}/{repo}/git/blobs/{sha}")
    return base64.b64decode(blob["content"].replace("\n", "")).decode("utf-8")

def create_blob(owner, repo, text):
    r = gh("POST", f"/repos/{owner}/{repo}/git/blobs", {
        "content": base64.b64encode(text.encode("utf-8")).decode(),
        "encoding": "base64",
    })
    return r["sha"]

def get_branch_tip(owner, repo):
    ref = gh("GET", f"/repos/{owner}/{repo}/git/ref/heads/{BRANCH}")
    tip = ref["object"]["sha"]
    commit = gh("GET", f"/repos/{owner}/{repo}/git/commits/{tip}")
    return tip, commit["tree"]["sha"]

def commit_files(owner, repo, tip_sha, base_tree_sha, file_list, message):
    """file_list: list of (path, content_str)"""
    tree_entries = []
    for i, (path, content) in enumerate(file_list):
        print(f"  Blob {i+1}/{len(file_list)}: {path}")
        blob_sha = create_blob(owner, repo, content)
        tree_entries.append({"path": path, "mode": "100644", "type": "blob", "sha": blob_sha})

    new_tree = gh("POST", f"/repos/{owner}/{repo}/git/trees", {
        "base_tree": base_tree_sha,
        "tree": tree_entries,
    })
    new_commit = gh("POST", f"/repos/{owner}/{repo}/git/commits", {
        "message": message,
        "tree": new_tree["sha"],
        "parents": [tip_sha],
    })
    gh("PATCH", f"/repos/{owner}/{repo}/git/refs/heads/{BRANCH}", {
        "sha": new_commit["sha"],
        "force": False,
    })
    print(f"  Committed: {new_commit['sha']}")
    return new_commit["sha"]

# ---------------------------------------------------------------------------
# Step 1: Fetch and push WEB
# ---------------------------------------------------------------------------

def download_usfx():
    print(f"Downloading {USFX_URL} ...")
    req = urllib.request.Request(USFX_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    print(f"  {len(data):,} bytes")
    zf = zipfile.ZipFile(io.BytesIO(data))
    candidates = sorted(
        [n for n in zf.namelist() if "usfx" in n.lower() and n.endswith(".xml")],
        key=lambda x: len(x)
    ) or [n for n in zf.namelist() if n.endswith(".xml")]
    if not candidates:
        print("ERROR: no XML in zip")
        sys.exit(1)
    print(f"  Parsing: {candidates[0]}")
    return zf.read(candidates[0])


def parse_usfx(xml_bytes):
    """
    Returns:
      books     : {book_id: {chapter_str: {verse_str: text}}}
      structure : {book_id: [{"ch": N, "v": N, "type": "heading"|"para_break", ?"text": ...}]}

    Structure entries are anchored to the verse that immediately follows
    the heading/paragraph element in the XML stream.  If a heading or
    paragraph break appears before the first <v> of a chapter they are
    anchored to verse 1 of that chapter.
    """
    books     = {}
    structure = {}

    current_book    = None
    current_chapter = None
    current_verse   = None
    verse_parts     = []

    # Pending structure events waiting for the next verse anchor
    pending_struct  = []   # list of partial dicts lacking "v"

    ignore_depth    = 0    # >0 while inside an IGNORE_TAGS subtree

    def flush_verse():
        nonlocal verse_parts, current_verse
        if current_book and current_chapter and current_verse:
            text = " ".join("".join(verse_parts).split()).strip()
            if text:
                books.setdefault(current_book, {}).setdefault(current_chapter, {})[current_verse] = text
        verse_parts = []

    def anchor_pending(v):
        """Assign verse number v to all pending structure events."""
        v_int  = int(v)  if str(v).isdigit()               else 1
        ch_int = int(current_chapter) if current_chapter and str(current_chapter).isdigit() else 1
        for entry in pending_struct:
            entry["ch"] = ch_int
            entry["v"]  = v_int
            structure.setdefault(current_book, []).append(entry)
        pending_struct.clear()

    for event, elem in ET.iterparse(io.BytesIO(xml_bytes), events=("start", "end")):
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

        # --- track ignore depth ---
        if event == "start" and tag in IGNORE_TAGS:
            ignore_depth += 1
        if event == "end" and tag in IGNORE_TAGS:
            ignore_depth -= 1
            continue
        if ignore_depth > 0:
            continue

        if event == "start":
            # Book boundary
            if tag == "book":
                flush_verse()
                pending_struct.clear()
                current_book    = elem.get("id", "").upper()
                current_chapter = None
                current_verse   = None
                verse_parts     = []

            # Chapter boundary
            elif tag == "c":
                flush_verse()
                current_chapter = elem.get("id")
                current_verse   = None
                verse_parts     = []
                # carry pending forward — they'll be anchored at v1

            # Verse start
            elif tag == "v":
                flush_verse()
                current_verse = elem.get("id")
                anchor_pending(current_verse)
                verse_parts = []
                if elem.text:
                    verse_parts.append(elem.text)

            # Verse end marker
            elif tag == "ve":
                flush_verse()
                current_verse = None

            # Section heading — collect full text, queue as pending
            elif tag in HEADING_TAGS and current_book and current_chapter:
                heading_text = " ".join(_collect_text(elem)).split()
                heading_text = " ".join(heading_text).strip()
                if heading_text:
                    pending_struct.append({"type": "heading", "text": heading_text})

            # Paragraph / stanza break — queue as pending
            elif tag in PARA_TAGS and current_book and current_chapter:
                pending_struct.append({"type": "para_break"})

            # Verse text content
            elif current_verse and tag not in IGNORE_TAGS:
                if elem.text:
                    verse_parts.append(elem.text)

        elif event == "end":
            if tag in ("v", "ve", "c", "book") or tag in HEADING_TAGS or tag in PARA_TAGS:
                continue
            if current_verse and tag not in IGNORE_TAGS:
                if elem.tail:
                    verse_parts.append(elem.tail)

    flush_verse()
    return books, structure


def fetch_and_push_web(owner, repo):
    print("\n=== Step 1: Fetch WEB ===")
    xml_bytes = download_usfx()
    print("Parsing USFX...")
    books, structure = parse_usfx(xml_bytes)
    known   = [bid for bid in books if bid in BOOK_NAMES]
    skipped = [bid for bid in books if bid not in BOOK_NAMES]
    print(f"  {len(books)} books: {len(known)} recognized, {len(skipped)} skipped: {skipped}")

    file_list  = []
    meta_books = []

    for book_id, chapters in books.items():
        if book_id not in BOOK_NAMES:
            continue
        book_name = BOOK_NAMES[book_id]

        # Verse text file
        out = {}
        for ch, verses in sorted(chapters.items(), key=lambda x: int(x[0]) if str(x[0]).isdigit() else 0):
            out[str(ch)] = {
                str(v): t
                for v, t in sorted(verses.items(), key=lambda x: int(x[0]) if str(x[0]).isdigit() else 0)
            }
        file_list.append((
            f"{TARGET_DIR}/{book_name}.json",
            json.dumps(out, ensure_ascii=False, separators=(",", ":")),
        ))

        # Structure scaffold file
        struct_entries = structure.get(book_id, [])
        file_list.append((
            f"{STRUCTURE_DIR}/{book_name}.json",
            json.dumps(struct_entries, indent=2, ensure_ascii=False),
        ))

        meta_books.append({
            "name": book_name,
            "testament": testament_for_id(book_id),
            "chapters": len(chapters),
        })

    order      = ["Old Testament", "New Testament", "Deuterocanon"]
    names_list = list(BOOK_NAMES.values())
    meta_books.sort(key=lambda b: (
        order.index(b["testament"]) if b["testament"] in order else 3,
        names_list.index(b["name"]) if b["name"] in names_list else 999,
    ))
    file_list.append((
        f"{TARGET_DIR}/meta.json",
        json.dumps({"info": WEB_META_INFO, "books": meta_books}, indent=2, ensure_ascii=False),
    ))

    print(f"  {len(file_list)} files to commit")
    tip_sha, base_tree_sha = get_branch_tip(owner, repo)
    print(f"  Branch {BRANCH} @ {tip_sha}")
    commit_files(
        owner, repo, tip_sha, base_tree_sha, file_list,
        f"feat(translations): add WEB full text + WEB_structure scaffold\n\nSource: {USFX_URL}\nPublic domain.",
    )
    print("Step 1 done.")


# ---------------------------------------------------------------------------
# Step 2: Fix all meta
# ---------------------------------------------------------------------------

def fix_meta(owner, repo):
    print("\n=== Step 2: Fix meta ===")
    tip_sha, base_tree_sha = get_branch_tip(owner, repo)
    print(f"  Branch {BRANCH} @ {tip_sha}")

    tree_data = gh("GET", f"/repos/{owner}/{repo}/git/trees/{base_tree_sha}?recursive=1")
    by_path   = {item["path"]: item for item in tree_data["tree"] if item["type"] == "blob"}

    trans_dirs = set()
    for path in by_path:
        parts = path.split("/")
        if len(parts) >= 2 and parts[0] == "translations" and parts[1] not in ("", "index.json"):
            trans_dirs.add(parts[1])
    print(f"  Translations: {sorted(trans_dirs)}")

    new_blobs = []

    for tid in sorted(trans_dirs):
        folder    = f"translations/{tid}"
        meta_path = f"{folder}/meta.json"

        book_files = {}
        for path, item in by_path.items():
            if not path.startswith(f"{folder}/"):  continue
            if not path.endswith(".json"):          continue
            if path == meta_path:                   continue
            if path.count("/") != 2:               continue   # skip sub-folders like WEB_structure/
            stem = path.split("/")[-1][:-5]
            if any(stem.endswith(s) for s in SKIP_SUFFIXES): continue
            book_files[stem] = item["sha"]

        if not book_files or meta_path not in by_path:
            continue

        meta_text = get_blob_text(owner, repo, by_path[meta_path]["sha"])
        meta      = json.loads(meta_text)
        existing  = {b["name"]: b for b in meta.get("books", [])}

        updated = {}
        for book_name, blob_sha in book_files.items():
            try:
                book_data = json.loads(get_blob_text(owner, repo, blob_sha))
            except json.JSONDecodeError:
                print(f"    WARN: could not parse {book_name}.json")
                continue
            chapter_count = len(book_data)
            if book_name in existing:
                entry = dict(existing[book_name])
                old   = entry.get("chapters")
                entry["chapters"] = chapter_count
                if old != chapter_count:
                    print(f"    {tid}/{book_name}: {old} -> {chapter_count}")
            else:
                entry = {
                    "name":      book_name,
                    "testament": testament_for_name(book_name),
                    "chapters":  chapter_count,
                }
                print(f"    {tid}/{book_name}: NEW ({chapter_count}, {entry['testament']})")
            updated[book_name] = entry

        meta["books"] = sorted(updated.values(), key=lambda b: book_order(b["name"]))
        new_meta = json.dumps(meta, indent=2, ensure_ascii=False)
        if new_meta != meta_text:
            new_blobs.append((meta_path, new_meta))
            print(f"    {tid}/meta.json updated")

    index_path = "translations/index.json"
    if index_path in by_path:
        index_text   = get_blob_text(owner, repo, by_path[index_path]["sha"])
        index        = json.loads(index_text)
        existing_ids = {t["id"] for t in index["translations"]}
        if "WEB" in trans_dirs and "WEB" not in existing_ids:
            index["translations"].append(WEB_INDEX_ENTRY)
            index["translations"].sort(key=lambda t: t["id"])
            new_blobs.append((index_path, json.dumps(index, indent=2, ensure_ascii=False)))
            print("    Added WEB to index.json")

    if not new_blobs:
        print("  Nothing to update.")
        return

    print(f"  Committing {len(new_blobs)} file(s)...")
    commit_files(
        owner, repo, tip_sha, base_tree_sha, new_blobs,
        "fix(translations): repair meta.json chapter counts and register new books/translations",
    )
    print("Step 2 done.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if not TOKEN:
        print("ERROR: GITHUB_TOKEN not set")
        sys.exit(1)
    owner, repo = REPO.split("/", 1)
    print(f"Repo: {REPO}  Branch: {BRANCH}")
    fetch_and_push_web(owner, repo)
    fix_meta(owner, repo)
    print("\nAll done.")
