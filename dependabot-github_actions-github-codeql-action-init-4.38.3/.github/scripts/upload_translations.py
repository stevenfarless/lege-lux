import os
import json
import glob
import firebase_admin
from firebase_admin import credentials, db

cred = credentials.Certificate("/tmp/service_account.json")
firebase_admin.initialize_app(cred, {
    "databaseURL": "https://esv-bible-6dffb-default-rtdb.firebaseio.com"
})

target = os.environ.get("TARGET_TRANSLATION", "").strip().upper()

translation_dirs = sorted([
    d for d in glob.glob("translations/*/")
    if os.path.isdir(d)
])

if not translation_dirs:
    print("No translation directories found.")
    raise SystemExit(1)

for trans_dir in translation_dirs:
    abbr = trans_dir.rstrip("/").split("/")[-1]

    if target and abbr.upper() != target:
        print(f"Skipping {abbr}")
        continue

    print(f"\n=== {abbr} ===")
    data = {}

    # Flat JSON files (books, meta, info, search index, paratext)
    for filepath in sorted(glob.glob(f"{trans_dir}*.json")):
        filename = os.path.basename(filepath)
        key = filename.replace(".json", "")
        with open(filepath, "r", encoding="utf-8-sig") as f:
            data[key] = json.load(f)
        print(f"  loaded {filename}")

    # One level of subdirectories (e.g. BSB_structure/)
    for subdir in sorted(glob.glob(f"{trans_dir}*/")):
        subdir_name = subdir.rstrip("/").split("/")[-1]
        subdir_data = {}
        for filepath in sorted(glob.glob(f"{subdir}*.json")):
            filename = os.path.basename(filepath)
            key = filename.replace(".json", "")
            with open(filepath, "r", encoding="utf-8-sig") as f:
                subdir_data[key] = json.load(f)
            print(f"  loaded {subdir_name}/{filename}")
        if subdir_data:
            data[subdir_name] = subdir_data
            print(f"  bundled {len(subdir_data)} files from {subdir_name}/")

    if not data:
        print(f"  No JSON files found, skipping.")
        continue

    print(f"  Uploading {len(data)} keys to translations/{abbr}...")
    db.reference(f"translations/{abbr}").set(data)
    print(f"  Done.")

print("\nAll done.")
