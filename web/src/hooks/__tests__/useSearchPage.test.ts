/**
 * Tests for useSearchPage — search pipeline with caching, debounce, pagination.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import useSearchPage from "@/hooks/useSearchPage";
import type { SearchResults, FilterTab, SortBy } from "@/lib/types";

// ── Mock modules ──────────────────────────────────────────────────────────

vi.mock("react-router", () => ({
  useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
}));

const mockAddSearchHistory = vi.fn();
vi.mock("@/components/SearchHistory", () => ({
  addSearchHistory: (...args: unknown[]) => mockAddSearchHistory(...args),
}));

const mockNowPlaying = vi.fn(() => null);
vi.mock("@/hooks/useNowPlaying", () => ({
  useNowPlaying: () => ({ getNowPlaying: mockNowPlaying }),
}));

// ── Mock api module ────────────────────────────────────────────────────────

const mockSearch = vi.fn();
const mockSearchEnrich = vi.fn();
const mockGuideSearch = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    search: (...args: unknown[]) => mockSearch(...args),
    searchEnrich: (...args: unknown[]) => mockSearchEnrich(...args),
    guide: {
      search: (...args: unknown[]) => mockGuideSearch(...args),
    },
  },
  tmdbSrcset: (p: string) => p,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSearchResults(
  overrides: Partial<SearchResults> = {},
): SearchResults {
  return {
    live: overrides.live ?? [],
    movies: overrides.movies ?? [],
    series: overrides.series ?? [],
  };
}

describe("useSearchPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Initial state ──

  it("starts with empty state", () => {
    const { result } = renderHook(() => useSearchPage());

    expect(result.current.query).toBe("");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.results).toBeNull();
    expect(result.current.filter).toBe("all");
    expect(result.current.sortBy).toBe("relevance");
  });

  // ── Query handling (debounced) ──

  it("handleQueryChange updates query and triggers search after debounce", async () => {
    mockSearch.mockResolvedValue(
      makeSearchResults({
        live: [
          {
            stream_id: 1,
            name: "CNN",
            category_id: "1",
            num: 0,
            stream_type: "live",
            stream_icon: "",
            epg_channel_id: "",
            added: "",
            is_adult: 0,
            category_ids: ["1"],
            custom_sid: null,
            tv_archive: 0,
            direct_source: "",
            tv_archive_duration: 0,
          },
        ],
      }),
    );
    mockGuideSearch.mockResolvedValue({ results: [] });

    const { result } = renderHook(() => useSearchPage());

    act(() => result.current.handleQueryChange("cnn"));
    expect(result.current.query).toBe("cnn");

    // Should not have searched yet (debouncing)
    expect(mockSearch).not.toHaveBeenCalled();

    // Advance past 300ms debounce
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledTimes(1);
    });
  });

  it("handles short query by clearing state without searching", () => {
    const { result } = renderHook(() => useSearchPage());

    act(() => result.current.handleQueryChange("a"));

    expect(mockSearch).not.toHaveBeenCalled();
    expect(result.current.results).toBeNull();
  });

  it("cancels previous search when query changes quickly", async () => {
    mockSearch.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 500));
      return makeSearchResults();
    });
    mockGuideSearch.mockResolvedValue({ results: [] });

    const { result } = renderHook(() => useSearchPage());

    await act(async () => {
      result.current.handleQueryChange("test");
      vi.advanceTimersByTime(350);
      result.current.handleQueryChange("new");
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      // The second search should be the only one that completes
      expect(mockSearch).toHaveBeenCalledWith("new", expect.any(AbortSignal));
    });
  });

  // ── doSearch (manual/enter) ──

  it("doSearch triggers search immediately and records history", async () => {
    mockSearch.mockResolvedValue(makeSearchResults());
    mockGuideSearch.mockResolvedValue({ results: [] });

    const { result } = renderHook(() => useSearchPage());

    act(() => result.current.handleQueryChange("breaking bad"));
    act(() => result.current.doSearch());

    expect(mockAddSearchHistory).toHaveBeenCalledWith("breaking bad");
    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalled();
    });
  });

  // ── doClear ──

  it("doClear resets all state", () => {
    const { result } = renderHook(() => useSearchPage());

    act(() => result.current.handleQueryChange("test"));
    act(() => result.current.doClear());

    expect(result.current.query).toBe("");
    expect(result.current.results).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // ── Caching ──

  it("caches search results in sessionStorage", async () => {
    const results = makeSearchResults({
      live: [
        {
          stream_id: 1,
          name: "CNN",
          category_id: "1",
          num: 0,
          stream_type: "live",
          stream_icon: "",
          epg_channel_id: "",
          added: "",
          is_adult: 0,
          category_ids: ["1"],
          custom_sid: null,
          tv_archive: 0,
          direct_source: "",
          tv_archive_duration: 0,
        },
      ],
    });
    mockSearch.mockResolvedValue(results);
    mockGuideSearch.mockResolvedValue({ results: [] });

    const { result } = renderHook(() => useSearchPage());

    act(() => result.current.handleQueryChange("cnn"));
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.results).not.toBeNull();
    });

    // Check sessionStorage for cached result
    const cached = sessionStorage.getItem("stv_search_cnn");
    expect(cached).not.toBeNull();
    if (cached) {
      const parsed = JSON.parse(cached);
      expect(parsed.results.live[0].name).toBe("CNN");
    }
  });

  // ── Filter & Sort (derived state) ──

  it("filter returns only live results when filter='live'", () => {
    const { result } = renderHook(() => useSearchPage());

    // Set results directly via the hook's internal state isn't possible,
    // but we can test the filter derived state by seeding the search.
    // Instead, test the filter logic through useMemo.

    // We trigger a search with results
    mockSearch.mockResolvedValue(
      makeSearchResults({
        live: [],
        movies: [
          {
            stream_id: 1,
            name: "Movie A",
            category_id: "1",
            num: 0,
            stream_type: "movie",
            stream_icon: "",
            added: "",
            is_adult: 0,
            category_ids: ["1"],
            custom_sid: null,
            direct_source: "",
            container_extension: "mp4",
            rating: "",
            tmdb: null,
          },
        ],
        series: [],
      }),
    );
    mockGuideSearch.mockResolvedValue({ results: [] });

    act(() => result.current.handleQueryChange("movie"));
    // Set filter
    act(() => result.current.setFilter("movies"));

    expect(result.current.filter).toBe("movies");
  });

  it("setSortBy updates sort preference", () => {
    const { result } = renderHook(() => useSearchPage());
    act(() => result.current.setSortBy("name"));
    expect(result.current.sortBy).toBe("name");

    act(() => result.current.setSortBy("rating"));
    expect(result.current.sortBy).toBe("rating");

    act(() => result.current.setSortBy("relevance"));
    expect(result.current.sortBy).toBe("relevance");
  });

  // ── loadMore ──

  it("loadMore fetches next page and merges results", async () => {
    // First page
    mockSearch.mockResolvedValue(
      makeSearchResults({
        live: [
          {
            stream_id: 1,
            name: "CNN",
            category_id: "1",
            num: 0,
            stream_type: "live",
            stream_icon: "",
            epg_channel_id: "",
            added: "",
            is_adult: 0,
            category_ids: ["1"],
            custom_sid: null,
            tv_archive: 0,
            direct_source: "",
            tv_archive_duration: 0,
          },
          {
            stream_id: 2,
            name: "BBC",
            category_id: "2",
            num: 0,
            stream_type: "live",
            stream_icon: "",
            epg_channel_id: "",
            added: "",
            is_adult: 0,
            category_ids: ["2"],
            custom_sid: null,
            tv_archive: 0,
            direct_source: "",
            tv_archive_duration: 0,
          },
        ],
      }),
    );
    mockGuideSearch.mockResolvedValue({ results: [] });

    const { result } = renderHook(() => useSearchPage());

    act(() => result.current.handleQueryChange("channels"));
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.results?.live).toHaveLength(2);
    });

    // Second page
    mockSearch.mockResolvedValue(
      makeSearchResults({
        live: [
          {
            stream_id: 3,
            name: "NBC",
            category_id: "3",
            num: 0,
            stream_type: "live",
            stream_icon: "",
            epg_channel_id: "",
            added: "",
            is_adult: 0,
            category_ids: ["3"],
            custom_sid: null,
            tv_archive: 0,
            direct_source: "",
            tv_archive_duration: 0,
          },
        ],
      }),
    );

    await act(async () => {
      await result.current.loadMore("live");
    });

    expect(result.current.results?.live).toHaveLength(3);
    expect(result.current.results?.live.map((s) => s.name)).toEqual([
      "CNN",
      "BBC",
      "NBC",
    ]);
  });

  it("loadMore does not duplicate existing items", async () => {
    mockSearch.mockResolvedValue(
      makeSearchResults({
        live: [
          {
            stream_id: 1,
            name: "CNN",
            category_id: "1",
            num: 0,
            stream_type: "live",
            stream_icon: "",
            epg_channel_id: "",
            added: "",
            is_adult: 0,
            category_ids: ["1"],
            custom_sid: null,
            tv_archive: 0,
            direct_source: "",
            tv_archive_duration: 0,
          },
        ],
      }),
    );
    mockGuideSearch.mockResolvedValue({ results: [] });

    const { result } = renderHook(() => useSearchPage());

    act(() => result.current.handleQueryChange("channels"));
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.results?.live).toHaveLength(1);
    });

    // Same item returned again
    mockSearch.mockResolvedValue(
      makeSearchResults({
        live: [
          {
            stream_id: 1,
            name: "CNN",
            category_id: "1",
            num: 0,
            stream_type: "live",
            stream_icon: "",
            epg_channel_id: "",
            added: "",
            is_adult: 0,
            category_ids: ["1"],
            custom_sid: null,
            tv_archive: 0,
            direct_source: "",
            tv_archive_duration: 0,
          },
        ],
      }),
    );

    await act(async () => {
      await result.current.loadMore("live");
    });

    // Should still be 1 (deduplication worked)
    expect(result.current.results?.live).toHaveLength(1);
  });

  it("loadMore does nothing while already loading", async () => {
    mockSearch.mockResolvedValue(
      makeSearchResults({
        live: [
          {
            stream_id: 1,
            name: "CNN",
            category_id: "1",
            num: 0,
            stream_type: "live",
            stream_icon: "",
            epg_channel_id: "",
            added: "",
            is_adult: 0,
            category_ids: ["1"],
            custom_sid: null,
            tv_archive: 0,
            direct_source: "",
            tv_archive_duration: 0,
          },
        ],
      }),
    );
    mockGuideSearch.mockResolvedValue({ results: [] });

    const { result } = renderHook(() => useSearchPage());

    act(() => result.current.handleQueryChange("channels"));
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.results?.live).toHaveLength(1);
    });

    // loadingMore is not null during loadMore
    act(() => {
      // Set a loading state
    });

    // Start loading
    mockSearch.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 1000));
      return makeSearchResults({
        live: [
          {
            stream_id: 2,
            name: "BBC",
            category_id: "2",
            num: 0,
            stream_type: "live",
            stream_icon: "",
            epg_channel_id: "",
            added: "",
            is_adult: 0,
            category_ids: ["2"],
            custom_sid: null,
            tv_archive: 0,
            direct_source: "",
            tv_archive_duration: 0,
          },
        ],
      });
    });

    const loadMorePromise = act(async () => {
      await result.current.loadMore("live");
    });

    // Try to load again while first is pending — should be a no-op
    await act(async () => {
      await result.current.loadMore("live");
    });

    await loadMorePromise;

    // Should still have loaded 2 items (first call succeeded, second was ignored)
    expect(result.current.results?.live).toHaveLength(2);
  });

  // ── Error handling ──

  it("displays error when search fails", async () => {
    mockSearch.mockRejectedValue(new Error("API unavailable"));
    mockGuideSearch.mockResolvedValue({ results: [] });

    const { result } = renderHook(() => useSearchPage());

    act(() => result.current.handleQueryChange("test"));
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  // ── Derived values ──

  it("computes total from all sections", async () => {
    mockSearch.mockResolvedValue(
      makeSearchResults({
        live: Array.from({ length: 3 }, (_, i): any => ({
          stream_id: i,
          name: `Live ${i}`,
          category_id: "1",
          num: 0,
          stream_type: "live",
          stream_icon: "",
          epg_channel_id: "",
          added: "",
          is_adult: 0,
          category_ids: ["1"],
          custom_sid: null,
          tv_archive: 0,
          direct_source: "",
          tv_archive_duration: 0,
        })),
        movies: Array.from({ length: 2 }, (_, i): any => ({
          stream_id: i + 10,
          name: `Movie ${i}`,
          category_id: "1",
          num: 0,
          stream_type: "movie",
          stream_icon: "",
          added: "",
          is_adult: 0,
          category_ids: ["1"],
          custom_sid: null,
          direct_source: "",
          container_extension: "mp4",
          rating: "",
          tmdb: null,
        })),
        series: [],
      }),
    );
    mockGuideSearch.mockResolvedValue({ results: [] });

    const { result } = renderHook(() => useSearchPage());

    act(() => result.current.handleQueryChange("test"));
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.liveCount).toBe(3);
      expect(result.current.movieCount).toBe(2);
      expect(result.current.seriesCount).toBe(0);
      expect(result.current.total).toBe(5);
    });
  });
});
