#!/usr/bin/env python3
"""
fix_meta.py

For every translation folder on the target branch:
  1. Lists all {Book}.json files via the GitHub API.
  2. Fetches each file and counts the actual number of top-level chapter keys.
  3. Rewrites translations/{ID}/meta.json with correct chapter counts and
     any books present on disk that are missing from the meta books array.
  4. Adds any new translations (e.g. WEB) to translations/index.json if absent.

All changes are pushed as a single commit.

Usage (local):
    GITHUB_TOKEN=<pat> GITHUB_REPO=stevenfarless/lege-lux TARGET_BRANCH=main-book-update python fix_meta.py

Usage (GitHub Actions):
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      GITHUB_REPO: ${{ github.repository }}
      TARGET_BRANCH: main-book-update

No external dependencies beyond the Python standard library.
"""

import base64
import json
import os
import sys
import urllib.request
import urllib.error

BRANCH = os.environ.get("TARGET_BRANCH", "main-book-update")
REPO   = os.environ.get("GITHUB_REPO", "stevenfarless/lege-lux")
TOKEN  = os.environ.get("GITHUB_TOKEN", "")
API    = "https://api.github.com"

# Files whose names end in _search_index are not book files
SKIP_SUFFIXES = ("_search_index",)

# ---------------------------------------------------------------------------
# Testament classification
# ---------------------------------------------------------------------------

OT = {
    "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges",
    "Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles",
    "2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalm","Proverbs",
    "Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations",
    "Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah",
    "Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi",
}
NT = {
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

def book_order(name):
    try:
        return CANON_ORDER.index(name)
    except ValueError:
        return len(CANON_ORDER)

def testament(name):
    if name in OT: return "Old Testament"
    if name in NT: return "New Testament"
    return "Deuterocanon"

NEW_TRANSLATIONS = {
    "WEB": {
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
}

# ---------------------------------------------------------------------------
# GitHub API helpers
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
        msg = e.read().decode()
        print(f"  API {e.code} {method} {path}: {msg[:200]}")
        raise

def get_blob_text(blob_sha):
    owner, repo = REPO.split("/", 1)
    blob = gh("GET", f"/repos/{owner}/{repo}/git/blobs/{blob_sha}")
    content = blob["content"].replace("\n", "")
    return base64.b64decode(content).decode("utf-8")

def create_blob(content_str):
    owner, repo = REPO.split("/", 1)
    blob = gh("POST", f"/repos/{owner}/{repo}/git/blobs", {
        "content": base64.b64encode(content_str.encode("utf-8")).decode(),
        "encoding": "base64",
    })
    return blob["sha"]

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if not TOKEN:
        print("ERROR: GITHUB_TOKEN not set")
        sys.exit(1)

    owner, repo = REPO.split("/", 1)
    print(f"Branch: {BRANCH}")

    ref = gh("GET", f"/repos/{owner}/{repo}/git/ref/heads/{BRANCH}")
    tip_sha = ref["object"]["sha"]
    commit = gh("GET", f"/repos/{owner}/{repo}/git/commits/{tip_sha}")
    base_tree_sha = commit["tree"]["sha"]
    print(f"Tip: {tip_sha}")

    tree_data = gh("GET", f"/repos/{owner}/{repo}/git/trees/{base_tree_sha}?recursive=1")
    items = tree_data["tree"]
    by_path = {item["path"]: item for item in items if item["type"] == "blob"}

    trans_dirs = set()
    for path in by_path:
        parts = path.split("/")
        if len(parts) >= 2 and parts[0] == "translations" and parts[1] not in ("", "index.json"):
            trans_dirs.add(parts[1])

    print(f"Translations found: {sorted(trans_dirs)}")

    new_blobs = []

    for tid in sorted(trans_dirs):
        print(f"\n=== {tid} ===")
        folder = f"translations/{tid}"
        meta_path = f"{folder}/meta.json"

        book_files = {}
        for path, item in by_path.items():
            if not path.startswith(f"{folder}/"):
                continue
            if not path.endswith(".json"):
                continue
            if path == meta_path:
                continue
            if path.count("/") != 2:
                continue
            stem = path.split("/")[-1][:-5]  # strip .json
            if any(stem.endswith(s) for s in SKIP_SUFFIXES):
                print(f"  Skipping non-book file: {stem}")
                continue
            book_files[stem] = item["sha"]

        if not book_files:
            print(f"  No book files, skipping")
            continue

        if meta_path not in by_path:
            print(f"  No meta.json, skipping")
            continue

        meta_text = get_blob_text(by_path[meta_path]["sha"])
        meta = json.loads(meta_text)
        existing = {b["name"]: b for b in meta.get("books", [])}

        updated_books = {}
        for book_name, blob_sha in book_files.items():
            book_text = get_blob_text(blob_sha)
            try:
                book_data = json.loads(book_text)
            except json.JSONDecodeError:
                print(f"  WARN: could not parse {book_name}.json")
                continue
            chapter_count = len(book_data)

            if book_name in existing:
                entry = dict(existing[book_name])
                old = entry.get("chapters")
                entry["chapters"] = chapter_count
                if old != chapter_count:
                    print(f"  {book_name}: {old} -> {chapter_count}")
                else:
                    print(f"  {book_name}: {chapter_count} (ok)")
            else:
                entry = {
                    "name": book_name,
                    "testament": testament(book_name),
                    "chapters": chapter_count,
                }
                print(f"  {book_name}: NEW ({chapter_count}, {entry['testament']})")

            updated_books[book_name] = entry

        meta["books"] = sorted(updated_books.values(), key=lambda b: book_order(b["name"]))

        new_meta = json.dumps(meta, indent=2, ensure_ascii=False)
        if new_meta != meta_text:
            blob_sha = create_blob(new_meta)
            new_blobs.append((meta_path, blob_sha))
            print(f"  meta.json updated")
        else:
            print(f"  meta.json unchanged")

    index_path = "translations/index.json"
    if index_path in by_path:
        index_text = get_blob_text(by_path[index_path]["sha"])
        index = json.loads(index_text)
        existing_ids = {t["id"] for t in index["translations"]}
        added = []
        for tid, info in NEW_TRANSLATIONS.items():
            if tid in trans_dirs and tid not in existing_ids:
                index["translations"].append(info)
                added.append(tid)
                print(f"\nAdded {tid} to index.json")
        if added:
            index["translations"].sort(key=lambda t: t["id"])
            new_index = json.dumps(index, indent=2, ensure_ascii=False)
            blob_sha = create_blob(new_index)
            new_blobs.append((index_path, blob_sha))

    if not new_blobs:
        print("\nNothing to update.")
        return

    print(f"\nCommitting {len(new_blobs)} file(s)...")

    tree_entries = [{
        "path": path,
        "mode": "100644",
        "type": "blob",
        "sha": sha,
    } for path, sha in new_blobs]

    new_tree = gh("POST", f"/repos/{owner}/{repo}/git/trees", {
        "base_tree": base_tree_sha,
        "tree": tree_entries,
    })

    new_commit = gh("POST", f"/repos/{owner}/{repo}/git/commits", {
        "message": "fix(translations): repair meta.json chapter counts and register new books/translations",
        "tree": new_tree["sha"],
        "parents": [tip_sha],
    })

    gh("PATCH", f"/repos/{owner}/{repo}/git/refs/heads/{BRANCH}", {
        "sha": new_commit["sha"],
        "force": False,
    })

    print(f"Done. Commit: {new_commit['sha']}")

if __name__ == "__main__":
    main()
