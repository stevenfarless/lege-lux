// BUILD_ID is injected at deploy time by the CI workflow:
//   sed -i "s/d17b93a/$GITHUB_SHA/g" sw.js
// The placeholder below is replaced with the full commit SHA before
// the file is published to GitHub Pages. Never edit the placeholder
// directly — changes here are overwritten on every deploy.
let BUILD_ID = 'pending';
let CACHE_NAME = 'bible-pending';

const APP_SHELL_PATTERN = /\.(js|mjs|css)$/;
const LONG_LIVED_STATIC_PATTERN = /\.(js|mjs|css|woff2?|png|ico|webmanifest)$/;

const PRECACHED_TRANSLATIONS = new Set(['KJV', 'BSB']);

const installedTranslations = new Set(PRECACHED_TRANSLATIONS);

const CANONICAL_BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
  'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs',
  'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
  'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke',
  'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians',
  'Galatians', 'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy',
  'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter',
  '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

const PER_BOOK_PRECACHE = [...PRECACHED_TRANSLATIONS].flatMap(t =>
  CANONICAL_BOOKS.map(b => `./translations/${t}/${encodeURIComponent(b)}.json`)
);

const BSB_STRUCTURE_FILES = [
  './translations/BSB/BSB_structure/Genesis.json',
  './translations/BSB/BSB_structure/Psalm.json',
  './translations/BSB/BSB_structure/John.json',
  './translations/BSB/BSB_structure/Leviticus.json',
  './translations/BSB/BSB_structure/Matthew.json',
  './translations/BSB/BSB_structure/Mark.json',
  './translations/BSB/BSB_structure/Luke.json',
  './translations/BSB/BSB_structure/Acts.json',
  './translations/BSB/BSB_structure/Romans.json',
  './translations/BSB/BSB_structure/Revelation.json',
];

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './css/base.css',
  './css/tokens.css',
  './css/fonts.css',
  './css/optional-fonts.css',
  './css/themes.css',
  './css/layout.css',
  './css/components.css',
  './css/modals.css',
  './css/interactions.css',
  './css/utilities.css',
  './css/pericope.css',
  './css/luna-lux.css',
  './css/geek95.css',
  './app.js',
  './install-prompt.js',
  './bible-api.js',
  './search-index-engine.js',
  './bible-structure.js',
  './bsb-structure.js',
  './versification.js',
  './book-aliases.js',
  './reading-state.js',
  './translation-store.js',
  './psalm-translations.js',
  './ui.js',
  './navigation.js',
  './search.js',
  './auth.js',
  './sync-prompt.js',
  './translation-sync.js',
  './modals.js',
  './settings.js',
  './haptics.js',
  './keyboard.js',
  './events.js',
  './swipe.js',
  './firebase-config.js',
  './config/firebase-config.bundle.js',
  './translations/index.json',
  './translations/KJV/KJV_search_index.json',
  './translations/BSB/BSB_search_index.json',
  './site.webmanifest',
  './android-chrome-192x192.png',
  './android-chrome-512x512.png',
  './apple-touch-icon.png',
  './favicon-16x16.png',
  './favicon-32x32.png',
  './favicon.ico',
  './fonts/Cinzel-Regular.woff2',
  './fonts/GentiumBookPlus-Regular.woff2',
  './fonts/GentiumBookPlus-Italic.woff2',
  './fonts/GentiumBookPlus-Bold.woff2',
  './fonts/GentiumBookPlus-BoldItalic.woff2',
  './fonts/Andika-Regular.woff2',
  './fonts/Andika-Italic.woff2',
  './fonts/Andika-Bold.woff2',
  './fonts/OpenDyslexic3-Regular.woff2',
  './fonts/Ubuntu-Regular.woff2',
  './fonts/Ubuntu-Italic.woff2',
  './fonts/Ubuntu-Bold.woff2',
  './fonts/Ubuntu-BoldItalic.woff2',
  './fonts/iAWriterQuattroS-Regular.woff2',
  './fonts/iAWriterQuattroS-Italic.woff2',
  './fonts/iAWriterQuattroS-Bold.woff2',
  './fonts/iAWriterQuattroS-BoldItalic.woff2',
  './fonts/AdwaitaSans-Regular.woff2',
  './fonts/AdwaitaSans-Italic.woff2',
  './fonts/Web437_IBM_VGA_9x16-2x.woff',
];

function isLongLivedStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (!LONG_LIVED_STATIC_PATTERN.test(url.pathname)) return false;
  if (url.pathname.endsWith('/index.html')) return false;
  return url.searchParams.has('v') || url.pathname.includes('/fonts/');
}

function withLongLivedStaticHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isFirebaseCacheable(url) {
  if (!url.hostname.endsWith('.firebaseio.com')) return false;
  const p = url.pathname;
  if (p.startsWith('/users/')) return false;
  if (p.startsWith('/translations/')) return true;
  if (p.startsWith('/translationIndex')) return true;
  if (p.startsWith('/searchIndex/')) return true;
  return false;
}

function translationFromUrl(pathname) {
  const m = pathname.match(/\/translations\/([^/]+)\//);
  return m ? m[1] : null;
}

function resolveBuildId() {
  return 'd17b93a';
}

async function precacheFiles() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(
    [...PER_BOOK_PRECACHE, ...BSB_STRUCTURE_FILES].map(async (url) => {
      try {
        const cached = await cache.match(url);
        if (cached) return;
        const resp = await fetch(url);
        if (resp && resp.status === 200) {
          await cache.put(url, resp);
        }
      } catch {
        // Network unavailable — skip silently.
      }
    })
  );
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    BUILD_ID = resolveBuildId();
    CACHE_NAME = `bible-${BUILD_ID}`;
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();

    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
    for (const client of allClients) {
      client.postMessage({ type: 'NEW_BUILD', buildId: BUILD_ID });
    }

    precacheFiles();
  })());
});

self.addEventListener('message', (event) => {
  if (event.origin !== self.location.origin) return;

  if (event.data?.type === 'TRANSLATION_INSTALLED') {
    const t = event.data.translation;
    if (t && typeof t === 'string') installedTranslations.add(t);
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin &&
    !url.hostname.endsWith('.firebaseio.com') &&
    !url.hostname.endsWith('.firebase.google.com')) {
    return;
  }

  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/version.txt')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.hostname.endsWith('.firebaseio.com')) {
    if (isFirebaseCacheable(url)) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const resp = await fetch(event.request);
          if (event.request.method === 'GET' && resp && resp.status === 200) {
            cache.put(event.request, resp.clone());
          }
          return resp;
        } catch {
          return new Response('Offline', { status: 503 });
        }
      })());
    } else {
      event.respondWith(fetch(event.request));
    }
    return;
  }

  if (APP_SHELL_PATTERN.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        const response = await fetch(new Request(event.request, { cache: 'no-store' }));

        if (response.ok) {
          const cacheResponse = isLongLivedStaticAsset(url)
            ? withLongLivedStaticHeaders(response.clone())
            : response.clone();

          await cache.put(event.request, cacheResponse);
        }

        return response;
      } catch {
        const cached = await cache.match(event.request);
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  const isRoot = url.pathname === '/' || url.pathname.endsWith('/index.html');

  if (isRoot) {
    event.respondWith((async () => {
      try {
        const resp = await fetch(new Request(event.request, { cache: 'no-store' }));
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, resp.clone());
        return resp;
      } catch {
        const cached = await caches.match(event.request);
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const resp = await fetch(event.request);
      if (event.request.method === 'GET' && resp && resp.status === 200) {
        const translation = translationFromUrl(url.pathname);
        const isTranslationStructure = url.pathname.includes('_structure/');
        const allowCache = translation === null
          || installedTranslations.has(translation)
          || isTranslationStructure;
        if (allowCache) cache.put(event.request, resp.clone());
      }
      return resp;
    } catch {
      return new Response('Offline', { status: 503 });
    }
  })());
});
