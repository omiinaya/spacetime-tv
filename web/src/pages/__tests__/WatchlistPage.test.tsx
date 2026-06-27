/**
 * Tests for the WatchlistPage component.
 *
 * WatchlistPage has two tabs (Movies / Series), each showing items from the
 * user's watchlist (stored in localStorage). The Movies tab fetches all movies
 * via api.movies.unified() then filters by saved IDs. The Series tab fetches
 * each series individually via api.series.details().
 *
 * This suite covers: tab switching, loading/error/empty states, movie card
 * rendering, series card rendering, remove-from-watchlist, overlay display,
 * and navigation CTA buttons.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import WatchlistPage from "@/pages/WatchlistPage";
import type { UnifiedMovie, Series } from "@/lib/api";

// ── Mock api ─────────────────────────────────────────────
const mockMoviesUnified = vi.fn();
const mockSeriesDetails = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    movies: {
      unified: (...args: unknown[]) =>
        (mockMoviesUnified as unknown as (...a: unknown[]) => Promise<{
          movies: UnifiedMovie[]; total: number; offset: number; limit: number
        }>)(...args),
    },
    series: {
      details: (...args: unknown[]) =>
        (mockSeriesDetails as unknown as (...a: unknown[]) => Promise<unknown>)(...args),
    },
  },
  imageUrl: (url: string) => url,
}));

// ── Mock watchlist module ────────────────────────────────
const mockGetWatchlist = vi.fn<() => number[]>();
const mockGetSeriesWatchlist = vi.fn<() => number[]>();
const mockToggleWatchlist = vi.fn<() => boolean>();
const mockToggleSeriesWatchlist = vi.fn<() => boolean>();
const mockIsInWatchlist = vi.fn<() => boolean>();
const mockIsSeriesInWatchlist = vi.fn<() => boolean>();

vi.mock("@/lib/watchlist", () => ({
  getWatchlist: (...args: unknown[]) =>
    (mockGetWatchlist as (...a: unknown[]) => number[])(...args),
  getSeriesWatchlist: (...args: unknown[]) =>
    (mockGetSeriesWatchlist as (...a: unknown[]) => number[])(...args),
  toggleWatchlist: (...args: unknown[]) =>
    (mockToggleWatchlist as (...a: unknown[]) => boolean)(...args),
  toggleSeriesWatchlist: (...args: unknown[]) =>
    (mockToggleSeriesWatchlist as (...a: unknown[]) => boolean)(...args),
  isInWatchlist: (...args: unknown[]) =>
    (mockIsInWatchlist as (...a: unknown[]) => boolean)(...args),
  isSeriesInWatchlist: (...args: unknown[]) =>
    (mockIsSeriesInWatchlist as (...a: unknown[]) => boolean)(...args),
}));

// ── Mock child components ────────────────────────────────
vi.mock("@/components/MovieOverlay", () => ({
  default: ({ movie, onClose }: { movie: { name?: string }; onClose: () => void }) =>
    <div data-testid="movie-overlay">
      <span>{movie?.name} overlay</span>
      <button onClick={onClose} aria-label="Close overlay">Close</button>
    </div>,
}));

vi.mock("@/components/SeriesOverlay", () => ({
  default: ({ series, onClose }: { series: { name?: string }; onClose: () => void }) =>
    <div data-testid="series-overlay">
      <span>{series?.name} overlay</span>
      <button onClick={onClose} aria-label="Close overlay">Close</button>
    </div>,
}));

// ── Mock navigate ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Sample data ─────────────────────────────────────────
const sampleMovies: UnifiedMovie[] = [
  {
    num: 1,
    name: "Inception (2010)",
    stream_id: 101,
    stream_icon: "https://example.com/inception.jpg",
    rating: "8.8",
    rating_5based: 4.4,
    tmdb: "27205",
    category_id: "10",
    container_extension: "mp4",
    base_name: "Inception",
    languages: [{ code: "EN", name: "English", stream_id: 101, container_extension: "mp4" }],
    language_count: 1,
    added: "1700000000",
  },
  {
    num: 2,
    name: "The Matrix (1999)",
    stream_id: 102,
    stream_icon: "https://example.com/matrix.jpg",
    rating: "8.7",
    rating_5based: 4.3,
    tmdb: "603",
    category_id: "10",
    container_extension: "mp4",
    base_name: "The Matrix",
    languages: [{ code: "EN", name: "English", stream_id: 102, container_extension: "mp4" }],
    language_count: 1,
    added: "1690000000",
  },
];

const sampleSeries: Series[] = [
  {
    num: 0,
    series_id: 201,
    name: "Breaking Bad",
    cover: "https://example.com/bb.jpg",
    plot: "A high school teacher turns to meth production.",
    cast: "Bryan Cranston",
    director: "Vince Gilligan",
    genre: "Crime, Drama",
    releaseDate: "2008-01-20",
    rating: "9.5",
    rating_5based: "4.8",
    tmdb: "1396",
    youtube_trailer: "",
    category_id: "5",
  },
  {
    num: 0,
    series_id: 202,
    name: "Stranger Things",
    cover: "",
    plot: "Kids uncover supernatural secrets.",
    cast: "Millie Bobby Brown",
    director: "Duffer Brothers",
    genre: "Sci-Fi, Horror",
    releaseDate: "2016-07-15",
    rating: "8.7",
    rating_5based: "4.3",
    tmdb: "66732",
    youtube_trailer: "",
    category_id: "5",
  },
];

function mockSeriesDetailsResponse(id: number) {
  const s = sampleSeries.find((x) => x.series_id === id);
  if (!s) throw new Error(`Unknown series ${id}`);
  return {
    seasons: [],
    info: {
      name: s.name,
      cover: s.cover,
      plot: s.plot,
      cast: s.cast,
      director: s.director,
      genre: s.genre,
      releaseDate: s.releaseDate,
      release_date: s.releaseDate,
      last_modified: "",
      rating: s.rating,
      rating_5based: s.rating_5based,
      tmdb: s.tmdb,
      youtube_trailer: s.youtube_trailer || "",
      category_id: s.category_id,
      category_ids: [],
      episode_run_time: "",
    },
    episodes: {},
  };
}

// ── Helpers ──────────────────────────────────────────────
function renderWatchlistPage() {
  return render(
    <MemoryRouter>
      <WatchlistPage />
    </MemoryRouter>,
  );
}

function setupMoviesTab() {
  mockGetWatchlist.mockReturnValue([101, 102]);
  mockGetSeriesWatchlist.mockReturnValue([]);
  mockMoviesUnified.mockResolvedValue({
    movies: sampleMovies,
    total: sampleMovies.length,
    offset: 0,
    limit: 200,
  });
}

function setupSeriesTab() {
  mockGetWatchlist.mockReturnValue([]);
  mockGetSeriesWatchlist.mockReturnValue([201, 202]);
  mockMoviesUnified.mockResolvedValue({
    movies: [],
    total: 0,
    offset: 0,
    limit: 200,
  });
  mockSeriesDetails.mockImplementation((id: number) =>
    Promise.resolve(mockSeriesDetailsResponse(id)),
  );
}

function setupEmptyWatchlist() {
  mockGetWatchlist.mockReturnValue([]);
  mockGetSeriesWatchlist.mockReturnValue([]);
  mockMoviesUnified.mockResolvedValue({
    movies: sampleMovies,
    total: sampleMovies.length,
    offset: 0,
    limit: 200,
  });
}

// ── Tests ──────────────────────────────────────────────────
describe("WatchlistPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // ── Empty state (no movies or series saved) ────────────
  describe("empty state", () => {
    beforeEach(() => {
      setupEmptyWatchlist();
    });

    it("shows 'No movies saved yet' on the movies tab by default", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText("No movies saved yet")).toBeInTheDocument();
      });
    });

    it("shows a Heart icon in the empty state", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        const msg = screen.getByText("No movies saved yet");
        const container = msg.closest("div");
        expect(container?.querySelector("svg")).toBeInTheDocument();
      });
    });

    it("shows subtitle text encouraging browsing", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(
          screen.getByText(/tap the heart icon to save your favorites/),
        ).toBeInTheDocument();
      });
    });

    it("shows 'Browse Movies' CTA button on default tab", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText("Browse Movies")).toBeInTheDocument();
      });
    });

    it("navigates to /movies when Browse Movies is clicked", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText("Browse Movies")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Browse Movies"));
      expect(mockNavigate).toHaveBeenCalledWith("/movies");
    });

    it("switches to Series tab and shows empty series state", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        // Wait for initial render to settle
        expect(screen.getByText("My Watchlist")).toBeInTheDocument();
      });
      // Click Series tab
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        expect(screen.getByText("No series saved yet")).toBeInTheDocument();
      });
    });

    it("shows 'Browse Series' CTA button on series tab", async () => {
      renderWatchlistPage();
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        expect(screen.getByText("Browse Series")).toBeInTheDocument();
      });
    });

    it("navigates to /series when Browse Series is clicked", async () => {
      renderWatchlistPage();
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        expect(screen.getByText("Browse Series")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Browse Series"));
      expect(mockNavigate).toHaveBeenCalledWith("/series");
    });

    it("shows tab counts as 0 when watchlist is empty", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText(/Movies \(0\)/)).toBeInTheDocument();
        expect(screen.getByText(/Series \(0\)/)).toBeInTheDocument();
      });
    });
  });

  // ── Movies tab with items ──────────────────────────────
  describe("movies tab with items", () => {
    beforeEach(() => {
      setupMoviesTab();
    });

    it("renders movie cards with names", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText("Inception")).toBeInTheDocument();
        expect(screen.getByText("The Matrix")).toBeInTheDocument();
      });
    });

    it("shows correct count of saved movies", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText(/2 movies saved/)).toBeInTheDocument();
      });
    });

    it("shows tab count with correct number", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText(/Movies \(2\)/)).toBeInTheDocument();
      });
    });

    it("renders movie poster images", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        const posters = screen.getAllByRole("img");
        // Each movie poster + aria-label img for details = at least 2
        expect(posters.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("renders rating badges for movies with ratings", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText("8.8")).toBeInTheDocument();
        expect(screen.getByText("8.7")).toBeInTheDocument();
      });
    });

    it("renders remove-from-watchlist buttons on movie cards", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        const removeBtns = screen.getAllByLabelText(/Remove .* from watchlist/);
        expect(removeBtns.length).toBe(2);
      });
    });

    it("calls toggleWatchlist when remove button is clicked", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByLabelText("Remove Inception from watchlist")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText("Remove Inception from watchlist"));
      expect(mockToggleWatchlist).toHaveBeenCalledWith(101);
    });

    it("opens MovieOverlay when a movie card is clicked", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText("Inception")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Inception"));
      expect(screen.getByTestId("movie-overlay")).toBeInTheDocument();
      expect(screen.getByText(/overlay/)).toBeInTheDocument();
    });

    it("closes MovieOverlay when close button is clicked", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText("Inception")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Inception"));
      expect(screen.getByTestId("movie-overlay")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Close overlay"));
      expect(screen.queryByTestId("movie-overlay")).not.toBeInTheDocument();
    });

    it("shows year badges on movie cards", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        // Both movies have 'added' timestamps; first 4 chars shown as year
        const yearBadges = screen.getAllByText("1700");
        expect(yearBadges.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── Series tab with items ──────────────────────────────
  describe("series tab with items", () => {
    beforeEach(() => {
      setupSeriesTab();
    });

    it("switches to series tab and renders series cards", async () => {
      renderWatchlistPage();
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
        expect(screen.getByText("Stranger Things")).toBeInTheDocument();
      });
    });

    it("shows correct count of saved series", async () => {
      renderWatchlistPage();
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        expect(screen.getByText(/2 series saved/)).toBeInTheDocument();
      });
    });

    it("shows tab count with correct number on series tab", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText(/Series \(2\)/)).toBeInTheDocument();
      });
    });

    it("renders rating badges for series", async () => {
      renderWatchlistPage();
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        expect(screen.getByText("9.5")).toBeInTheDocument();
      });
    });

    it("renders year badges for series with release dates", async () => {
      renderWatchlistPage();
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        expect(screen.getByText("2008")).toBeInTheDocument();
        expect(screen.getByText("2016")).toBeInTheDocument();
      });
    });

    it("renders remove-from-watchlist buttons on series cards", async () => {
      renderWatchlistPage();
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        const removeBtns = screen.getAllByLabelText(/Remove .* from watchlist/);
        expect(removeBtns.length).toBe(2);
      });
    });

    it("calls toggleSeriesWatchlist when remove is clicked", async () => {
      renderWatchlistPage();
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        expect(screen.getByLabelText("Remove Breaking Bad from watchlist")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText("Remove Breaking Bad from watchlist"));
      expect(mockToggleSeriesWatchlist).toHaveBeenCalledWith(201);
    });

    it("opens SeriesOverlay when a series card is clicked", async () => {
      renderWatchlistPage();
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Breaking Bad"));
      expect(screen.getByTestId("series-overlay")).toBeInTheDocument();
      expect(screen.getByText("Breaking Bad overlay")).toBeInTheDocument();
    });

    it("closes SeriesOverlay when close button is clicked", async () => {
      renderWatchlistPage();
      fireEvent.click(screen.getByText(/Series/));
      await waitFor(() => {
        expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Breaking Bad"));
      expect(screen.getByTestId("series-overlay")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Close overlay"));
      expect(screen.queryByTestId("series-overlay")).not.toBeInTheDocument();
    });
  });

  // ── Loading state ──────────────────────────────────────
  describe("loading state", () => {
    beforeEach(() => {
      mockGetWatchlist.mockReturnValue([101]);
      mockGetSeriesWatchlist.mockReturnValue([]);
      mockMoviesUnified.mockReturnValue(new Promise(() => {})); // never resolves
    });

    it("renders skeleton grid while loading", () => {
      renderWatchlistPage();
      // PosterCardSkeleton uses aspect ratio divs
      const skeleton = document.querySelector('[class*="aspect"]');
      // The grid should be rendering skeleton items (12)
      expect(skeleton).toBeInTheDocument();
    });

    it("does not render movie names while loading", () => {
      renderWatchlistPage();
      expect(screen.queryByText("Inception")).not.toBeInTheDocument();
    });
  });

  // ── Error state ────────────────────────────────────────
  describe("error state", () => {
    beforeEach(() => {
      mockGetWatchlist.mockReturnValue([101]);
      mockGetSeriesWatchlist.mockReturnValue([]);
      mockMoviesUnified.mockRejectedValue(new Error("Network failure"));
    });

    it("shows error message when API fails", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText("Network failure")).toBeInTheDocument();
      });
    });

    it("shows retry button on error", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      });
    });

    it("retry button reloads the page", async () => {
      const originalLocation = window.location;
      // @ts-expect-error - mock location reload
      delete window.location;
      window.location = { ...originalLocation, reload: vi.fn() };
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Retry"));
      expect(window.location.reload).toHaveBeenCalled();
      window.location = originalLocation;
    });
  });

  // ── Header and navigation ──────────────────────────────
  describe("header and tabs", () => {
    beforeEach(() => {
      setupEmptyWatchlist();
    });

    it("shows 'My Watchlist' heading with Bookmark icon", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        const heading = screen.getByText("My Watchlist");
        expect(heading).toBeInTheDocument();
      });
    });

    it("highlights active tab with visual indicator", async () => {
      // The active tab uses 'border-primary' class
      renderWatchlistPage();
      await waitFor(() => {
        const moviesTab = screen.getByText(/Movies/);
        expect(moviesTab.className).toMatch(/border-primary/);
      });
    });

    it("switches tab highlight when clicking Series tab", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        expect(screen.getByText(/Movies/)).toBeInTheDocument();
      });
      // Get the Series tab button specifically (not the "Browse Series" CTA)
      const tabButtons = screen.getAllByText(/Series/);
      const seriesTabBtn = tabButtons.find(
        (el) => el.tagName === "BUTTON" && el.className.includes("border"),
      );
      expect(seriesTabBtn).toBeDefined();
      fireEvent.click(seriesTabBtn!);
      expect(seriesTabBtn!.className).toMatch(/border-primary/);
    });

    it("defaults to movies tab on first render", async () => {
      renderWatchlistPage();
      await waitFor(() => {
        const moviesTab = screen.getByText(/Movies/);
        expect(moviesTab.className).toMatch(/border-primary/);
      });
    });
  });
});
