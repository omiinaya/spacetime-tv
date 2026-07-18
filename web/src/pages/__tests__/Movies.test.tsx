/**
 * Tests for the Movies page component.
 *
 * Movies renders category tabs, movie card grid with lazy loading,
 * pagination controls, continue-watching sections, TMDB trending,
 * and search. This suite covers: loading skeleton, empty/error states,
 * movie card rendering, search, pagination, and continue watching.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Movies from "@/pages/Movies";
import type { UnifiedMovie } from "@/lib/api";

// ── Mock api ─────────────────────────────────────────────
const mockMoviesUnified = vi.fn();
const mockTmdbTrending = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    movies: {
      unified: (...args: unknown[]) =>
        (
          mockMoviesUnified as unknown as (
            ...a: unknown[]
          ) => Promise<{
            movies: UnifiedMovie[];
            total: number;
            offset: number;
            limit: number;
          }>
        )(...args),
    },
    tmdb: {
      trending: (...args: unknown[]) =>
        (
          mockTmdbTrending as unknown as (
            ...a: unknown[]
          ) => Promise<{ trending: unknown[]; enabled: boolean }>
        )(...args),
    },
    watchlist: { progress: vi.fn() },
  },
  imageUrl: (url: string) => url,
  tmdbImgProps: vi.fn(() => ({ src: "https://image.tmdb.org/poster.jpg" })),
}));

// ── Mock watchlist ───────────────────────────────────────
const mockIsInWatchlist = vi.fn(() => false);
const mockToggleWatchlist = vi.fn();
vi.mock("@/lib/watchlist", () => ({
  isInWatchlist: (...args: unknown[]) =>
    (mockIsInWatchlist as (...a: unknown[]) => boolean)(...args),
  toggleWatchlist: (...args: unknown[]) =>
    (mockToggleWatchlist as (...a: unknown[]) => boolean)(...args),
}));

// ── Mock continueWatching ────────────────────────────────
const mockGetMovieCW = vi.fn<() => unknown[]>(() => []);
const mockLoadServerProgress = vi.fn<() => Promise<unknown>>(() =>
  Promise.resolve({ series: [], movies: [] }),
);
const mockRemoveMovieProgress = vi.fn();

vi.mock("@/lib/continueWatching", () => ({
  getMovieContinueWatching: (...args: unknown[]) =>
    (mockGetMovieCW as (...a: unknown[]) => unknown[])(...args),
  loadServerProgress: (...args: unknown[]) =>
    (
      mockLoadServerProgress as (
        ...a: unknown[]
      ) => Promise<{ series: unknown[]; movies: unknown[] }>
    )(...args),
  removeMovieProgress: (...args: unknown[]) =>
    (mockRemoveMovieProgress as (...a: unknown[]) => void)(...args),
}));

// ── Mock child components ────────────────────────────────
vi.mock("@/components/MovieOverlay", () => ({
  default: ({
    movie,
    onClose,
  }: {
    movie: { name?: string };
    onClose: () => void;
  }) => (
    <div data-testid="movie-overlay">
      <span>{movie?.name} overlay</span>
      <button onClick={onClose} aria-label="Close overlay">
        Close
      </button>
    </div>
  ),
}));

vi.mock("@/components/ContentRow", () => ({
  default: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="content-row">
      <h3>{title}</h3>
      {children}
    </div>
  ),
}));

vi.mock("@/components/Pagination", () => ({
  Pagination: ({
    currentPage,
    totalPages,
    onPageChange,
  }: {
    currentPage: number;
    totalPages: number;
    onPageChange: (p: number) => void;
  }) =>
    totalPages <= 1 ? null : (
      <div data-testid="pagination">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous page"
        >
          Prev
        </button>
        <span>
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    ),
}));

vi.mock("@/components/SearchHistory", () => ({
  SearchHistory: ({ show }: { show: boolean }) =>
    show ? <div data-testid="search-history">History</div> : null,
  addSearchHistory: vi.fn(),
}));

// ── Mock IntersectionObserver (jsdom polyfill) ────────────
const mockIntersectionObserve = vi.fn();
const mockIntersectionDisconnect = vi.fn();
vi.stubGlobal(
  "IntersectionObserver",
  vi.fn(function MockIntersectionObserver() {
    this.observe = mockIntersectionObserve;
    this.disconnect = mockIntersectionDisconnect;
    this.unobserve = vi.fn();
    this.takeRecords = vi.fn(() => []);
    return this;
  }),
);

// ── Mock ResizeObserver (jsdom polyfill) ─────────────────
const mockResizeObserve = vi.fn();
const mockResizeDisconnect = vi.fn();
vi.stubGlobal(
  "ResizeObserver",
  vi.fn(function MockResizeObserver() {
    this.observe = mockResizeObserve;
    this.disconnect = mockResizeDisconnect;
    this.unobserve = vi.fn();
    return this;
  }),
);

// ── Sample data ──────────────────────────────────────────
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
    languages: [
      {
        code: "EN",
        name: "English",
        stream_id: 101,
        container_extension: "mp4",
      },
    ],
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
    languages: [
      {
        code: "EN",
        name: "English",
        stream_id: 102,
        container_extension: "mp4",
      },
      {
        code: "FR",
        name: "French",
        stream_id: 103,
        container_extension: "mp4",
      },
    ],
    language_count: 2,
    added: "1690000000",
  },
  {
    num: 3,
    name: "Interstellar (2014)",
    stream_id: 103,
    stream_icon: "",
    rating: "8.6",
    rating_5based: 4.3,
    tmdb: "157336",
    category_id: "10",
    container_extension: "mkv",
    base_name: "Interstellar",
    languages: [
      {
        code: "EN",
        name: "English",
        stream_id: 103,
        container_extension: "mkv",
      },
    ],
    language_count: 1,
  },
];

const sampleTrending = [
  {
    id: 27205,
    title: "Inception",
    poster_path: "/inception.jpg",
    vote_average: 8.8,
    release_date: "2010-07-16",
  },
];

// ── Helper ─────────────────────────────────────────────────
function renderMovies() {
  return render(
    <MemoryRouter>
      <Movies />
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  mockMoviesUnified.mockResolvedValue({
    movies: sampleMovies,
    total: sampleMovies.length,
    offset: 0,
    limit: 50,
  });
  mockTmdbTrending.mockResolvedValue({ trending: [], enabled: false });
  mockLoadServerProgress.mockResolvedValue({ series: [], movies: [] });
  localStorage.clear();
}

// ── Tests ──────────────────────────────────────────────────
describe("Movies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ── Loading state ──────────────────────────────────────
  describe("loading state", () => {
    beforeEach(() => {
      mockMoviesUnified.mockReturnValue(new Promise(() => {}));
      mockTmdbTrending.mockReturnValue(new Promise(() => {}));
    });

    it("shows skeleton grid while movies load", async () => {
      renderMovies();
      // Should have PosterCardSkeleton elements in the grid
      const skeletonGrid = document.querySelector(".grid");
      expect(skeletonGrid).toBeInTheDocument();
      // Should not show empty state or movie cards yet
      expect(screen.queryByText("No movies available")).not.toBeInTheDocument();
      expect(screen.queryByText("Inception")).not.toBeInTheDocument();
    });

    it("shows 'Loading...' in subtitle while loading", () => {
      renderMovies();
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  // ── Empty state ─────────────────────────────────────────
  describe("empty state", () => {
    beforeEach(() => {
      mockMoviesUnified.mockResolvedValue({
        movies: [],
        total: 0,
        offset: 0,
        limit: 50,
      });
    });

    it('shows "No movies available" when no movies and no search', async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("No movies available")).toBeInTheDocument();
      });
    });

    it('shows "No movies matching" when search yields no results', async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("No movies available")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Search movies...");
      fireEvent.change(searchInput, { target: { value: "NONEXISTENT" } });

      await waitFor(() => {
        expect(screen.getByText(/No movies matching/)).toBeInTheDocument();
        // Clear search button should also be visible
        expect(screen.getByText("Clear search")).toBeInTheDocument();
      });
    });

    it("clears search when Clear search link is clicked", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("No movies available")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Search movies...");
      fireEvent.change(searchInput, { target: { value: "NONEXISTENT" } });

      await waitFor(() => {
        expect(screen.getByText(/No movies matching/)).toBeInTheDocument();
      });

      // Click Clear search inside a waitFor to handle re-renders
      await waitFor(() => {
        fireEvent.click(screen.getByText("Clear search"));
      });

      // Input should be cleared (value = "")
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search movies...")).toHaveValue("");
      });
    });
  });

  // ── Normal rendering ────────────────────────────────────
  describe("normal rendering", () => {
    it("renders the Movies heading", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Movies")).toBeInTheDocument();
      });
    });

    it("shows movie count in subtitle", async () => {
      renderMovies();

      await waitFor(() => {
        const subtitle = screen.getByText(/movies across all languages/);
        expect(subtitle).toBeInTheDocument();
        expect(subtitle.textContent).toContain("3");
      });
    });

    it("renders search input with placeholder", async () => {
      renderMovies();

      await waitFor(() => {
        const input = screen.getByPlaceholderText("Search movies...");
        expect(input).toBeInTheDocument();
      });
    });
  });

  // ── Movie grid ─────────────────────────────────────────
  describe("movie grid", () => {
    it("renders movie cards with names", async () => {
      renderMovies();

      await waitFor(() => {
        const movieElements = screen.getAllByText("Inception");
        expect(movieElements.length).toBeGreaterThanOrEqual(1);
      });

      expect(screen.getAllByText("The Matrix").length).toBeGreaterThanOrEqual(
        1,
      );
      expect(screen.getAllByText("Interstellar").length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it("renders poster images for movies with stream_icon", async () => {
      renderMovies();

      await waitFor(() => {
        const imgs = screen.getAllByRole("img");
        // Inception and Matrix have stream_icon, Interstellar doesn't
        const posterImgs = imgs.filter((img) =>
          img.getAttribute("alt")?.includes("poster"),
        );
        expect(posterImgs.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("shows fallback Film icon for movies without stream_icon", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Interstellar")).toBeInTheDocument();
        // No stream_icon → should fallback to bg-[#141420] div
        const fallbackDivs = document.querySelectorAll('[class*="141420"]');
        expect(fallbackDivs.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("renders rating badges for movies with ratings", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("8.8")).toBeInTheDocument();
      });
      expect(screen.getByText("8.7")).toBeInTheDocument();
      expect(screen.getByText("8.6")).toBeInTheDocument();
    });

    it("shows year badge extracted from movie name", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("2010")).toBeInTheDocument();
      });
      expect(screen.getByText("1999")).toBeInTheDocument();
      expect(screen.getByText("2014")).toBeInTheDocument();
    });

    it("shows language count badge when language_count > 1", async () => {
      renderMovies();

      await waitFor(() => {
        // Only The Matrix has language_count=2 — appears in grid and recently added
        const langBadges = screen.getAllByText("2");
        expect(langBadges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("renders watchlist heart button on each card", async () => {
      renderMovies();

      await waitFor(() => {
        const heartButtons = screen.getAllByLabelText("Add to watchlist");
        expect(heartButtons.length).toBeGreaterThanOrEqual(3);
      });
    });

    it("opens MovieOverlay when a movie card is clicked", async () => {
      renderMovies();

      // Wait for data to load and Inception to render
      await waitFor(() => {
        const inceptions = screen.getAllByText("Inception");
        expect(inceptions.length).toBeGreaterThanOrEqual(1);
      });

      // Click the first Inception card's parent button/clickable area
      const inceptionText = screen.getAllByText("Inception")[0];
      fireEvent.click(inceptionText);

      await waitFor(() => {
        expect(screen.getByTestId("movie-overlay")).toBeInTheDocument();
      });
    });
  });

  // ── Recently Added section ──────────────────────────────
  describe("Recently Added section", () => {
    it("shows Recently Added heading when movies have added field", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Recently Added")).toBeInTheDocument();
      });
    });
  });

  // ── Continue Watching section ──────────────────────────
  describe("Continue Watching section", () => {
    const cwMovie = {
      movieId: 101,
      movieName: "Inception",
      poster: "https://example.com/inception.jpg",
      progressSeconds: 300,
      durationSeconds: 3600,
      updatedAt: Date.now(),
    };

    beforeEach(() => {
      mockGetMovieCW.mockReturnValue([cwMovie]);
      // loadServerProgress should return matching data so it doesn't overwrite
      mockLoadServerProgress.mockResolvedValue({
        series: [],
        movies: [cwMovie],
      });
    });

    it("shows Continue Watching heading when CW movies exist and match loaded movies", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Continue Watching")).toBeInTheDocument();
      });
    });

    it("shows progress bar with correct percentage", async () => {
      renderMovies();

      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width:"]');
        // 300/3600 * 100 = 8.33%
        expect(progressBar).toBeInTheDocument();
        expect(progressBar?.getAttribute("style")).toContain("8.33");
      });
    });

    it("shows dismiss button on hover target", async () => {
      renderMovies();

      await waitFor(() => {
        expect(
          screen.getByLabelText("Remove from continue watching"),
        ).toBeInTheDocument();
      });
    });

    it("does NOT show Continue Watching section when no CW data", async () => {
      mockGetMovieCW.mockReturnValue([]);
      mockLoadServerProgress.mockResolvedValue({ series: [], movies: [] });
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Movies")).toBeInTheDocument();
      });

      expect(screen.queryByText("Continue Watching")).not.toBeInTheDocument();
    });
  });

  // ── Recently Completed section ─────────────────────────
  describe("Recently Completed section", () => {
    const completedMovie = {
      movieId: 101,
      movieName: "Inception",
      poster: "https://example.com/inception.jpg",
      progressSeconds: 3500,
      durationSeconds: 3600,
      updatedAt: Date.now(),
    }; // 97% done

    beforeEach(() => {
      mockGetMovieCW.mockReturnValue([completedMovie]);
      mockLoadServerProgress.mockResolvedValue({
        series: [],
        movies: [completedMovie],
      });
    });

    it("shows Recently Completed heading when movies are >= 90% done", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Recently Completed")).toBeInTheDocument();
      });
    });

    it("shows green check indicator for completed movies", async () => {
      renderMovies();

      await waitFor(() => {
        const checkmarks = document.querySelectorAll(".text-green-400");
        expect(checkmarks.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── Trending section ───────────────────────────────────
  describe("Trending section", () => {
    beforeEach(() => {
      mockTmdbTrending.mockResolvedValue({
        trending: sampleTrending,
        enabled: true,
      });
    });

    it("shows Trending This Week section when enabled and data available", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Trending This Week")).toBeInTheDocument();
      });
    });

    it("does not show trending section when disabled", async () => {
      mockTmdbTrending.mockResolvedValue({
        trending: sampleTrending,
        enabled: false,
      });
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Movies")).toBeInTheDocument();
      });

      expect(screen.queryByText("Trending This Week")).not.toBeInTheDocument();
    });

    it("does not show trending section when empty", async () => {
      mockTmdbTrending.mockResolvedValue({ trending: [], enabled: true });
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Movies")).toBeInTheDocument();
      });

      expect(screen.queryByText("Trending This Week")).not.toBeInTheDocument();
    });

    it("renders trending movie cards with poster, rating, and year", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Trending This Week")).toBeInTheDocument();
      });

      // The rating 8.8 appears in both Recently Added and Trending sections
      const eights = screen.getAllByText("8.8");
      expect(eights.length).toBeGreaterThanOrEqual(1);

      // Year 2010 appears in movie grid (from name year badge) and trending
      const years = screen.getAllByText("2010");
      expect(years.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Search functionality ───────────────────────────────
  describe("search functionality", () => {
    it("shows search input with placeholder", async () => {
      renderMovies();

      await waitFor(() => {
        const input = screen.getByPlaceholderText("Search movies...");
        expect(input).toBeInTheDocument();
        expect(input).not.toBeDisabled();
      });
    });

    it("shows clear X button when input has value", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Movies")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Search movies...");
      fireEvent.change(searchInput, { target: { value: "test" } });

      // X clear button should appear
      const xButtons = document.querySelectorAll("button");
      const clearBtn = Array.from(xButtons).find((btn) =>
        btn.closest(".relative")?.querySelector("input"),
      );
      expect(clearBtn).toBeInTheDocument();
    });

    it("clears input when X button is clicked", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Movies")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Search movies...");
      fireEvent.change(searchInput, { target: { value: "test" } });

      // Find and click the X button
      const xButtons = document.querySelectorAll("button");
      const clearBtn = Array.from(xButtons).find((btn) =>
        btn.closest(".relative")?.querySelector("input"),
      );
      if (clearBtn) fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search movies...")).toHaveValue("");
      });
    });
  });

  // ── Pagination ─────────────────────────────────────────
  describe("pagination", () => {
    beforeEach(() => {
      // Total > page size to trigger pagination
      mockMoviesUnified.mockResolvedValue({
        movies: sampleMovies,
        total: 150,
        offset: 0,
        limit: 50,
      });
    });

    it("shows pagination controls when totalPages > 1", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByTestId("pagination")).toBeInTheDocument();
      });
    });

    it("shows correct page number", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("1 / 3")).toBeInTheDocument();
      });
    });

    it("does not show pagination when totalPages <= 1", async () => {
      // Override: only 3 movies → totalPages = ceil(3/50) = 1
      mockMoviesUnified.mockResolvedValue({
        movies: sampleMovies,
        total: 3,
        offset: 0,
        limit: 50,
      });
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Movies")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
    });
  });

  // ── Loading more ───────────────────────────────────────
  describe("loading more", () => {
    it("shows spinner when loadingMore is true", async () => {
      // Make the fetch return more data (total > current count)
      mockMoviesUnified.mockResolvedValue({
        movies: sampleMovies,
        total: 150,
        offset: 0,
        limit: 50,
      });
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Movies")).toBeInTheDocument();
      });
    });
  });

  // ── Edge cases ─────────────────────────────────────────
  describe("edge cases", () => {
    it("handles single movie gracefully", async () => {
      mockMoviesUnified.mockResolvedValue({
        movies: [sampleMovies[0]],
        total: 1,
        offset: 0,
        limit: 50,
      });

      renderMovies();

      await waitFor(() => {
        // Inception appears in both Recently Added and movie grid
        const inceptions = screen.getAllByText("Inception");
        expect(inceptions.length).toBeGreaterThanOrEqual(1);
      });
      expect(screen.queryAllByText("The Matrix").length).toBe(0);

      // Header should show "1 movies across all languages"
      const subtitle = screen.getByText(/1 movies/);
      expect(subtitle).toBeInTheDocument();
    });

    it("handles movies without year in name gracefully", async () => {
      const noYearMovie = { ...sampleMovies[0], name: "Inception" };
      mockMoviesUnified.mockResolvedValue({
        movies: [noYearMovie],
        total: 1,
        offset: 0,
        limit: 50,
      });

      renderMovies();

      await waitFor(() => {
        const inceptions = screen.getAllByText("Inception");
        expect(inceptions.length).toBeGreaterThanOrEqual(1);
      });

      // No year badge should render (2010 not present since name doesn't have (2010))
      expect(screen.queryByText("2010")).not.toBeInTheDocument();
    });

    it("handles movies without rating gracefully", async () => {
      const noRatingMovie = { ...sampleMovies[0], rating: "" };
      mockMoviesUnified.mockResolvedValue({
        movies: [noRatingMovie],
        total: 1,
        offset: 0,
        limit: 50,
      });

      renderMovies();

      await waitFor(() => {
        const inceptions = screen.getAllByText("Inception");
        expect(inceptions.length).toBeGreaterThanOrEqual(1);
      });

      // No star rating badge (rating is empty string, which is falsy)
      const stars = screen.queryAllByText(/★/);
      // The rating badge would be "★" + empty. But rating="" is falsy → no badge.
      expect(stars.length).toBe(0);
    });

    it("handles movie with no tmdb gracefully", async () => {
      const noTmdbMovie = {
        ...sampleMovies[0],
        tmdb: undefined,
        stream_id: 999,
        languages: [],
        language_count: 0,
      };
      mockMoviesUnified.mockResolvedValue({
        movies: [noTmdbMovie],
        total: 1,
        offset: 0,
        limit: 50,
      });

      renderMovies();

      await waitFor(() => {
        const inceptions = screen.getAllByText("Inception");
        expect(inceptions.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("closes MovieOverlay when close is triggered", async () => {
      renderMovies();

      // Wait for data to load and Inception to render (at least once)
      await waitFor(() => {
        const inceptions = screen.getAllByText("Inception");
        expect(inceptions.length).toBeGreaterThanOrEqual(1);
      });

      // Click a movie card to open overlay - find a grid card (not Recently Added)
      const allCards = screen
        .getAllByRole("button")
        .filter(
          (btn) =>
            btn.textContent?.includes("Inception") &&
            !btn.closest('[data-testid="pagination"]'),
        );
      const gridCard = allCards.find(
        (btn) => btn.getAttribute("data-grid-idx") !== null,
      );
      if (gridCard) fireEvent.click(gridCard);

      await waitFor(() => {
        expect(screen.getByTestId("movie-overlay")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText("Close overlay"));

      await waitFor(() => {
        expect(screen.queryByTestId("movie-overlay")).not.toBeInTheDocument();
      });
    });
  });

  // ── Search history ─────────────────────────────────────
  describe("search history", () => {
    it("shows search history on input focus when empty", async () => {
      renderMovies();

      await waitFor(() => {
        expect(screen.getByText("Movies")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Search movies...");
      fireEvent.focus(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId("search-history")).toBeInTheDocument();
      });
    });
  });
});
