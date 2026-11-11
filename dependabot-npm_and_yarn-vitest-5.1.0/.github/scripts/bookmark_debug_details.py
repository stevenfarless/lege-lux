from pathlib import Path

APP = Path('app.js')


def read(path):
    return path.read_text(encoding='utf-8')


def write(path, text):
    path.write_text(text.rstrip() + '\n', encoding='utf-8')


OLD = '''      } else if (k === "bookmarksV1" && raw) {
        const p = JSON.parse(raw);
        const items = Object.values(p.items || {});
        const active = items.filter((item) => item && item.deleted !== true).length;
        const deleted = items.filter((item) => item && item.deleted === true).length;
        ls[k] = `${active} active, ${deleted} deleted tombstones`;
      } else {'''

NEW = '''      } else if (k === "bookmarksV1" && raw) {
        const p = JSON.parse(raw);
        const items = Object.values(p.items || {});
        const activeItems = items.filter((item) => item && item.deleted !== true);
        const deletedItems = items.filter((item) => item && item.deleted === true);
        const formatBookmark = (item, status) => {
          const ref = `${item.book ?? "?"} ${item.chapter ?? "?"}:${item.verse ?? "?"}`;
          const color = item.color ?? "unknown";
          const updatedAt = Number(item.updatedAt);
          const updated = Number.isFinite(updatedAt)
            ? new Date(updatedAt).toISOString()
            : "n/a";
          return `    - ${status} ${ref} color=${color} updatedAt=${updated}`;
        };
        const details = [
          `${activeItems.length} active, ${deletedItems.length} deleted tombstones`,
          ...activeItems.map((item) => formatBookmark(item, "active")),
          ...deletedItems.map((item) => formatBookmark(item, "deleted")),
        ];
        ls[k] = details.join("\\n");
      } else {'''

text = read(APP)
if 'const activeItems = items.filter((item) => item && item.deleted !== true);' not in text:
    if OLD not in text:
        raise SystemExit('bookmarksV1 debug summary block not found')
    text = text.replace(OLD, NEW, 1)

if 'formatBookmark(item, "active")' not in text:
    raise SystemExit('bookmark debug details missing')

write(APP, text)
print('bookmark debug details applied')
