const BUILD_ID = '__BUILD_ID__';
const CACHE_NAME = `lege-lux-offline-${BUILD_ID}`;
const OFFLINE_MANIFEST_URL = './offline-assets.json';

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil((async () => {
        const response = await fetch(OFFLINE_MANIFEST_URL, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Offline manifest request failed with ${response.status}.`);
        }

        const assets = await response.json();
        if (!Array.isArray(assets) || assets.some(asset => typeof asset !== 'string')) {
            throw new Error('Offline manifest must be an array of asset paths.');
        }

        const cache = await caches.open(CACHE_NAME);
        await cache.addAll([...new Set([OFFLINE_MANIFEST_URL, ...assets])]);
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter(name => name.startsWith('lege-lux-offline-') && name !== CACHE_NAME)
                .map(name => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/version.txt')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;

        try {
            const response = await fetch(event.request);
            if (response.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(event.request, response.clone());
            }
            return response;
        } catch {
            return new Response('Offline', { status: 503 });
        }
    })());
});
