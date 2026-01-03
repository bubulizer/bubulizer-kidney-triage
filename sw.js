// sw.js — minimal service worker for offline app shell
const CACHE = "bubulizer-kidney-triage-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./charts.js",
  "./timeline.js",
  "./gpt-bridge.js",
  "./site.webmanifest",
  "./favicon.ico",
  "./favicon.svg",
  "./favicon-96x96.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(e.request);
    } catch {
      return cached || new Response("Offline. Please reconnect.", { status: 200 });
    }
  })());
});
