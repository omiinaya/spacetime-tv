/// <reference lib="webworker" />

const CACHE_NAME = "spacetimetv-v4";
const STATIC_ASSETS = ["/", "/manifest.json"];

// TMDB image base URLs to pre-cache
const TMDB_IMAGE_ORIGINS = [
  "https://image.tmdb.org",
  "https://www.themoviedb.org",
];

// Cache limits
const API_CACHE_MAX_ENTRIES = 100;
const IMAGE_CACHE_MAX_ENTRIES = 200;

// Paths that stream media (infinite live streams, large VOD remuxes,
// manifest playlists, subtitles, raw IPTV proxies). These MUST bypass the
// service worker entirely: `clone.blob()` on an infinite StreamingResponse
// never resolves (live TV hangs on "loading") and on a multi-GB VOD remux
// buffers the whole file in memory. The browser/player handles them
// directly — the SW only ever intercepts JSON API + static assets.
const STREAM_PATH_PREFIXES = [
  "/api/stream/",
  "/api/media/",
  "/api/iptv/",
  "/api/movie/hls/",
  "/api/series/hls/",
  "/api/v1/stream/",
  "/api/v1/media/",
  "/api/v1/iptv/",
  "/api/v1/movie/hls/",
  "/api/v1/series/hls/",
];

// Install: pre-cache shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  // Activate immediately, don't wait for old tabs
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ── Background sync for watch progress ────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-watch-progress") {
    event.waitUntil(flushPendingProgress());
  }
});

/**
 * Flush pending watch progress from IndexedDB to the server.
 * Used by the 'sync-watch-progress' background sync event and
 * also callable directly from client pages when connectivity returns.
 */
async function flushPendingProgress() {
  try {
    const cache = await caches.open(CACHE_NAME);
    // Read pending queue from a dedicated cache entry
    const queueRequest = new Request("/__sw/pending-progress");
    const cached = await cache.match(queueRequest);
    if (!cached) return;

    const pending = await cached.json();
    if (!Array.isArray(pending) || pending.length === 0) return;

    const results = await Promise.allSettled(
      pending.map((entry) =>
        fetch("/api/watchlist/sync-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        }),
      ),
    );

    // Remove successfully synced entries
    const remaining = pending.filter(
      (_, i) => results[i].status === "rejected",
    );

    if (remaining.length > 0) {
      await cache.put(queueRequest, new Response(JSON.stringify(remaining)));
    } else {
      await cache.delete(queueRequest);
    }
  } catch {
    // Silently degrade — entries remain in cache for next sync attempt
  }
}

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
 * Derive a cache key that isolates per-profile API data.
 * The backend is multi-profile (X-Profile-Token header) and Cache.match
 * ignores request headers, so two profiles hitting the same GET URL share
 * one entry — profile B could receive profile A's watchlist/history offline.
 * Append a short hash of the profile token (plus device token as a generic
 * fallback) to the URL; identical requests within one profile still hit the
 * same entry, different profiles never collide.
 */
function apiCacheKey(request) {
  const profile = request.headers.get("X-Profile-Token");
  const device = request.headers.get("X-Device-Token");
  const scope = profile || device;
  if (!scope) return request;
  // Simple 32-bit FNV-1a hash of the token — never store the token itself.
  let h = 0x811c9dc5;
  for (let i = 0; i < scope.length; i++) {
    h ^= scope.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const url = new URL(request.url);
  url.searchParams.set("__swp", h.toString(36));
  return new Request(url.toString(), { method: request.method });
}

/**
 * Network-first strategy: try the network, fall back to cache on failure.
 * Good for API responses where freshness is preferred but stale is acceptable.
 */
async function networkFirst(event, maxEntries = API_CACHE_MAX_ENTRIES) {
  const cache = await caches.open(CACHE_NAME);
  const key = apiCacheKey(event.request);

  try {
    const response = await fetch(event.request);

    if (response.ok && event.request.method === "GET") {
      // Only cache JSON-ish API payloads. Media bodies (HLS segments, MP4
      // ranges, subtitles) must not be buffered here.
      const ctype = (response.headers.get("content-type") || "").toLowerCase();
      if (
        ctype.includes("json") ||
        ctype.includes("text") ||
        ctype.includes("xml") ||
        ctype.includes("javascript") ||
        !ctype
      ) {
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
        await cache.put(key, cachedResponse);
        await trimCache(CACHE_NAME, maxEntries);
      }
    }

    return response;
  } catch (err) {
    // Offline: fall back to cache
    const cached = await cache.match(key);
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
async function staleWhileRevalidate(
  event,
  maxEntries = IMAGE_CACHE_MAX_ENTRIES,
) {
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

  // ── Navigation requests: ALWAYS network-first ──────────────────────
  // The SPA shell (index.html) is NOT content-hashed, so caching it
  // cache-first means every deploy shows a stale build forever — the
  // browser never even sees the server's Cache-Control headers because
  // the SW intercepts first. networkFirst() revalidates the shell on
  // every navigation (updating the offline fallback) while still
  // serving the cached shell offline. This is the #1 fix for the
  // "UI still broken after deploy" class of bug.
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event));
    return;
  }

  // ── Media/stream paths: NEVER intercept ───────────────────────────
  // Live TV is an infinite HTTP stream; VOD remux can be gigabytes.
  // Buffering either in the SW (clone.blob()) hangs playback or exhausts
  // memory. Pass straight to the browser/player — no caching, no buffering.
  if (STREAM_PATH_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    return;
  }

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
