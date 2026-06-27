/**
 * IndexedDB-backed queue for pending watch progress updates.
 *
 * When the device is offline, progress saves are queued here instead
 * of being written directly to localStorage (which has no server
 * persistence). When online, the queue is flushed via the service
 * worker's SyncManager or directly via fetch.
 *
 * Database: "stv-progress-queue"
 * Store:    "pending" (auto-incrementing keys)
 * Schema:   { watchKey, seriesData?, movieData?, timestamp, retries }
 */

const DB_NAME = "stv-progress-queue";
const DB_VERSION = 1;
const STORE_NAME = "pending";
const MAX_RETRIES = 5;
const FLUSH_ENDPOINT = "/api/watchlist/sync-progress";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface PendingProgress {
  watchKey: string;
  position: number;
  seriesData?: {
    seriesId: number;
    seriesName: string;
    cover: string;
    seasonNumber: number;
    episodeNum: number;
    episodeId: string;
    episodeTitle: string;
    durationSeconds: number;
  };
  movieData?: {
    movieId: number;
    movieName: string;
    poster: string;
    durationSeconds: number;
  };
  timestamp: number;
  retries: number;
}

/**
 * Queue a progress update for background sync.
 * Falls back to a no-op if IndexedDB is unavailable.
 */
export async function queueProgress(
  watchKey: string,
  position: number,
  metadata?: {
    type: "series" | "movie";
    seriesData?: PendingProgress["seriesData"];
    movieData?: PendingProgress["movieData"];
  }
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const entry: PendingProgress = {
      watchKey,
      position,
      timestamp: Date.now(),
      retries: 0,
    };
    if (metadata) {
      if (metadata.type === "series") entry.seriesData = metadata.seriesData;
      if (metadata.type === "movie") entry.movieData = metadata.movieData;
    }

    store.add(entry);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable — silently degrade (localStorage path still works)
  }
}

/**
 * Get all pending progress entries.
 */
export async function getPendingProgress(): Promise<PendingProgress[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/**
 * Remove a queued entry by its ID (the auto-increment key).
 */
export async function removePendingProgress(id: IDBValidKey): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silently fail
  }
}

/**
 * Increment retry count for an entry. Removes it if max retries exceeded.
 */
export async function incrementRetry(id: IDBValidKey): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const entry: PendingProgress | undefined = request.result;
      if (!entry) return;
      entry.retries = (entry.retries || 0) + 1;
      if (entry.retries >= MAX_RETRIES) {
        store.delete(id);
      } else {
        store.put(entry, id);
      }
    };
  } catch {
    // silently fail
  }
}

/**
 * Flush all pending progress entries to the server.
 * Called by the service worker's sync event or directly when online.
 */
export async function flushPendingProgress(): Promise<{ flushed: number; failed: number }> {
  const pending = await getPendingProgress();
  if (pending.length === 0) return { flushed: 0, failed: 0 };

  let flushed = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      const response = await fetch(FLUSH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });

      if (response.ok) {
        // We can't easily get the auto-increment key from getAll(),
        // so re-query by matching timestamp+watchKey
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const allRequest = store.getAll();
        const keysRequest = store.getAllKeys();

        const [all, keys] = await Promise.all([
          new Promise<PendingProgress[]>((resolve) => {
            allRequest.onsuccess = () => resolve(allRequest.result);
          }),
          new Promise<IDBValidKey[]>((resolve) => {
            keysRequest.onsuccess = () => resolve(keysRequest.result);
          }),
        ]);

        const idx = all.findIndex(
          (e) => e.watchKey === entry.watchKey && e.timestamp === entry.timestamp
        );
        if (idx !== -1 && keys[idx] !== undefined) {
          store.delete(keys[idx]);
        }
        flushed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { flushed, failed };
}
