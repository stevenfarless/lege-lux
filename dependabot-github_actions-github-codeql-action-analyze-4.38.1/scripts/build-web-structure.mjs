import fs from 'fs';
import path from 'path';
import { inflateRawSync } from 'zlib';

const OUT_DIR = path.resolve('translations/WEB/WEB_structure');
const ZIP_URL = 'https://ebible.org/Scriptures/eng-webbe_usfm.zip';

const MAP = {
  GEN:'Genesis',EXO:'Exodus',EXOD:'Exodus',LEV:'Leviticus',NUM:'Numbers',
  DEU:'Deuteronomy',DEUT:'Deuteronomy',JOS:'Joshua',JOSH:'Joshua',
  JDG:'Judges',JUDG:'Judges',RUT:'Ruth',
  '1SA':'1 Samuel','2SA':'2 Samuel','1KI':'1 Kings','2KI':'2 Kings',
  '1CH':'1 Chronicles','2CH':'2 Chronicles',
  EZR:'Ezra',NEH:'Nehemiah',EST:'Esther',ESTH:'Esther',JOB:'Job',
  PSA:'Psalm',PS:'Psalm',PRO:'Proverbs',PROV:'Proverbs',
  ECC:'Ecclesiastes',ECCL:'Ecclesiastes',
  SNG:'Song of Solomon',SONG:'Song of Solomon',
  ISA:'Isaiah',JER:'Jeremiah',LAM:'Lamentations',
  EZK:'Ezekiel',EZEK:'Ezekiel',DAN:'Daniel',
  HOS:'Hosea',JOL:'Joel',AMO:'Amos',OBA:'Obadiah',JON:'Jonah',
  MIC:'Micah',NAM:'Nahum',HAB:'Habakkuk',
  ZEP:'Zephaniah',ZEPH:'Zephaniah',HAG:'Haggai',
  ZEC:'Zechariah',ZECH:'Zechariah',MAL:'Malachi',
  MAT:'Matthew',MATT:'Matthew',MRK:'Mark',LUK:'Luke',
  JHN:'John',JOHN:'John',ACT:'Acts',ROM:'Romans',
  '1CO':'1 Corinthians','1COR':'1 Corinthians',
  '2CO':'2 Corinthians','2COR':'2 Corinthians',
  GAL:'Galatians',EPH:'Ephesians',PHP:'Philippians',PHIL:'Philippians',
  COL:'Colossians',
  '1TH':'1 Thessalonians','1THES':'1 Thessalonians',
  '2TH':'2 Thessalonians','2THES':'2 Thessalonians',
  '1TI':'1 Timothy','1TIM':'1 Timothy',
  '2TI':'2 Timothy','2TIM':'2 Timothy',
  TIT:'Titus',PHM:'Philemon',PHLM:'Philemon',HEB:'Hebrews',JAS:'James',
  '1PE':'1 Peter','1PET':'1 Peter','2PE':'2 Peter','2PET':'2 Peter',
  '1JN':'1 John','2JN':'2 John','3JN':'3 John',
  JUD:'Jude',JUDE:'Jude',REV:'Revelation',
  // Deuterocanon
  TOB:'Tobit',JDT:'Judith',WIS:'Wisdom of Solomon',SIR:'Sirach',
  BAR:'Baruch',LJE:'Letter of Jeremiah',
  '1MA':'1 Maccabees','1MAC':'1 Maccabees',
  '2MA':'2 Maccabees','2MAC':'2 Maccabees',
  '3MA':'3 Maccabees','3MAC':'3 Maccabees',
  '4MA':'4 Maccabees','4MAC':'4 Maccabees',
  '1ES':'1 Esdras','1ESD':'1 Esdras',
  '2ES':'2 Esdras','2ESD':'2 Esdras',
  MAN:'Prayer of Manasseh',
  AZA:'Prayer of Azariah',PRAZAR:'Prayer of Azariah',
  SUS:'Susanna',BEL:'Bel and the Dragon',
  ADDEST:'Additions to Esther',ADDESTH:'Additions to Esther',ESTGR:'Additions to Esther',
  PS2:'Psalm 151',
};

function bookName(a) { return MAP[a.toUpperCase()] || null; }

// Handles formats like: 02-GENeng-webbe.usfm, 10-1SAeng-webbe.usfm
function abbrev(filename) {
  const m = filename.match(/^\d+-([A-Za-z0-9]+?)(?:eng-webbe)?\.usfm$/i);
  return m ? m[1] : null;
}

function parseZip(buf) {
  const entries = [];
  let o = 0;
  while (o + 30 <= buf.length) {
    if (buf.readUInt32LE(o) !== 0x04034b50) break;
    const comp = buf.readUInt16LE(o + 8);
    const sz   = buf.readUInt32LE(o + 18);
    const fnl  = buf.readUInt16LE(o + 26);
    const xl   = buf.readUInt16LE(o + 28);
    const fn   = buf.slice(o + 30, o + 30 + fnl).toString('utf8');
    const ds   = o + 30 + fnl + xl;
    const de   = ds + sz;
    const cd   = buf.slice(ds, de);
    o = de;
    if (o + 4 <= buf.length && buf.readUInt32LE(o) === 0x08074b50) o += 16;
    if (!fn.toLowerCase().endsWith('.usfm')) continue;
    let ct;
    if (comp === 0) ct = cd.toString('utf8');
    else if (comp === 8) { try { ct = inflateRawSync(cd).toString('utf8'); } catch { continue; } }
    else continue;
    entries.push({ filename: path.basename(fn), content: ct });
  }
  return entries;
}

function parseUsfm(content) {
  const events = [];
  let ch = 0, heading = null, pendingBreak = false;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^\\c\s+(\d+)/))) {
      ch = +m[1]; heading = null; pendingBreak = false; continue;
    }
    if ((m = line.match(/^\\(?:s\d?|ms\d?)\s+(.*)/))) {
      const text = m[1].replace(/\\[a-z0-9*]+/g, '').replace(/\s+/g, ' ').trim();
      if (text) heading = text;
      continue;
    }
    if (/^\\(?:p|b|pi\d?|q\d?|m|li\d?|nb)(?:\s|$)/.test(line)) {
      pendingBreak = true; continue;
    }
    if ((m = line.match(/^\\v\s+(\d+)/))) {
      const v = +m[1];
      if (heading !== null) events.push({ ch, v, type: 'heading', text: heading });
      if (pendingBreak)     events.push({ ch, v, type: 'para_break' });
      heading = null; pendingBreak = false;
    }
  }
  events.sort((a, b) =>
    a.ch !== b.ch ? a.ch - b.ch :
    a.v  !== b.v  ? a.v  - b.v  :
    a.type === 'heading' ? -1 : 1
  );
  return events;
}

console.log('Downloading WEBBE USFM zip...');
const r = await fetch(ZIP_URL);
if (!r.ok) throw new Error('HTTP ' + r.status);
const buf = Buffer.from(await r.arrayBuffer());
console.log(`Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

const entries = parseZip(buf);
console.log(`Found ${entries.length} USFM files`);

fs.mkdirSync(OUT_DIR, { recursive: true });
let n = 0;
for (const { filename: f, content: c } of entries) {
  const ab = abbrev(f);
  if (!ab) { console.log(`  SKIP (no abbrev): ${f}`); continue; }
  const bn = bookName(ab);
  if (!bn) { console.log(`  SKIP (no book):   ${f} -> ${ab}`); continue; }
  const ev = parseUsfm(c);
  // lgtm[js/http-to-file-access] -- intentional data pipeline: parses public domain Bible USFM from known source
  fs.writeFileSync(path.join(OUT_DIR, bn + '.json'), JSON.stringify(ev, null, 2));
  console.log(`  ${bn.padEnd(30)} ${ev.length} events`);
  n++;
}
console.log(`Done. ${n} files written.`);
