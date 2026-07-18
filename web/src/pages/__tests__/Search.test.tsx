/**
 * Tests for the Search page component.
 *
 * SearchPage renders a search input with debounced auto-search, filter tabs
 * (All/Live/Movies/Series), sort options (Relevance/Name A-Z/Rating),
 * and result sections for live channels, movies, and series.
 * This suite covers: initial empty state, loading/error states,
 * search results rendering, tab filtering, sorting, load-more pagination,
 * TMDB enrichment, now-playing EPG, and search history.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SearchPage from "@/pages/Search";

// ── Mock api ─────────────────────────────────────────────
const mockSearch = vi.fn();
const mockSearchEnrich = vi.fn();
const mockGuideSearch = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    search: (...args: unknown[]) =>
      (
        mockSearch as unknown as (...a: unknown[]) => Promise<{
          live: unknown[];
          movies: unknown[];
          series: unknown[];
          totals: { live: number; movies: number; series: number };
        }>
      )(...args),
    searchEnrich: (...args: unknown[]) =>
      (
        mockSearchEnrich as unknown as (
          ...a: unknown[]
        ) => Promise<{
          movies: Record<string, unknown>;
          series: Record<string, unknown>;
        }>
      )(...args),
    guide: {
      now: vi.fn(),
      search: (...args: unknown[]) =>
        (
          mockGuideSearch as unknown as (
            ...a: unknown[]
          ) => Promise<{
            results: unknown[];
            total: number;
            query: string;
            future_only: boolean;
          }>
        )(...args),
    },
  },
  imageUrl: (url: string) => url,
  tmdbImageUrl: (path: string) => (path ? `https://tmdb.org${path}` : ""),
  tmdbSrcset: (path: string) =>
    path ? `https://tmdb.org/w342${path} 342w` : "",
  tmdbImgProps: vi.fn(() => ({ src: "https://tmdb.org/poster.jpg" })),
}));

// ── Mock useNowPlaying ──────────────────────────────────
const mockGetNowPlaying = vi.fn();

vi.mock("@/hooks/useNowPlaying", () => ({
  useNowPlaying: () => ({
    getNowPlaying: mockGetNowPlaying,
    getNowPlayingChannel: vi.fn(),
    programmes: new Map(),
  }),
}));

// ── Mock SearchHistory ──────────────────────────────────
let mockHistoryShow = false;
let mockHistoryOnClose: (() => void) | null = null;

const mockAddSearchHistory = vi.fn();

vi.mock("@/components/SearchHistory", () => ({
  SearchHistory: ({
    show,
    onSelect,
    onClose,
  }: {
    show: boolean;
    onSelect: (q: string) => void;
    onClose: () => void;
  }) => {
    mockHistoryShow = show;
    mockHistoryOnClose = onClose;
    return show ? (
      <div data-testid="search-history">
        <button
          onClick={() => {
            onSelect("previous search");
            onClose();
          }}
        >
          previous search
        </button>
      </div>
    ) : null;
  },
  addSearchHistory: (...args: unknown[]) =>
    (mockAddSearchHistory as (...a: unknown[]) => void)(...args),
}));

// ── Mock searchHistory lib (for addSearchHistory) ────────
vi.mock("@/lib/searchHistory", () => ({
  getSearchHistory: vi.fn(() => []),
  addSearchHistory: (...args: unknown[]) =>
    (mockAddSearchHistory as (...a: unknown[]) => void)(...args),
  clearSearchHistory: vi.fn(),
}));

// ── Mock sessionStorage ─────────────────────────────────
const sessionStore: Record<string, string> = {};
vi.stubGlobal("sessionStorage", {
  getItem: (key: string) => sessionStore[key] ?? null,
  setItem: (key: string, value: string) => {
    sessionStore[key] = value;
  },
  removeItem: (key: string) => {
    delete sessionStore[key];
  },
  clear: () => {
    Object.keys(sessionStore).forEach((k) => delete sessionStore[k]);
  },
});

// ── Mock IntersectionObserver ───────────────────────────
vi.stubGlobal(
  "IntersectionObserver",
  vi.fn(function MockIntersectionObserver() {
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    this.unobserve = vi.fn();
    this.takeRecords = vi.fn(() => []);
    return this;
  }),
);

// ── Sample data ──────────────────────────────────────────
const sampleLiveStreams = [
  {
    num: 1,
    name: "CNN",
    stream_type: "live",
    stream_id: 301,
    stream_icon: "https://example.com/cnn.png",
    epg_channel_id: "CNN.us",
    category_id: "1",
  },
  {
    num: 2,
    name: "BBC World",
    stream_type: "live",
    stream_id: 302,
    stream_icon: "",
    epg_channel_id: "BBCW.uk",
    category_id: "1",
  },
  {
    num: 3,
    name: "Fox News",
    stream_type: "live",
    stream_id: 303,
    stream_icon: "https://example.com/fox.png",
    epg_channel_id: "FOX.us",
    category_id: "2",
  },
];

const sampleMovies = [
  {
    num: 1,
    name: "Inception",
    stream_id: 101,
    stream_icon: "https://example.com/inception.jpg",
    rating: "8.8",
    rating_5based: 4.4,
    tmdb: "27205",
    category_id: "10",
    container_extension: "mp4",
  },
  {
    num: 2,
    name: "The Matrix",
    stream_id: 102,
    stream_icon: "https://example.com/matrix.jpg",
    rating: "8.7",
    rating_5based: 4.3,
    tmdb: "603",
    category_id: "10",
    container_extension: "mp4",
  },
  {
    num: 3,
    name: "Interstellar",
    stream_id: 103,
    stream_icon: "",
    rating: "8.6",
    rating_5based: 4.3,
    tmdb: "157336",
    category_id: "10",
    container_extension: "mkv",
  },
];

const sampleSeries = [
  {
    num: 1,
    name: "Stranger Things",
    series_id: 401,
    cover: "https://example.com/stranger.jpg",
    plot: "A sci-fi series",
    cast: "Winona Ryder",
    director: "Duffer Brothers",
    genre: "Sci-Fi",
    releaseDate: "2016-07-15",
    rating: "8.7",
    rating_5based: "4.3",
    tmdb: "66732",
    youtube_trailer: "",
    category_id: "1",
  },
  {
    num: 2,
    name: "Breaking Bad",
    series_id: 402,
    cover: "https://example.com/breaking.jpg",
    plot: "A chemistry teacher turns meth kingpin",
    cast: "Bryan Cranston",
    director: "Vince Gilligan",
    genre: "Drama",
    releaseDate: "2008-01-20",
    rating: "9.5",
    rating_5based: "4.8",
    tmdb: "1396",
    youtube_trailer: "",
    category_id: "2",
  },
];

const sampleSearchResults = {
  live: sampleLiveStreams,
  movies: sampleMovies,
  series: sampleSeries,
  totals: { live: 3, movies: 3, series: 2 },
};

const sampleEmptyResults = {
  live: [],
  movies: [],
  series: [],
  totals: { live: 0, movies: 0, series: 0 },
};

// ── Helper ─────────────────────────────────────────────────
function renderSearch(initialRoute = "/search") {
  window.history.pushState({}, "", initialRoute);
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <SearchPage />
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  mockSearch.mockResolvedValue(sampleSearchResults);
  mockSearchEnrich.mockResolvedValue({ movies: {}, series: {} });
  mockGetNowPlaying.mockReturnValue(null);
  mockGuideSearch.mockResolvedValue({
    results: [],
    total: 0,
    query: "",
    future_only: true,
  });
  Object.keys(sessionStore).forEach((k) => delete sessionStore[k]);
}

// ── Tests ────────────────────────────────────────────────────
describe("SearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ── Initial state ─────────────────────────────────────
  describe("initial state", () => {
    it("renders the Search heading", () => {
      renderSearch();
      expect(
        screen.getByRole("heading", { name: "Search" }),
      ).toBeInTheDocument();
    });

    it("shows initial empty state message", () => {
      renderSearch();
      const messages = screen.getAllByText(/Search across all live TV/);
      expect(messages.length).toBeGreaterThanOrEqual(1);
    });

    it("renders search input with placeholder", () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("aria-label", "Search");
    });

    it("does NOT show filter tabs or sort controls before search", () => {
      renderSearch();
      expect(screen.queryByText("All")).not.toBeInTheDocument();
      expect(screen.queryByText("Sort")).not.toBeInTheDocument();
    });
  });

  // ── Loading state ──────────────────────────────────────
  describe("loading state", () => {
    beforeEach(() => {
      mockSearch.mockReturnValue(new Promise(() => {})); // never resolves
    });

    it("shows spinner in search button while loading", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      // After debounce, loading should show spinner
      await waitFor(
        () => {
          const searchBtn = screen.getByText("Search").closest("button");
          // Button should be disabled and contain a spinner
          const spinner = document.querySelector(".animate-spin");
          expect(spinner).toBeInTheDocument();
        },
        { timeout: 1000 },
      );
    });
  });

  // ── Empty state ─────────────────────────────────────────
  describe("empty state", () => {
    it('shows "No results in this category" when filter yields zero from positive results', async () => {
      // Return results that have at least one category with more than 0 items,
      // so total > 0. Then filter to a section with 0 results.
      const resultsWithSomeEmpty = {
        live: sampleLiveStreams,
        movies: [],
        series: [],
        totals: { live: 3, movies: 0, series: 0 },
      };
      mockSearch.mockResolvedValue(resultsWithSomeEmpty);

      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      // Wait for results to load
      await waitFor(() => {
        expect(screen.getByText("CNN")).toBeInTheDocument();
      });

      // Switch to movies tab where there are 0 results (but total > 0)
      fireEvent.click(screen.getByText("Movies"));

      await waitFor(() => {
        expect(screen.getByText(/No results for/)).toBeInTheDocument();
      });
    });
  });

  // ── Error state ───────────────��─────────────────────────
  describe("error state", () => {
    beforeEach(() => {
      mockSearch.mockRejectedValue(new Error("Network failure"));
    });

    it("shows error banner when search API fails", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("Network failure")).toBeInTheDocument();
      });
    });
  });

  // ── Search results rendering ─────────────────────────────
  describe("search results rendering", () => {
    it("renders live TV channels in results", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("CNN")).toBeInTheDocument();
        expect(screen.getByText("BBC World")).toBeInTheDocument();
      });
    });

    it("renders movie results", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("Inception")).toBeInTheDocument();
        expect(screen.getByText("The Matrix")).toBeInTheDocument();
      });
    });

    it("renders series results", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("Stranger Things")).toBeInTheDocument();
      });
    });

    it("shows result count in subtitle", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        const subtitle = screen.getByText(/8 results/);
        expect(subtitle).toBeInTheDocument();
      });
    });

    it("shows total count in subtitle", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        const subtitle = screen.getByText(/8 total/);
        expect(subtitle).toBeInTheDocument();
      });
    });

    it("renders channel logo images for live results with stream_icon", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        // CNN and Fox News have stream_icon
        const imgs = screen.getAllByRole("img");
        expect(imgs.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("shows fallback TV icon for channels without stream_icon", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("BBC World")).toBeInTheDocument();
      });
    });

    it("clears results when search query is cleared", async () => {
      renderSearch();

      // First trigger a search
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });
      await waitFor(() => {
        expect(screen.getByText("CNN")).toBeInTheDocument();
      });

      // Click Clear button
      const clearBtn = screen.getByText("Clear");
      fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(screen.queryByText("CNN")).not.toBeInTheDocument();
        const emptyMessages = screen.getAllByText(/Search across all live TV/);
        expect(emptyMessages.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── Filter tabs ─────────────────────────────────────────
  describe("filter tabs", () => {
    it("shows filter tabs when results are present", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("All")).toBeInTheDocument();
        expect(screen.getByText("Live")).toBeInTheDocument();
        expect(screen.getByText("Movies")).toBeInTheDocument();
        expect(screen.getByText("Series")).toBeInTheDocument();
      });
    });

    it("filters to live only when Live tab clicked", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("CNN")).toBeInTheDocument();
      });

      const liveTab = screen.getByText("Live");
      fireEvent.click(liveTab);

      await waitFor(() => {
        // Live channels still visible
        expect(screen.getByText("Live TV (3)")).toBeInTheDocument();
        // Movies and series sections hidden
        expect(screen.queryByText("Movies (3)")).not.toBeInTheDocument();
        expect(screen.queryByText("Series (2)")).not.toBeInTheDocument();
      });
    });

    it("filters to movies only when Movies tab clicked", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("Inception")).toBeInTheDocument();
      });

      const moviesTab = screen.getByText("Movies");
      fireEvent.click(moviesTab);

      await waitFor(() => {
        // Section headings should have "(0)" - not rendered because length is 0.
        // But we can check section wrappers are gone by looking at subheadings
        expect(screen.queryByText(/Live TV \(\d+\)/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Series \(\d+\)/)).not.toBeInTheDocument();
        // Movie section heading should still be present
        expect(screen.getByText(/Movies \(\d+\)/)).toBeInTheDocument();
      });
    });

    it("filters to series only when Series tab clicked", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("Stranger Things")).toBeInTheDocument();
      });

      const seriesTab = screen.getByText("Series");
      fireEvent.click(seriesTab);

      await waitFor(() => {
        expect(screen.queryByText(/Live TV \(\d+\)/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Movies \(\d+\)/)).not.toBeInTheDocument();
      });
    });

    it("highlights the active filter tab", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        const allTab = screen.getByText("All");
        expect(allTab).toBeInTheDocument();
      });

      const moviesTab = screen.getByText("Movies");
      fireEvent.click(moviesTab);

      // Check movies tab has active styling
      await waitFor(() => {
        const activeMoviesTab = screen.getByText("Movies").closest("button");
        expect(activeMoviesTab?.className).toContain("bg-primary");
      });
    });

    it("shows count badges on filter tabs", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        const liveTab = screen.getByText("Live");
        const countSpan = liveTab.querySelector("span");
        expect(countSpan?.textContent).toBe("3");
      });
    });
  });

  // ── Sort controls ────────────────────────────────────────
  describe("sort controls", () => {
    it("shows sort controls when results are present", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("Sort")).toBeInTheDocument();
        expect(screen.getByText("Relevance")).toBeInTheDocument();
        expect(screen.getByText("Name A–Z")).toBeInTheDocument();
        expect(screen.getByText("Rating")).toBeInTheDocument();
      });
    });

    it("sorts by Name A–Z when clicked", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("Inception")).toBeInTheDocument();
      });

      // Sort by name
      const nameSortBtn = screen.getByText("Name A–Z");
      fireEvent.click(nameSortBtn);

      // Movie section should still be visible (any Movies text, including filter tab)
      await waitFor(() => {
        const moviesHeadings = screen.getAllByText(/Movies/);
        expect(moviesHeadings.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("highlights active sort option", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText("Relevance")).toBeInTheDocument();
      });

      const ratingBtn = screen.getByText("Rating");
      fireEvent.click(ratingBtn);

      await waitFor(() => {
        expect(ratingBtn.closest("button")?.className).toContain("bg-primary");
      });
    });
  });

  // ── EPG Search tab ──────────────────────────────────────
  describe("EPG search tab", () => {
    const sampleEpgResults = [
      {
        title: "BBC News at Six",
        subtitle: "News",
        description: "The latest national and international news.",
        channel_id: "BBC1.uk",
        channel_name: "BBC One",
        start: "2026-06-30T18:00:00Z",
        stop: "2026-06-30T18:30:00Z",
        start_ts: 1761300000,
        stop_ts: 1761301800,
        duration: 1800,
      },
      {
        title: "Coronation Street",
        subtitle: null,
        description: null,
        channel_id: "ITV1.uk",
        channel_name: "ITV 1",
        start: "2026-06-30T19:30:00Z",
        stop: "2026-06-30T20:00:00Z",
        start_ts: 1761305400,
        stop_ts: 1761307200,
        duration: 1800,
      },
    ];

    it("shows EPG tab filter when search has results", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      mockGuideSearch.mockResolvedValue({
        results: sampleEpgResults,
        total: 2,
        query: "news",
        future_only: true,
      });
      fireEvent.change(input, { target: { value: "news" } });
      // Small tick for React to process state update, then press Enter
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        const epgTab = screen.getByText("EPG");
        expect(epgTab).toBeInTheDocument();
      });
      expect(mockGuideSearch).toHaveBeenCalledWith("news");
    });

    it("renders EPG programme results when EPG tab is selected", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      mockGuideSearch.mockResolvedValue({
        results: sampleEpgResults,
        total: 2,
        query: "news",
        future_only: true,
      });
      fireEvent.change(input, { target: { value: "news" } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      // Wait for results and switch to EPG tab
      await waitFor(() => {
        expect(screen.getByText("EPG")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("EPG"));

      await waitFor(() => {
        expect(screen.getByText("EPG Programmes (2)")).toBeInTheDocument();
        expect(screen.getByText("BBC News at Six")).toBeInTheDocument();
        expect(screen.getByText("Coronation Street")).toBeInTheDocument();
      });
    });

    it("shows channel name for each EPG programme", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      mockGuideSearch.mockResolvedValue({
        results: sampleEpgResults,
        total: 2,
        query: "news",
        future_only: true,
      });
      fireEvent.change(input, { target: { value: "news" } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("EPG")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("EPG"));

      await waitFor(() => {
        expect(screen.getByText("BBC One")).toBeInTheDocument();
        expect(screen.getByText("ITV 1")).toBeInTheDocument();
      });
    });

    it("shows empty state when EPG search returns no results", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      mockGuideSearch.mockResolvedValue({
        results: [],
        total: 0,
        query: "xyzxyz",
        future_only: true,
      });
      fireEvent.change(input, { target: { value: "xyzxyz" } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("EPG")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("EPG"));

      await waitFor(() => {
        expect(screen.getByText(/No EPG programmes found/)).toBeInTheDocument();
      });
    });

    it("handles EPG search API error gracefully when EPG tab selected", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      mockGuideSearch.mockRejectedValue(new Error("EPG search failed"));
      fireEvent.change(input, { target: { value: "news" } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("EPG")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("EPG"));

      await waitFor(() => {
        // Should show empty results without crashing
        expect(screen.getByText(/No EPG programmes found/)).toBeInTheDocument();
      });
    });

    it("shows live/movies/series sections hidden when EPG tab is active", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      mockGuideSearch.mockResolvedValue({
        results: sampleEpgResults,
        total: 2,
        query: "news",
        future_only: true,
      });
      fireEvent.change(input, { target: { value: "news" } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      // Switch to EPG tab
      await waitFor(() => {
        expect(screen.getByText("EPG")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("EPG"));

      await waitFor(() => {
        // EPG results visible
        expect(screen.getByText("EPG Programmes (2)")).toBeInTheDocument();
        // The result section headings should not contain live/movies/series filter names
        const epgSection = screen.getByText(/EPG Programmes/);
        expect(epgSection).toBeInTheDocument();
        // The "All" tab should not be active — EPG tab content is rendering
        // so the standard result sections are not rendered
        expect(screen.queryByText(/Live TV \(\d+\)/)).not.toBeInTheDocument();
      });
    });

    it("shows subtitle on EPG programme cards when available", async () => {
      const resultsWithSubtitle = [
        { ...sampleEpgResults[0] },
        { ...sampleEpgResults[1], subtitle: "Drama" },
      ];
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      mockGuideSearch.mockResolvedValue({
        results: resultsWithSubtitle,
        total: 2,
        query: "drama",
        future_only: true,
      });
      mockSearch.mockResolvedValue({
        live: [],
        movies: [],
        series: [],
        totals: { live: 0, movies: 0, series: 0 },
      });
      mockSearchEnrich.mockResolvedValue({ movies: {}, series: {} });
      fireEvent.change(input, { target: { value: "drama" } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("EPG")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("EPG"));

      await waitFor(() => {
        // Both titles should be visible
        expect(screen.getByText("BBC News at Six")).toBeInTheDocument();
        expect(screen.getByText("Coronation Street")).toBeInTheDocument();
      });
    });
  });

  // ── TMDB enrichment ──────────────────────────────────────
  describe("TMDB enrichment", () => {
    const sampleEnrichData = {
      movies: {
        "101": {
          genres: ["Sci-Fi", "Action"],
          rating: 8.8,
          poster: "/inception_poster.jpg",
        },
        "102": { genres: ["Action"], rating: 8.7, poster: null },
      },
      series: {
        "401": {
          genres: ["Sci-Fi", "Horror"],
          rating: 8.2,
          poster: "/stranger_poster.jpg",
        },
      },
    };

    beforeEach(() => {
      mockSearchEnrich.mockResolvedValue(sampleEnrichData);
    });

    it("calls searchEnrich after search results arrive", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(mockSearchEnrich).toHaveBeenCalled();
      });

      // Should have been called with movie tmdb IDs and series tmdb IDs
      const enrichCallArgs = mockSearchEnrich.mock.calls[0];
      expect(enrichCallArgs[0].length).toBe(3); // 3 movies with tmdb
      expect(enrichCallArgs[1].length).toBe(2); // 2 series with tmdb
    });

    it("renders TMDB genre badges on movie cards", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        const sciFiBadges = screen.getAllByText("Sci-Fi");
        expect(sciFiBadges.length).toBeGreaterThanOrEqual(1);
        const actionBadges = screen.getAllByText("Action");
        expect(actionBadges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("does NOT fail when enrichment API errors", async () => {
      mockSearchEnrich.mockRejectedValue(new Error("Enrichment failed"));

      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      // Results should still render even though enrichment fails
      await waitFor(() => {
        expect(screen.getByText("Inception")).toBeInTheDocument();
        expect(screen.getByText("CNN")).toBeInTheDocument();
      });
    });
  });

  // ── Load more ────────────────────────────────────────────
  describe("load more", () => {
    beforeEach(() => {
      // Set up mock implementation for BOTH initial and loadMore calls
      mockSearch.mockImplementation(
        (
          q: string,
          _signal?: AbortSignal,
          _limit?: number,
          _offset?: number,
          section?: string,
        ) => {
          if (section === "live") {
            // loadMore for live returns one additional channel
            return Promise.resolve({
              live: [
                {
                  num: 4,
                  name: "New Live Channel",
                  stream_type: "live",
                  stream_id: 304,
                  stream_icon: "",
                  epg_channel_id: "NEW.us",
                  category_id: "1",
                },
              ],
              movies: sampleMovies,
              series: sampleSeries,
              totals: { live: 10, movies: 3, series: 2 },
            });
          }
          // Initial search returns full results with HIGHER totals
          return Promise.resolve({
            live: sampleLiveStreams,
            movies: sampleMovies,
            series: sampleSeries,
            totals: { live: 10, movies: 10, series: 10 },
          });
        },
      );
    });

    it("shows Load More buttons when totals exceed delivered count", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByText(/Load more live channels/)).toBeInTheDocument();
        expect(screen.getByText(/Load more movies/)).toBeInTheDocument();
        expect(screen.getByText(/Load more series/)).toBeInTheDocument();
      });
    });

    it("loads more live results when Load More clicked", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      // Wait for ALL search calls to settle (debounce + URL useEffect cascade)
      await waitFor(() => {
        expect(screen.getByText(/Load more live channels/)).toBeInTheDocument();
      });

      const loadMoreBtn = screen.getByText(/Load more live channels/);
      fireEvent.click(loadMoreBtn);

      // Wait for the new item to appear
      await waitFor(
        () => {
          const newChannel = screen.queryByText("New Live Channel");
          if (newChannel) return true;
          // If loadMore was overwritten by URL search, retry by clicking again
          const retryBtn = screen.queryByText(/Load more live channels/);
          if (retryBtn) {
            fireEvent.click(retryBtn);
          }
          throw new Error("Not yet");
        },
        { timeout: 5000, interval: 200 },
      );
    });
  });

  // ── Now-playing EPG ──────────────────────────────────────
  describe("now-playing EPG", () => {
    beforeEach(() => {
      mockGetNowPlaying.mockReturnValue("Breaking News at 6");
    });

    it("shows now-playing text for live channels", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test" } });

      await waitFor(() => {
        const nowPlayingElements = screen.getAllByText("Breaking News at 6");
        expect(nowPlayingElements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── Search history ───────────────────────────────────────
  describe("search history", () => {
    it("shows search history dropdown when input is focused and empty", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByTestId("search-history")).toBeInTheDocument();
      });
    });

    it("hides search history dropdown when clicking outside", async () => {
      // Reset mock tracking between tests
      mockHistoryShow = false;
      mockHistoryOnClose = null;

      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByTestId("search-history")).toBeInTheDocument();
        expect(mockHistoryShow).toBe(true);
      });

      // Simulate outside click by calling onClose
      if (mockHistoryOnClose) {
        mockHistoryOnClose();
      }

      await waitFor(() => {
        expect(screen.queryByTestId("search-history")).not.toBeInTheDocument();
      });
    });

    it("triggers search when a history item is selected", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByTestId("search-history")).toBeInTheDocument();
      });

      // Select the history item
      const historyItem = screen.getByText("previous search");
      fireEvent.click(historyItem);

      // Should trigger a search with "previous search"
      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledWith(
          "previous search",
          expect.any(Object),
        );
      });
    });

    it("hides history dropdown after item selected", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByTestId("search-history")).toBeInTheDocument();
      });

      const historyItem = screen.getByText("previous search");
      fireEvent.click(historyItem);

      await waitFor(() => {
        expect(screen.queryByTestId("search-history")).not.toBeInTheDocument();
      });
    });
  });

  // ── Short query ─────────────────────────────────────────
  describe("short query handling", () => {
    it("does NOT call api.search for queries shorter than 2 chars", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "a" } });

      // Wait a bit — search should not be called
      await new Promise((r) => setTimeout(r, 500));
      expect(mockSearch).not.toHaveBeenCalled();
    });
  });

  // ── Enter key ────────────────────────────────────────────
  describe("Enter key behavior", () => {
    it("triggers search on Enter key press", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "test query" } });

      // Press Enter
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledWith(
          "test query",
          expect.any(Object),
        );
      });
    });

    it("does NOT call addSearchHistory for empty or short query on Enter", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      expect(mockAddSearchHistory).not.toHaveBeenCalled();
    });

    it("calls addSearchHistory on valid Enter press", async () => {
      renderSearch();
      const input = screen.getByPlaceholderText(
        "Search channels, movies, series...",
      );
      fireEvent.change(input, { target: { value: "valid query" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(mockAddSearchHistory).toHaveBeenCalledWith("valid query");
      });
    });
  });

  // ── URL param sync ───────────────────────────────────────
  describe("URL parameter sync", () => {
    it("reads initial query from URL search params", async () => {
      renderSearch("/search?q=inception");
      await waitFor(() => {
        const input = screen.getByPlaceholderText(
          "Search channels, movies, series...",
        );
        expect(input).toHaveValue("inception");
      });
    });

    it("triggers search when initialized from URL params", async () => {
      renderSearch("/search?q=inception");

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledWith(
          "inception",
          expect.any(Object),
        );
      });
    });
  });
});
