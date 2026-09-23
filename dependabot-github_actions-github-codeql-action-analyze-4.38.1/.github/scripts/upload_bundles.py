import os
import json
import glob
import firebase_admin
from firebase_admin import credentials, db

MAX_BYTES = 3_500_000

cred = credentials.Certificate("/tmp/service_account.json")
firebase_admin.initialize_app(cred, {
    "databaseURL": "https://esv-bible-6dffb-default-rtdb.firebaseio.com"
})

target = os.environ.get("TARGET_TRANSLATION", "").strip().upper()

bundle_files = sorted(glob.glob("bundles/*_bundle.json"))

if not bundle_files:
    print("No bundle files found in bundles/.")
    raise SystemExit(1)


def safe_set(ref, value, label):
    """Write value to ref, chunking by top-level key if too large."""
    size = len(json.dumps(value))
    if size <= MAX_BYTES:
        ref.set(value)
        return
    print(f"    {label} is {size:,} bytes — writing children individually")
    for k, v in value.items():
        ref.child(k).set(v)


for bundle_path in bundle_files:
    filename = os.path.basename(bundle_path)
    abbr = filename.replace("_bundle.json", "").upper()

    if target and abbr != target:
        print(f"Skipping {filename}")
        continue

    print(f"\n=== {abbr} ===")
    with open(bundle_path, "r", encoding="utf-8") as f:
        bundle = json.load(f)

    ref = db.reference(f"bundles/{abbr}")

    for key, value in bundle.items():
        size = len(json.dumps(value))
        print(f"  Writing {key} ({size:,} bytes)...")

        if key == "books":
            for book_key, book_data in value.items():
                ref.child("books").child(book_key).set(book_data)
            print(f"    wrote {len(value)} books individually")

        elif key == "index":
            # index.v (book name list) is tiny
            ref.child("index").child("v").set(value["v"])
            # index.w (word->packed int arrays) — chunk by first 2 chars if needed
            w = value["w"]
            chunks = {}
            for word, refs in w.items():
                prefix = (word[:2] if len(word) >= 2 else word + "_").lower()
                if prefix not in chunks:
                    chunks[prefix] = {}
                chunks[prefix][word] = refs
            for prefix, chunk in sorted(chunks.items()):
                safe_set(ref.child("index").child("w").child(prefix), chunk, f"index/w/{prefix}")
            print(f"    wrote index.w in {len(chunks)} chunks")

        else:
            ref.child(key).set(value)

    print(f"  Done.")

print("\nAll done.")
