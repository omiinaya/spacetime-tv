/**
 * Tests for useCloudBackup — cloud sync of channel favorites and watchlist.
 *
 * Uses MSW handlers (set up in test-setup.ts) to intercept fetch calls to
 * /api/cloud/backup and /api/cloud/merge.
 *
 * localStorage is tested directly (read/write of stv_channel_favorites,
 * stv_watchlist keys).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCloudBackup } from "@/hooks/useCloudBackup";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";

const FAV_KEY = "stv_channel_favorites";
const WATCHLIST_KEY = "stv_watchlist";
const SERIES_KEY = "stv_watchlist_series";
const DEVICE_KEY = "stv_device_id";

describe("useCloudBackup", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  // ── Initial state ────────────────────────────────────────────

  it("starts with no upload/download timestamps", () => {
    const { result } = renderHook(() => useCloudBackup());
    expect(result.current.backupStatus.lastUpload).toBeNull();
    expect(result.current.backupStatus.lastDownload).toBeNull();
  });

  it("starts not loading and with no error", () => {
    const { result } = renderHook(() => useCloudBackup());
    expect(result.current.backupStatus.loading).toBe(false);
    expect(result.current.backupStatus.error).toBeNull();
  });

  // ── uploadBackup ────────────────────────────────────────────

  it("uploadBackup succeeds and sets lastUpload timestamp", async () => {
    // Seed some local data
    localStorage.setItem(FAV_KEY, JSON.stringify([101, 202]));
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([1, 2]));
    localStorage.setItem(SERIES_KEY, JSON.stringify([3, 4]));

    const { result } = renderHook(() => useCloudBackup());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.uploadBackup();
    });

    expect(ok).toBe(true);
    expect(result.current.backupStatus.lastUpload).toBeGreaterThan(0);
    expect(result.current.backupStatus.loading).toBe(false);
    expect(result.current.backupStatus.error).toBeNull();
  });

  it("uploadBackup sends favorites and both watchlists", async () => {
    localStorage.setItem(FAV_KEY, JSON.stringify([101, 202]));
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([1, 2]));
    localStorage.setItem(SERIES_KEY, JSON.stringify([3, 4]));

    let sentBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/cloud/backup", async ({ request }) => {
        sentBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ status: "ok" });
      }),
    );

    const { result } = renderHook(() => useCloudBackup());
    await act(async () => {
      await result.current.uploadBackup();
    });

    expect(sentBody).not.toBeNull();
    expect(sentBody!.favorites).toEqual([101, 202]);
    expect(sentBody!.watchlist).toEqual([1, 2]);
    expect(sentBody!.series_watchlist).toEqual([3, 4]);
  });

  it("uploadBackup returns false on server error", async () => {
    // Override handler for this test to return 500
    server.use(
      http.post("/api/cloud/backup", () =>
        HttpResponse.json(
          { status: "error", detail: "Server error" },
          { status: 500 },
        ),
      ),
    );

    const { result } = renderHook(() => useCloudBackup());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.uploadBackup();
    });

    expect(ok).toBe(false);
    expect(result.current.backupStatus.error).toContain("Server error");
    expect(result.current.backupStatus.loading).toBe(false);
  });

  it("uploadBackup sets loading state during request", async () => {
    // Slow handler to observe loading state
    server.use(
      http.post("/api/cloud/backup", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ status: "ok" });
      }),
    );

    const { result } = renderHook(() => useCloudBackup());

    // Start the upload without awaiting
    result.current.uploadBackup();
    // loading should become true after React processes the update
    await waitFor(() => expect(result.current.backupStatus.loading).toBe(true));
    // Wait for the upload to complete
    await waitFor(() =>
      expect(result.current.backupStatus.loading).toBe(false),
    );
  });

  it("uploadBackup handles empty favorites gracefully", async () => {
    // No local favorites set — empty array
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify({}));

    const { result } = renderHook(() => useCloudBackup());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.uploadBackup();
    });

    expect(ok).toBe(true);
    expect(result.current.backupStatus.lastUpload).toBeGreaterThan(0);
  });

  // ── downloadBackup ──────────────────────────────────────────

  it("downloadBackup succeeds and returns favorites/watchlists", async () => {
    const { result } = renderHook(() => useCloudBackup());

    let data: {
      favorites: number[];
      watchlist: number[];
      seriesWatchlist: number[];
    } | null = null;
    await act(async () => {
      data = await result.current.downloadBackup();
    });

    expect(data).not.toBeNull();
    expect(data!.favorites).toEqual([101, 202, 303]);
    // Legacy record shape { "1": true, "2": false } is normalized to [1]
    expect(data!.watchlist).toEqual([1]);
    expect(data!.seriesWatchlist).toEqual([7, 8]);
    expect(result.current.backupStatus.lastDownload).toBeGreaterThan(0);
    expect(result.current.backupStatus.loading).toBe(false);
    expect(result.current.backupStatus.error).toBeNull();
  });

  it("downloadBackup returns null on server error", async () => {
    server.use(
      http.get("/api/cloud/backup", () =>
        HttpResponse.json(
          { status: "error", detail: "Not found" },
          { status: 404 },
        ),
      ),
    );

    const { result } = renderHook(() => useCloudBackup());

    let data: unknown = null;
    await act(async () => {
      data = await result.current.downloadBackup();
    });

    expect(data).toBeNull();
    expect(result.current.backupStatus.error).toContain("Not found");
  });

  it("downloadBackup sets loading state", async () => {
    server.use(
      http.get("/api/cloud/backup", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({
          status: "ok",
          data: { favorites: [], watchlist: [], series_watchlist: [] },
        });
      }),
    );

    const { result } = renderHook(() => useCloudBackup());

    result.current.downloadBackup();
    await waitFor(() => expect(result.current.backupStatus.loading).toBe(true));
    await waitFor(() =>
      expect(result.current.backupStatus.loading).toBe(false),
    );
  });

  // ── mergeFavorites ──────────────────────────────────────────

  it("mergeFavorites succeeds and returns merged array", async () => {
    // Seed local favorites
    localStorage.setItem(FAV_KEY, JSON.stringify([404]));

    const { result } = renderHook(() => useCloudBackup());

    let merged: number[] | null = null;
    await act(async () => {
      merged = await result.current.mergeFavorites();
    });

    // Default server merge returns [101, 202, 303, 404]
    expect(merged).toEqual([101, 202, 303, 404]);
    expect(result.current.backupStatus.lastDownload).toBeGreaterThan(0);
    expect(result.current.backupStatus.loading).toBe(false);
  });

  it("mergeFavorites returns null on server error", async () => {
    server.use(
      http.post("/api/cloud/merge", () =>
        HttpResponse.json(
          { status: "error", detail: "Merge conflict" },
          { status: 409 },
        ),
      ),
    );

    const { result } = renderHook(() => useCloudBackup());

    let merged: number[] | null = [1]; // non-null default
    await act(async () => {
      merged = await result.current.mergeFavorites();
    });
    expect(merged).toBeNull();
    expect(result.current.backupStatus.error).toContain("Merge conflict");
  });

  it("mergeFavorites sends local favorites to server", async () => {
    // Seed local favorites that the server will notice
    localStorage.setItem(FAV_KEY, JSON.stringify([100, 200]));

    let sentBody: unknown = null;
    server.use(
      http.post("/api/cloud/merge", async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ status: "ok", favorites: [100, 200, 300] });
      }),
    );

    const { result } = renderHook(() => useCloudBackup());

    await act(async () => {
      await result.current.mergeFavorites();
    });

    expect(sentBody).toHaveProperty("favorites", [100, 200]);
    expect(sentBody).toHaveProperty("device_id");
  });

  it("mergeFavorites sets loading state", async () => {
    server.use(
      http.post("/api/cloud/merge", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ status: "ok", favorites: [] });
      }),
    );

    const { result } = renderHook(() => useCloudBackup());

    result.current.mergeFavorites();
    await waitFor(() => expect(result.current.backupStatus.loading).toBe(true));
    await waitFor(() =>
      expect(result.current.backupStatus.loading).toBe(false),
    );
  });

  // ── Error state reset ───────────────────────────────────────

  it("error resets on new successful upload", async () => {
    // First make it fail
    server.use(
      http.post("/api/cloud/backup", () =>
        HttpResponse.json({ status: "error", detail: "Fail" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useCloudBackup());

    await act(async () => {
      await result.current.uploadBackup();
    });
    expect(result.current.backupStatus.error).toContain("Fail");

    // Reset handler so next call succeeds
    server.resetHandlers();

    await act(async () => {
      await result.current.uploadBackup();
    });
    expect(result.current.backupStatus.error).toBeNull();
    expect(result.current.backupStatus.lastUpload).toBeGreaterThan(0);
  });

  it("timestamp updates on repeated uploads", async () => {
    const { result } = renderHook(() => useCloudBackup());

    await act(async () => {
      await result.current.uploadBackup();
    });
    const t1 = result.current.backupStatus.lastUpload;

    // Wait a bit so timestamp is different
    await new Promise((r) => setTimeout(r, 10));

    await act(async () => {
      await result.current.uploadBackup();
    });
    const t2 = result.current.backupStatus.lastUpload;

    expect(t2).toBeGreaterThan(t1!);
  });

  // ── Network failure ─────────────────────────────────────────

  it("handles network failure on download", async () => {
    server.use(
      http.get(
        "/api/cloud/backup",
        () => HttpResponse.error(), // Simulates network error
      ),
    );

    const { result } = renderHook(() => useCloudBackup());

    let data: unknown = "non-null";
    await act(async () => {
      data = await result.current.downloadBackup();
    });
    expect(data).toBeNull();
    expect(result.current.backupStatus.error).toBeTruthy();
  });

  it("handles network failure on upload", async () => {
    server.use(http.post("/api/cloud/backup", () => HttpResponse.error()));

    const { result } = renderHook(() => useCloudBackup());

    let ok = true;
    await act(async () => {
      ok = await result.current.uploadBackup();
    });
    expect(ok).toBe(false);
    expect(result.current.backupStatus.error).toBeTruthy();
  });
});
