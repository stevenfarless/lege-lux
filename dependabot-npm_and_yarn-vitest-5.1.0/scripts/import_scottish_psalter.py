#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import urllib.request
from pathlib import Path

SOURCE_REPOSITORY = "dieuwedeboer/scottishmetricalpsalter"
SOURCE_COMMIT = "de33907d723fe7b4a17d93cd3ba165883f0119d6"
SOURCE_PATH = "docs/psalms/psalms.txt"
SOURCE_BLOB_SHA1 = "68fcb8aa6b02ec8411ae4a61b0b646f9ffcf641c"
SOURCE_URL = (
    "https://raw.githubusercontent.com/"
    f"{SOURCE_REPOSITORY}/{SOURCE_COMMIT}/{SOURCE_PATH}"
)
PSALM_HEADING_RE = re.compile(r"^PSALM\s+(\d+)([A-Za-z]?)$")
VERSE_START_RE = re.compile(r"^(\d+)(.*)$")
PSALM_72_VERSE_20 = "#The prayers of David the son of Jesse are ended."


def git_blob_sha1(data):
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def read_source(path):
    if path:
        return Path(path).read_bytes()
    with urllib.request.urlopen(SOURCE_URL, timeout=30) as response:
        return response.read()


def load_expected_verses(kjv_path):
    data = json.loads(Path(kjv_path).read_text(encoding="utf-8"))
    return {
        number: sorted(
            int(verse) for verse in data[str(number)].keys() if int(verse) > 0
        )
        for number in range(1, 151)
    }


def parse_psalter(source_text, expected_verses):
    psalms = {}
    current_psalm = None
    current_verse = None
    current_lines = []
    primary = False

    def flush_verse():
        nonlocal current_verse, current_lines
        if current_psalm is None or current_verse is None or not primary:
            current_verse = None
            current_lines = []
            return
        text = "\n".join(current_lines).strip()
        if not text:
            raise ValueError(f"Psalm {current_psalm}:{current_verse} is empty")
        psalms.setdefault(str(current_psalm), {})[str(current_verse)] = text
        current_verse = None
        current_lines = []

    for raw_line in source_text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw_line.strip()
        heading = PSALM_HEADING_RE.fullmatch(line)
        if heading:
            flush_verse()
            current_psalm = int(heading.group(1))
            primary = heading.group(2) == ""
            continue

        if not primary or current_psalm is None or not line:
            continue

        if line.startswith("#"):
            # The source stores Psalm 72:20 as a rubric instead of a numbered line.
            if current_psalm == 72 and line == PSALM_72_VERSE_20:
                flush_verse()
                current_verse = 20
                current_lines.append(line[1:].strip())
            continue

        verse_match = VERSE_START_RE.match(line)
        expected = expected_verses[current_psalm]
        next_verse = 1 if current_verse is None else current_verse + 1
        if verse_match and int(verse_match.group(1)) == next_verse and next_verse in expected:
            flush_verse()
            current_verse = next_verse
            first_line = verse_match.group(2).strip()
            if first_line:
                current_lines.append(first_line)
            continue

        if current_verse is not None:
            current_lines.append(line)

    flush_verse()
    return psalms


def validate(psalms, expected_verses):
    expected_psalms = [str(number) for number in range(1, 151)]
    if list(psalms.keys()) != expected_psalms:
        missing = sorted(set(expected_psalms) - set(psalms), key=int)
        extra = sorted(set(psalms) - set(expected_psalms), key=int)
        raise ValueError(f"Psalter Psalm set mismatch; missing={missing}, extra={extra}")

    for number in range(1, 151):
        actual = sorted(int(verse) for verse in psalms[str(number)].keys())
        expected = expected_verses[number]
        if actual != expected:
            raise ValueError(
                f"Psalm {number} verse set mismatch; expected={expected}, actual={actual}"
            )

    if not psalms["1"]["1"].startswith("That man hath perfect blessedness,"):
        raise ValueError("Psalm 1:1 sanity check failed")
    if psalms["72"]["20"] != "The prayers of David the son of Jesse are ended.":
        raise ValueError("Psalm 72:20 sanity check failed")


def write_json(path, data):
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source")
    parser.add_argument("--kjv", default="translations/KJV/Psalm.json")
    parser.add_argument("--output", default="special-psalms/MP1650/Psalm.json")
    parser.add_argument(
        "--source-metadata", default="special-psalms/MP1650/source.json"
    )
    args = parser.parse_args()

    source_bytes = read_source(args.source)
    actual_sha = git_blob_sha1(source_bytes)
    if actual_sha != SOURCE_BLOB_SHA1:
        raise ValueError(
            f"Pinned source hash mismatch: expected {SOURCE_BLOB_SHA1}, got {actual_sha}"
        )

    source_text = source_bytes.decode("utf-8-sig")
    expected_verses = load_expected_verses(args.kjv)
    psalms = parse_psalter(source_text, expected_verses)
    validate(psalms, expected_verses)

    metadata = {
        "id": "MP1650",
        "name": "Scottish Psalter (1650)",
        "scope": "Psalms 1-150, primary versions",
        "historicTextRights": "Public domain",
        "source": {
            "repository": SOURCE_REPOSITORY,
            "commit": SOURCE_COMMIT,
            "path": SOURCE_PATH,
            "gitBlobSha1": SOURCE_BLOB_SHA1,
        },
    }

    write_json(args.output, psalms)
    write_json(args.source_metadata, metadata)
    print(f"Generated {args.output} from pinned source {SOURCE_BLOB_SHA1}")


if __name__ == "__main__":
    main()
