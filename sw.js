// Tsumugi service worker — caches only the app shell (this repo's own files) so the app can
// open even with no connection. Everything else — the Gemini API, Google Fonts, the Tailwind
// CDN — always passes straight through to the network. Weaves should never return a stale
// cached response; if there's no connection, the app's existing "Couldn't reach Gemini" error
// handling takes over exactly as it does normally.

const CACHE_NAME = 'tsumugi-shell-v1';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only intercept same-origin requests (our own app-shell files). Cross-origin requests
    // (generativelanguage.googleapis.com, fonts.googleapis.com, cdn.tailwindcss.com) are left
    // completely alone — returning here without calling respondWith() lets the browser handle
    // them with its normal, uncached network behavior.
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).catch(() => caches.match('./index.html'));
        })
    );
});
