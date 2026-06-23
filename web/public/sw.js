/// <reference lib="webworker" />

const CACHE_NAME = "spacetimetv-v1";
const STATIC_ASSETS = ["/", "/manifest.json"];

// Install: pre-cache shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  // Activate immediately, don't wait for old tabs
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch: cache-first for static assets, network-first for API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Don't cache API requests or stream data
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/watch/")
  ) {
    return; // let browser handle normally
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Only cache successful GET responses
          if (
            response.ok &&
            event.request.method === "GET"
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline fallback: return index.html for navigation requests
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
          throw new Error("Offline");
        });
    })
  );
});
