import csv, json, pathlib, sys, re
from datetime import datetime, timezone

src = pathlib.Path(sys.argv[1])
out_dir = pathlib.Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

COPYRIGHT = "https://bereanbible.com/bsb.txt"
TRANSLATION = "BSB"
VERSION = "1.4.0"
timestamp = datetime.now(timezone.utc).isoformat()

books = {}
with src.open("r", encoding="utf-8-sig", newline="") as f:
    reader = csv.reader(f, delimiter="\t")
    for row in reader:
        if not row or row[0] == "Verse":
            continue
        ref = row[0].strip()
        text = row[1].strip() if len(row) > 1 else ""
        m = re.match(r"^(.+?)\s+(\d+):(\d+)$", ref)
        if not m:
            continue
        book, chap, verse = m.group(1), m.group(2), m.group(3)
        books.setdefault(book, {}).setdefault(chap, {})[verse] = text

info = {
    "Copyright": COPYRIGHT,
    "Language": "English",
    "Meaningless": VERSION,
    "Timestamp": timestamp,
    "Translation": TRANSLATION,
}

for book, chapters in books.items():
    data = {"Info": info, book: chapters}
    (out_dir / f"{book}.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

print(f"Done. Books: {len(books)}, timestamp: {timestamp}")
