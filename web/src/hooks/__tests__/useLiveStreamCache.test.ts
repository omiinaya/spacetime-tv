/**
 * Tests for useLiveStreamCache — sessionStorage-backed cache for LiveTV
 * categories and all-streams slim list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLiveStreamCache } from "@/hooks/useLiveStreamCache";
import type { Category, LiveStream } from "@/lib/types";

function makeCategory(id: string, name: string): Category {
  return { category_id: id, category_name: name, parent_id: 0 };
}

function makeStream(id: number, name: string, catId: string): LiveStream {
  return {
    stream_id: id,
    name,
    category_id: catId,
    num: 0,
    stream_type: "live",
    stream_icon: "",
    epg_channel_id: "",
    added: "",
    is_adult: 0,
    category_ids: [catId],
    custom_sid: null,
    tv_archive: 0,
    direct_source: "",
    tv_archive_duration: 0,
  };
}

const CATS_KEY = "stv_live_cats";
const SLIM_ALL_KEY = "stv_live_all_slim";

describe("useLiveStreamCache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("starts with loading true and empty data when no cache exists", () => {
    const { result } = renderHook(() => useLiveStreamCache());

    expect(result.current.loading).toBe(true);
    expect(result.current.allLoading).toBe(true);
    expect(result.current.categories).toEqual([]);
    expect(result.current.allStreams).toEqual([]);
  });

  it("restores categories from sessionStorage when cache is fresh", () => {
    const cats = [makeCategory("1", "News")];
    sessionStorage.setItem(
      CATS_KEY,
      JSON.stringify({ categories: cats, ts: Date.now() }),
    );

    const { result } = renderHook(() => useLiveStreamCache());

    expect(result.current.loading).toBe(false);
    expect(result.current.categories).toEqual(cats);
  });

  it("ignores expired category cache", () => {
    const cats = [makeCategory("1", "Old News")];
    // 16 minutes ago (over 15 min TTL)
    sessionStorage.setItem(
      CATS_KEY,
      JSON.stringify({ categories: cats, ts: Date.now() - 960_000 }),
    );

    const { result } = renderHook(() => useLiveStreamCache());

    expect(result.current.loading).toBe(true);
    expect(result.current.categories).toEqual([]);
  });

  it("ignores malformed category cache", () => {
    sessionStorage.setItem(CATS_KEY, "bad-json");

    const { result } = renderHook(() => useLiveStreamCache());

    expect(result.current.loading).toBe(true);
    expect(result.current.categories).toEqual([]);
  });

  it("restores all-streams from sessionStorage when cache is fresh", () => {
    const streams = [makeStream(1, "CNN", "1")];
    // Save in slim format (what saveAllStreams writes)
    const slimData = {
      a: streams.map((s) => ({
        id: s.stream_id,
        n: s.name,
        c: s.category_id,
      })),
      ts: Date.now(),
    };
    sessionStorage.setItem(SLIM_ALL_KEY, JSON.stringify(slimData));

    const { result } = renderHook(() => useLiveStreamCache());

    expect(result.current.allLoading).toBe(false);
    expect(result.current.allStreams.length).toBe(1);
    expect(result.current.allStreams[0].name).toBe("CNN");
    expect(result.current.allStreams[0].stream_id).toBe(1);
  });

  it("ignores expired all-streams cache", () => {
    const streams = [makeStream(1, "CNN", "1")];
    const slimData = {
      a: streams.map((s) => ({
        id: s.stream_id,
        n: s.name,
        c: s.category_id,
      })),
      ts: Date.now() - 960_000, // 16 min ago
    };
    sessionStorage.setItem(SLIM_ALL_KEY, JSON.stringify(slimData));

    const { result } = renderHook(() => useLiveStreamCache());

    expect(result.current.allLoading).toBe(true);
    expect(result.current.allStreams).toEqual([]);
  });

  it("saveCategories sets state and saves to sessionStorage", () => {
    const { result } = renderHook(() => useLiveStreamCache());
    const cats = [makeCategory("1", "Sports"), makeCategory("2", "Movies")];

    act(() => result.current.setCategories(cats));

    expect(result.current.categories).toEqual(cats);

    // Verify sessionStorage
    const stored = JSON.parse(sessionStorage.getItem(CATS_KEY)!);
    expect(stored.categories).toEqual(cats);
    expect(typeof stored.ts).toBe("number");
  });

  it("saveCategories does not save empty array to storage", () => {
    const { result } = renderHook(() => useLiveStreamCache());

    act(() => result.current.setCategories([]));

    expect(result.current.categories).toEqual([]);
    expect(sessionStorage.getItem(CATS_KEY)).toBeNull();
  });

  it("saveAllStreams sets state and saves slim format to sessionStorage", () => {
    const { result } = renderHook(() => useLiveStreamCache());
    const streams = [makeStream(10, "BBC", "3"), makeStream(20, "NBC", "3")];

    act(() => result.current.setAllStreams(streams));

    expect(result.current.allStreams).toEqual(streams);

    // Verify sessionStorage has slim format
    const stored = JSON.parse(sessionStorage.getItem(SLIM_ALL_KEY)!);
    expect(stored.a).toEqual([
      { id: 10, n: "BBC", c: "3" },
      { id: 20, n: "NBC", c: "3" },
    ]);
    expect(typeof stored.ts).toBe("number");
  });

  it("saveAllStreams does not save empty array to storage", () => {
    const { result } = renderHook(() => useLiveStreamCache());

    act(() => result.current.setAllStreams([]));

    expect(result.current.allStreams).toEqual([]);
    expect(sessionStorage.getItem(SLIM_ALL_KEY)).toBeNull();
  });

  it("setLoading and setAllLoading update loading states", () => {
    const { result } = renderHook(() => useLiveStreamCache());

    act(() => result.current.setLoading(false));
    expect(result.current.loading).toBe(false);

    act(() => result.current.setAllLoading(false));
    expect(result.current.allLoading).toBe(false);
  });

  it("handles storage quota errors gracefully on save", () => {
    const { result } = renderHook(() => useLiveStreamCache());

    // Patch saveCategories to make the sessionStorage call throw
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      throw new Error("QuotaExceededError");
    });

    // State should be set even though storage write fails
    const cats = [makeCategory("1", "News")];
    act(() => {
      result.current.setCategories(cats);
    });
    expect(result.current.categories).toEqual(cats);

    const streams = [makeStream(1, "CNN", "1")];
    act(() => {
      result.current.setAllStreams(streams);
    });
    expect(result.current.allStreams).toEqual(streams);

    Storage.prototype.setItem = origSetItem;
  });
});
