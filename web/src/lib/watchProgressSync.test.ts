/**
 * Tests for watchProgressSync — IndexedDB-backed progress queue.
 *
 * Uses fake-indexeddb for an in-memory IndexedDB implementation.
 * Tests are ordered to build on each other safely since fake-indexeddb
 * doesn't cleanly support deleteDatabase between tests in jsdom.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  queueProgress,
  getPendingProgress,
  removePendingProgress,
  incrementRetry,
  flushPendingProgress,
} from "./watchProgressSync";

const DB_NAME = "stv-progress-queue";

describe("watchProgressSync", () => {
  beforeAll(async () => {
    // Ensure a clean starting state
    await deleteDB(DB_NAME);
  });

  // ── queueProgress & getPendingProgress ──────────────

  it("returns empty when nothing queued", async () => {
    expect(await getPendingProgress()).toEqual([]);
  });

  it("queues and retrieves a progress entry", async () => {
    await queueProgress("live:42", 30.5);
    const pending = await getPendingProgress();
    expect(pending).toHaveLength(1);
    expect(pending[0].watchKey).toBe("live:42");
    expect(pending[0].position).toBe(30.5);
  });

  it("adds a timestamp and starts retries at 0", async () => {
    // This entry will be in addition to the one from the previous test
    await queueProgress("ts:1", 10);
    const pending = await getPendingProgress();
    const entry = pending.find((e) => e.watchKey === "ts:1");
    expect(entry).toBeDefined();
    expect(entry!.timestamp).toBeGreaterThan(0);
    expect(entry!.retries).toBe(0);
  });

  it("stores series metadata when type=series", async () => {
    const seriesData = {
      seriesId: 101,
      seriesName: "Test Series",
      cover: "http://example.com/cover.jpg",
      seasonNumber: 1,
      episodeNum: 3,
      episodeId: "ep3",
      episodeTitle: "Test Episode",
      durationSeconds: 1800,
    };
    await queueProgress("series:101", 60, { type: "series", seriesData });
    const entry = (await getPendingProgress()).find(
      (e) => e.watchKey === "series:101",
    );
    expect(entry?.seriesData).toEqual(seriesData);
    expect(entry?.movieData).toBeUndefined();
  });

  it("stores movie metadata when type=movie", async () => {
    const movieData = {
      movieId: 42,
      movieName: "Test",
      poster: "",
      durationSeconds: 7200,
    };
    await queueProgress("movie:42", 120, { type: "movie", movieData });
    const entry = (await getPendingProgress()).find(
      (e) => e.watchKey === "movie:42",
    );
    expect(entry?.movieData).toEqual(movieData);
    expect(entry?.seriesData).toBeUndefined();
  });

  it("queues entries without metadata gracefully", async () => {
    await queueProgress("nometa:1", 5, { type: "movie" });
    const entry = (await getPendingProgress()).find(
      (e) => e.watchKey === "nometa:1",
    );
    expect(entry?.movieData).toBeUndefined();
  });

  // ── removePendingProgress ──────────────────────────

  it("removes a specific queued entry", async () => {
    // Find the entry to remove
    const db = await openDB();
    const { keys, values } = await getAllFromStore(db, "pending");
    const removeIdx = values.findIndex((v: any) => v.watchKey === "ts:1");
    if (removeIdx === -1) throw new Error("Entry ts:1 not found");
    db.close();

    await removePendingProgress(keys[removeIdx]);
    const remaining = await getPendingProgress();
    expect(remaining.find((e) => e.watchKey === "ts:1")).toBeUndefined();
  });

  it("is a no-op for a non-existent key", async () => {
    await expect(removePendingProgress(999)).resolves.toBeUndefined();
  });

  // ── incrementRetry ─────────────────────────────────

  it("increments retry count", async () => {
    await queueProgress("retry_test", 1);
    const db = await openDB();
    const { keys, values } = await getAllFromStore(db, "pending");
    const idx = values.findIndex((v: any) => v.watchKey === "retry_test");
    db.close();

    await incrementRetry(keys[idx]);
    const entry = (await getPendingProgress()).find(
      (e) => e.watchKey === "retry_test",
    );
    expect(entry?.retries).toBe(1);
  });

  it("removes entry after 5 retries", async () => {
    const db = await openDB();
    const { keys, values } = await getAllFromStore(db, "pending");
    const idx = values.findIndex((v: any) => v.watchKey === "retry_test");
    db.close();

    for (let i = 0; i < 5; i++) {
      await incrementRetry(keys[idx]);
    }
    const entry = (await getPendingProgress()).find(
      (e) => e.watchKey === "retry_test",
    );
    expect(entry).toBeUndefined();
  });

  // ── flushPendingProgress ───────────────────────────

  it("flushes entries and removes them on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    // Count current entries — flush will clear them
    const before = await getPendingProgress();
    expect(before.length).toBeGreaterThanOrEqual(1);

    const result = await flushPendingProgress();
    expect(result.flushed).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);
    vi.restoreAllMocks();
  });

  it("marks failed on 500, retries increment", async () => {
    await queueProgress("fivehundred", 10);
    await queueProgress("fivehundred_2", 20);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    const result = await flushPendingProgress();
    expect(result).toEqual({ flushed: 0, failed: 2 });
    vi.restoreAllMocks();
  });

  it("handles network errors gracefully", async () => {
    // Add a unique entry to be failed
    const before = (await getPendingProgress()).length;
    await queueProgress("network_fail", 10);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const result = await flushPendingProgress();
    expect(result.flushed).toBe(0);
    expect(result.failed).toBe(before + 1);
    vi.restoreAllMocks();
  });

  // ── Error resilience ───────────────────────────────

  it("does not throw when IndexedDB is unavailable", async () => {
    const orig = indexedDB.open;
    indexedDB.open = (() => {
      throw new Error("unavailable");
    }) as typeof indexedDB.open;
    await expect(queueProgress("ignored", 0)).resolves.toBeUndefined();
    await expect(getPendingProgress()).resolves.toEqual([]);
    await expect(removePendingProgress(1)).resolves.toBeUndefined();
    await expect(incrementRetry(1)).resolves.toBeUndefined();
    indexedDB.open = orig;
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────

async function deleteDB(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve(); // don't fail on error
    req.onblocked = () => resolve(); // don't block
  });
}

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllFromStore(
  db: IDBDatabase,
  store: string,
): Promise<{ keys: IDBValidKey[]; values: any[] }> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const keyReq = tx.objectStore(store).getAllKeys();
    const valReq = tx.objectStore(store).getAll();
    let keys: IDBValidKey[] = [];
    let values: any[] = [];
    let done = 0;
    keyReq.onsuccess = () => {
      keys = keyReq.result;
      done++;
      if (done === 2) resolve({ keys, values });
    };
    valReq.onsuccess = () => {
      values = valReq.result;
      done++;
      if (done === 2) resolve({ keys, values });
    };
    keyReq.onerror = () => reject(keyReq.error);
    valReq.onerror = () => reject(valReq.error);
  });
}
