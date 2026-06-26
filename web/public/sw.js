/// <reference lib="webworker" />

const CACHE_NAME = "spacetimetv-v2";
const STATIC_ASSETS = ["/", "/manifest.json"];

// TMDB image base URLs to pre-cache
const TMDB_IMAGE_ORIGINS = [
  "https://image.tmdb.org",
  "https://www.themoviedb.org",
];

// Cache limits
const API_CACHE_MAX_ENTRIES = 100;
const IMAGE_CACHE_MAX_ENTRIES = 200;

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

/**
 * Evict oldest entries from a cache when it exceeds the limit.
 */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  if (requests.length <= maxEntries) return;

  // Sort by response timestamp (stored as custom header) if available,
  // or just delete the first N entries
  const toDelete = requests.slice(0, requests.length - maxEntries);
  await Promise.all(toDelete.map((req) => cache.delete(req)));
}

/**
 * Network-first strategy: try the network, fall back to cache on failure.
 * Good for API responses where freshness is preferred but stale is acceptable.
 */
async function networkFirst(event, maxEntries = API_CACHE_MAX_ENTRIES) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(event.request);

    if (response.ok && event.request.method === "GET") {
      // Clone and store in cache
      const clone = response.clone();
      // Attach a timestamp header for eviction ordering
      const headers = new Headers(clone.headers);
      headers.set("X-SW-Cached-At", Date.now().toString());
      const cachedResponse = new Response(await clone.blob(), {
        status: clone.status,
        statusText: clone.statusText,
        headers,
      });
      await cache.put(event.request, cachedResponse);
      await trimCache(CACHE_NAME, maxEntries);
    }

    return response;
  } catch (err) {
    // Offline: fall back to cache
    const cached = await cache.match(event.request);
    if (cached) {
      return cached;
    }

    // For navigation, return the shell
    if (event.request.mode === "navigate") {
      const shell = await cache.match("/");
      if (shell) return shell;
    }

    throw err;
  }
}

/**
 * Cache-first strategy: return cached if available, else fetch and cache.
 * Good for immutable or rarely-changing static assets.
 */
async function cacheFirst(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);
  if (cached) return cached;

  const response = await fetch(event.request);
  if (response.ok && event.request.method === "GET") {
    const clone = response.clone();
    await cache.put(event.request, clone);
  }
  return response;
}

/**
 * Stale-while-revalidate: return cached immediately, then update cache in background.
 * Good for TMDB images that are large and slow.
 */
async function staleWhileRevalidate(event, maxEntries = IMAGE_CACHE_MAX_ENTRIES) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);

  const fetchPromise = fetch(event.request)
    .then((response) => {
      if (response.ok && event.request.method === "GET") {
        const clone = response.clone();
        cache.put(event.request, clone);
        trimCache(CACHE_NAME, maxEntries);
      }
      return response;
    })
    .catch(() => cached); // If fetch fails, return cached (or undefined)

  return cached || (await fetchPromise);
}

// Fetch: routing by request type
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ── API endpoints: network-first with cache fallback ──────────────
  if (url.pathname.startsWith("/api/")) {
    // Only cache GET requests to avoid mutating state on replay
    if (event.request.method !== "GET") return;

    event.respondWith(networkFirst(event));
    return;
  }

  // ── TMDB image requests: stale-while-revalidate ─────────────────
  if (
    TMDB_IMAGE_ORIGINS.some((origin) => url.origin === origin) &&
    event.request.method === "GET"
  ) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  // ── Stream / watch paths: never cache ────────────────────────────
  if (url.pathname.startsWith("/watch/")) {
    return; // let browser handle normally (media streams)
  }

  // ── Static assets (JS, CSS, fonts, images): cache-first ──────────
  event.respondWith(cacheFirst(event));
});
