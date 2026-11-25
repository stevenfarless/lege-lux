const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.resolve(__dirname, '..', 'translations');
const SEARCH_INDEX_VERSION = 2;
const filter = process.argv.slice(2);

function normalizeTerm(word) {
  let w = String(word || '').toLowerCase();

  if (w.length > 3) {
    w = w.replace(/[’']s$/, '');
  }

  if (w.length < 3) return w;

  if (w.endsWith('est') && w.length > 5) return normalizeTerm(w.slice(0, -2));
  if (w.endsWith('eth') && w.length > 4) return normalizeTerm(w.slice(0, -3));
  if (w.endsWith('ing') && w.length > 5) return normalizeTerm(w.slice(0, -3));
  if (w.endsWith('ed') && w.length > 4 && !'aeiou'.includes(w[w.length - 3])) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4 && !'aeiou'.includes(w[w.length - 3])) return w.slice(0, -2);
  if (w.endsWith('e') && w.length >= 4 && !'aeiou'.includes(w[w.length - 2])) return w.slice(0, -1);
  if (w.endsWith('s') && w.length > 4 && !'aeiou'.includes(w[w.length - 2])) return w.slice(0, -1);
  return w;
}

function tokenizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

function addPosting(postings, term, verseId) {
  if (!term) return;
  if (!postings[term]) postings[term] = [];
  postings[term].push(verseId);
}

function addVerse(index, reference, text) {
  const verseId = index.refs.length;
  const lowerText = String(text || '').toLowerCase();
  index.refs.push(reference);
  index.texts.push(lowerText);

  const terms = new Set();
  for (const raw of tokenizeSearchText(lowerText)) {
    terms.add(raw);
    terms.add(normalizeTerm(raw));
  }
  for (const term of terms) addPosting(index.postings, term, verseId);
}

function createIndex() {
  return {
    version: SEARCH_INDEX_VERSION,
    refs: [],
    texts: [],
    postings: {},
  };
}

function getBookName(bookEntry) {
  if (typeof bookEntry === 'string') return bookEntry;
  if (bookEntry && typeof bookEntry.name === 'string') return bookEntry.name;
  return null;
}

const dirs = fs.readdirSync(TRANSLATIONS_DIR).filter(name => {
  const full = path.join(TRANSLATIONS_DIR, name);
  return fs.statSync(full).isDirectory() && (!filter.length || filter.includes(name));
});

let failed = false;

for (const t of dirs) {
  const metaPath = path.join(TRANSLATIONS_DIR, t, 'meta.json');
  if (!fs.existsSync(metaPath)) { console.warn(`[${t}] no meta.json, skipping`); continue; }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!Array.isArray(meta.books)) { console.warn(`[${t}] meta.books missing, skipping`); continue; }

  const index = createIndex();

  for (const bookEntry of meta.books) {
    const bookName = getBookName(bookEntry);
    if (!bookName) continue;

    const bookPath = path.join(TRANSLATIONS_DIR, t, `${bookName}.json`);
    if (!fs.existsSync(bookPath)) continue;

    const bookData = JSON.parse(fs.readFileSync(bookPath, 'utf8'));

    let chapters = bookData;
    const keys = Object.keys(bookData);
    if (keys.length === 1 && isNaN(Number(keys[0]))) chapters = bookData[keys[0]];

    for (const [ch, verses] of Object.entries(chapters)) {
      if (!verses || typeof verses !== 'object') continue;
      for (const [v, text] of Object.entries(verses)) {
        if (!/^\d+$/.test(v) || Number(v) <= 0) continue;
        addVerse(index, `${bookName} ${ch}:${v}`, text);
      }
    }
  }

  if (index.refs.length === 0) {
    console.error(`[${t}] no verses written; refusing to overwrite search index`);
    failed = true;
    continue;
  }

  const outPath = path.join(TRANSLATIONS_DIR, t, `${t}_search_index.json`);
  fs.writeFileSync(outPath, JSON.stringify(index), 'utf8');
  console.log(`[${t}] ${index.refs.length.toLocaleString()} verses written`);
}

if (failed) process.exitCode = 1;
