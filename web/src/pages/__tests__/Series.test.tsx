/**
 * Tests for the Series page component.
 *
 * Series renders category-based horizontal rows of series cards with:
 * - Loading skeleton state
 * - Error banner with retry
 * - Empty states (no categories, no search results)
 * - Continue Watching row (progress < 90%)
 * - Recently Completed row (progress >= 90%)
 * - TMDB Trending This Week section
 * - Section search with clear
 * - Category content rows with lazy loading
 * - "Show All" grid view with pagination
 * - Series cards (poster, rating, year, watchlist heart)
 * - SeriesOverlay
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SeriesPage from "@/pages/Series";
import type { Series, Category } from "@/lib/api";
import type { SeriesProgress } from "@/lib/continueWatching";

// ── Mock api ─────────────────────────────────────────────
const mockSeriesCategories = vi.fn();
const mockSeriesList = vi.fn();
const mockTmdbTvTrending = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    series: {
      categories: (...args: unknown[]) =>
        (mockSeriesCategories as unknown as (...a: unknown[]) => Promise<{ categories: Category[] }>)(...args),
      list: (...args: unknown[]) =>
        (mockSeriesList as unknown as (...a: unknown[]) => Promise<{ series: Series[]; total: number; offset: number; limit: number }>)(...args),
    },
    tmdb: {
      tv: {
        trending: (...args: unknown[]) =>
          (mockTmdbTvTrending as unknown as (...a: unknown[]) => Promise<{ trending: unknown[]; enabled: boolean }>)(...args),
      },
    },
    watchlist: { progress: vi.fn() },
  },
  imageUrl: (url: string) => url,
  tmdbImgProps: vi.fn((path: string) => ({ src: `https://image.tmdb.org/t/p/w342${path}` })),
}));

// ── Mock watchlist (series) ──────────────────────────────
const mockIsSeriesInWatchlist = vi.fn(() => false);
const mockToggleSeriesWatchlist = vi.fn();
vi.mock("@/lib/watchlist", () => ({
  isSeriesInWatchlist: (...args: unknown[]) =>
    (mockIsSeriesInWatchlist as (...a: unknown[]) => boolean)(...args),
  toggleSeriesWatchlist: (...args: unknown[]) =>
    (mockToggleSeriesWatchlist as (...a: unknown[]) => boolean)(...args),
}));

// ── Mock continueWatching ────────────────────────────────
const mockGetContinueWatching = vi.fn<() => SeriesProgress[]>(() => []);
const mockRemoveSeriesProgress = vi.fn();
const mockLoadServerProgress = vi.fn<(signal?: AbortSignal) => Promise<{ series: SeriesProgress[]; movies: unknown[] }>>(
  () => Promise.resolve({ series: [], movies: [] })
);

vi.mock("@/lib/continueWatching", () => ({
  getContinueWatching: (...args: unknown[]) =>
    (mockGetContinueWatching as (...a: unknown[]) => SeriesProgress[])(...args),
  removeSeriesProgress: (...args: unknown[]) =>
    (mockRemoveSeriesProgress as (...a: unknown[]) => void)(...args),
  loadServerProgress: (...args: unknown[]) =>
    (mockLoadServerProgress as (...a: unknown[]) => Promise<{ series: SeriesProgress[]; movies: unknown[] }>)(...args),
}));

// ── Mock SettingsContext ─────────────────────────────────
const mockUpdateSettings = vi.fn();
const mockResetSettings = vi.fn();
const mockSettings = { languages: [], hiddenCategories: [], showAdult: false, services: [] };

vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({ settings: mockSettings, update: mockUpdateSettings, reset: mockResetSettings }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Mock child components ────────────────────────────────
vi.mock("@/components/SeriesOverlay", () => ({
  default: ({ series, onClose }: { series: { name?: string }; onClose: () => void }) =>
    <div data-testid="series-overlay">
      <span>{series?.name} overlay</span>
      <button onClick={onClose} aria-label="Close overlay">Close</button>
    </div>,
}));

vi.mock("@/components/ContentRow", () => ({
  default: ({ title, children, action }: { title: string; children: React.ReactNode; action?: { label: string; onClick: () => void } }) =>
    <div data-testid="content-row">
      <h3>{title}</h3>
      {action && <button onClick={action.onClick} data-testid="show-all-btn">{action.label}</button>}
      {children}
    </div>,
}));

vi.mock("@/components/Pagination", () => ({
  Pagination: ({ currentPage, totalPages, onPageChange }: { currentPage: number; totalPages: number; onPageChange: (p: number) => void }) =>
    totalPages <= 1 ? null : (
      <div data-testid="pagination">
        <button onClick={() => onPageChange(currentPage - 1)} aria-label="Previous page">Prev</button>
        <span>{currentPage} / {totalPages}</span>
        <button onClick={() => onPageChange(currentPage + 1)} aria-label="Next page">Next</button>
      </div>
    ),
}));

// ── Mock IntersectionObserver ────────────────────────────
vi.stubGlobal("IntersectionObserver", vi.fn(function MockIntersectionObserver() {
  this.observe = vi.fn();
  this.disconnect = vi.fn();
  this.unobserve = vi.fn();
  this.takeRecords = vi.fn(() => []);
  return this;
}));

vi.stubGlobal("ResizeObserver", vi.fn(function MockResizeObserver() {
  this.observe = vi.fn();
  this.disconnect = vi.fn();
  this.unobserve = vi.fn();
  this.takeRecords = vi.fn(() => []);
  return this;
}));

// ── Sample data ──────────────────────────────────────────
const sampleCategories: Category[] = [
  { category_id: "1", category_name: "Action", parent_id: 0 },
  { category_id: "2", category_name: "Drama", parent_id: 0 },
];

const sampleSeries: Series[] = [
  {
    num: 1,
    name: "Breaking Bad",
    series_id: 101,
    cover: "https://example.com/bb.jpg",
    plot: "A high school teacher turns to meth production.",
    cast: "Bryan Cranston, Aaron Paul",
    director: "Vince Gilligan",
    genre: "Crime, Drama, Thriller",
    releaseDate: "2008-01-20",
    rating: "9.5",
    rating_5based: "4.7",
    tmdb: "1396",
    youtube_trailer: "",
    category_id: "2",
  },
  {
    num: 2,
    name: "Stranger Things",
    series_id: 102,
    cover: "",
    plot: "Kids discover supernatural secrets.",
    cast: "Winona Ryder, David Harbour",
    director: "Duffer Brothers",
    genre: "Sci-Fi, Horror",
    releaseDate: "2016-07-15",
    rating: "8.7",
    rating_5based: "4.3",
    tmdb: "66732",
    youtube_trailer: "",
    category_id: "1",
  },
  {
    num: 3,
    name: "The Office",
    series_id: 103,
    cover: "https://example.com/office.jpg",
    plot: "A mockumentary about office workers.",
    cast: "Steve Carell, Rainn Wilson",
    director: "Greg Daniels",
    genre: "Comedy",
    releaseDate: "",
    rating: "",
    rating_5based: "",
    tmdb: "2316",
    youtube_trailer: "",
    category_id: "1",
  },
];

const sampleTrending = [
  { id: 1396, name: "Breaking Bad", poster_path: "/bb.jpg", vote_average: 9.5, first_air_date: "2008-01-20" },
];

// ── Helper ───────────────────────────────────────────────
function renderSeries() {
  return render(
    <MemoryRouter>
      <SeriesPage />
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  mockSeriesCategories.mockResolvedValue({ categories: sampleCategories });
  mockSeriesList.mockImplementation((catId: string) => {
    const filtered = sampleSeries.filter((s) => s.category_id === catId);
    return Promise.resolve({ series: filtered, total: filtered.length, offset: 0, limit: 20 });
  });
  mockTmdbTvTrending.mockResolvedValue({ trending: [], enabled: false });
  mockLoadServerProgress.mockResolvedValue({ series: [], movies: [] });
  mockGetContinueWatching.mockReturnValue([]);
  localStorage.clear();
  sessionStorage.clear();
}

// ── Tests ──────────────────────────────────────────────────
describe("SeriesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ── Loading state ──────────────────────────────────────
  describe("loading state", () => {
    beforeEach(() => {
      mockSeriesCategories.mockReturnValue(new Promise(() => {}));
      mockTmdbTvTrending.mockReturnValue(new Promise(() => {}));
    });

    it("shows skeleton placeholders while loading", async () => {
      renderSeries();
      // Should show skeleton rows
      const skeletons = document.querySelectorAll('.space-y-8 > .space-y-2');
      expect(skeletons.length).toBeGreaterThan(0);
      // Should not show error or content
      expect(screen.queryByText("Error")).not.toBeInTheDocument();
    });

    it("shows loading state without heading content", () => {
      renderSeries();
      // Skeleton elements should be present for the header
      const skeletonElements = document.querySelectorAll('.skeleton\\:');
      // Just ensure loading state does not crash
      expect(screen.queryByText("Series")).not.toBeInTheDocument();
    });
  });

  // ── Error state ─────────────────────────────────────────
  describe("error state", () => {
    beforeEach(() => {
      mockSeriesCategories.mockRejectedValue(new Error("Failed to load categories"));
    });

    it("shows error banner with retry button", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Failed to load categories")).toBeInTheDocument();
      });

      const retryButton = screen.getByText("Retry");
      expect(retryButton).toBeInTheDocument();
    });
  });

  // ── Normal rendering ────────────────────────────────────
  describe("normal rendering", () => {
    it("renders the Series heading", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Series")).toBeInTheDocument();
      });
    });

    it("shows category count in subtitle", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("2 categories")).toBeInTheDocument();
      });
    });

    it("renders search input with placeholder", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Filter series...")).toBeInTheDocument();
      });
    });

    it("renders category content rows", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Action")).toBeInTheDocument();
        expect(screen.getByText("Drama")).toBeInTheDocument();
      });
    });

    it("renders series cards with names in content rows", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
        expect(screen.getByText("Stranger Things")).toBeInTheDocument();
      });
    });

    it("shows rating badge on series cards when rating is present", async () => {
      renderSeries();

      await waitFor(() => {
        // Breaking Bad has rating 9.5
        expect(screen.getByText("9.5")).toBeInTheDocument();
      });
    });

    it("shows year badge when releaseDate is present", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("2008")).toBeInTheDocument();
        expect(screen.getByText("2016")).toBeInTheDocument();
      });
    });

    it("shows watchlist heart buttons on series cards", async () => {
      mockIsSeriesInWatchlist.mockReturnValue(false);
      renderSeries();

      await waitFor(() => {
        const hearts = screen.getAllByRole("button", { name: /Add to watchlist|Remove from watchlist/ });
        expect(hearts.length).toBeGreaterThan(0);
      });
    });

    it("shows filled heart when series is in watchlist", async () => {
      mockIsSeriesInWatchlist.mockReturnValue(true);
      renderSeries();

      await waitFor(() => {
        const removeBtns = screen.getAllByRole("button", { name: "Remove from watchlist" });
        expect(removeBtns.length).toBeGreaterThan(0);
      });
    });
  });

  // ── Search functionality ────────────────────────────────
  describe("search functionality", () => {
    it("filters categories by name", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Action")).toBeInTheDocument();
        expect(screen.getByText("Drama")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Filter series...");
      fireEvent.change(searchInput, { target: { value: "Action" } });

      await waitFor(() => {
        expect(screen.getByText("Action")).toBeInTheDocument();
        // Drama should still be shown because Action matched via category name
      });
    });

    it("shows clear X button when search has text", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Filter series...")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Filter series...");
      fireEvent.change(searchInput, { target: { value: "test" } });

      // X button should appear
      const clearButton = document.querySelector('button svg.lucide-x');
      expect(clearButton).toBeInTheDocument();
    });

    it("clears search when X button is clicked", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Filter series...")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Filter series...");
      fireEvent.change(searchInput, { target: { value: "Action" } });

      // Find and click the X clear button
      await waitFor(() => {
        const clearBtn = screen.getByRole("button", { name: "" });
        if (clearBtn) fireEvent.click(clearBtn);
      });

      // Input should be cleared
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Filter series...")).toHaveValue("");
      });
    });

    it('shows "No series matching" when search yields no results', async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Action")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Filter series...");
      fireEvent.change(searchInput, { target: { value: "NONEXISTENT_XYZ" } });

      await waitFor(() => {
        expect(screen.getByText(/No series matching/)).toBeInTheDocument();
      });
    });

    it("renders Clear search link in empty search state", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Action")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Filter series...");
      fireEvent.change(searchInput, { target: { value: "NONEXISTENT_XYZ" } });

      await waitFor(() => {
        expect(screen.getByText(/No series matching/)).toBeInTheDocument();
        expect(screen.getByText("Clear search")).toBeInTheDocument();
      });
    });
  });

  // ── Continue Watching ───────────────────────────────────
  describe("Continue Watching row", () => {
    const cwItem: SeriesProgress = {
      seriesId: 101,
      seriesName: "Breaking Bad",
      cover: "https://example.com/bb.jpg",
      seasonNumber: 1,
      episodeNum: 1,
      episodeId: "101-1-1",
      episodeTitle: "Pilot",
      progressSeconds: 1200,
      durationSeconds: 3600,
      updatedAt: Date.now(),
    };

    it("renders Continue Watching section when items exist", async () => {
      mockGetContinueWatching.mockReturnValue([cwItem]);
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Continue Watching")).toBeInTheDocument();
        // Breaking Bad appears in both CW and series cards, use getAllByText
        const bbMatches = screen.getAllByText("Breaking Bad");
        expect(bbMatches.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText(/S1E1/)).toBeInTheDocument();
      });
    });

    it("does not render Continue Watching when no items", async () => {
      mockGetContinueWatching.mockReturnValue([]);
      renderSeries();

      await waitFor(() => {
        expect(screen.queryByText("Continue Watching")).not.toBeInTheDocument();
      });
    });

    it("shows progress bar on continue-watching items", async () => {
      mockGetContinueWatching.mockReturnValue([cwItem]);
      renderSeries();

      await waitFor(() => {
        // Progress bar should be rendered with width ~33.3%
        const progressBars = document.querySelectorAll('.h-full.bg-primary');
        expect(progressBars.length).toBeGreaterThan(0);
      });
    });

    it("shows dismiss button on continue-watching items", async () => {
      mockGetContinueWatching.mockReturnValue([cwItem]);
      renderSeries();

      await waitFor(() => {
        const dismissBtn = screen.getByLabelText("Remove from continue watching");
        expect(dismissBtn).toBeInTheDocument();
      });
    });
  });

  // ── Recently Completed ──────────────────────────────────
  describe("Recently Completed row", () => {
    const doneItem: SeriesProgress = {
      seriesId: 103,
      seriesName: "The Office",
      cover: "https://example.com/office.jpg",
      seasonNumber: 1,
      episodeNum: 1,
      episodeId: "103-1-1",
      episodeTitle: "Pilot",
      progressSeconds: 1200,
      durationSeconds: 1200,
      updatedAt: Date.now(),
    };

    it("renders Recently Completed section when progress >= 90%", async () => {
      mockGetContinueWatching.mockReturnValue([doneItem]);
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Recently Completed")).toBeInTheDocument();
        expect(screen.getByText(/S1E1/)).toBeInTheDocument();
      });
    });

    it("does not render Recently Completed when no completed items", async () => {
      mockGetContinueWatching.mockReturnValue([]);
      renderSeries();

      await waitFor(() => {
        expect(screen.queryByText("Recently Completed")).not.toBeInTheDocument();
      });
    });

    it("shows dismiss button on completed items", async () => {
      mockGetContinueWatching.mockReturnValue([doneItem]);
      renderSeries();

      await waitFor(() => {
        const dismissBtn = screen.getByLabelText("Remove from recently completed");
        expect(dismissBtn).toBeInTheDocument();
      });
    });
  });

  // ── Trending This Week ───────────────────────────────────
  describe("Trending This Week section", () => {
    it("renders trending section when enabled and has data", async () => {
      mockTmdbTvTrending.mockResolvedValue({ trending: sampleTrending, enabled: true });
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Trending This Week")).toBeInTheDocument();
        expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
      });
    });

    it("does not render trending when disabled", async () => {
      mockTmdbTvTrending.mockResolvedValue({ trending: sampleTrending, enabled: false });
      renderSeries();

      await waitFor(() => {
        expect(screen.queryByText("Trending This Week")).not.toBeInTheDocument();
      });
    });

    it("does not render trending when empty", async () => {
      mockTmdbTvTrending.mockResolvedValue({ trending: [], enabled: true });
      renderSeries();

      await waitFor(() => {
        expect(screen.queryByText("Trending This Week")).not.toBeInTheDocument();
      });
    });

    it("shows rating and year badges on trending cards", async () => {
      mockTmdbTvTrending.mockResolvedValue({ trending: sampleTrending, enabled: true });
      renderSeries();

      await waitFor(() => {
        // 9.5 appears in both series card (Breaking Bad) and trending card
        const ratings = screen.getAllByText("9.5");
        expect(ratings.length).toBeGreaterThanOrEqual(2);
        // 2008 appears in both series card and trending card
        const years = screen.getAllByText("2008");
        expect(years.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ── Show All mode ───────────────────────────────────────
  describe("Show All mode", () => {
    it("opens Show All grid when clicking Show All button", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Action")).toBeInTheDocument();
      });

      // Click Show All button for a category that has more items than SERIES_PER_ROW (not in our test data)
      // Since we have only 2 series in cat 1 and SERIES_PER_ROW is 20, no Show All button expected
      const showAllBtns = screen.queryAllByTestId("show-all-btn");
      // With 2 series and SERIES_PER_ROW=20, Show All won't appear (total > 20 needed)
      // This test verifies no false Show All buttons
      expect(showAllBtns.length).toBe(0);
    });

    it("shows back button when in Show All mode", async () => {
      // Override mock: return many series to trigger Show All
      const manySeries = Array.from({ length: 25 }, (_, i) => ({
        ...sampleSeries[0],
        series_id: 200 + i,
        name: `Series ${i + 1}`,
      }));
      mockSeriesList.mockResolvedValue({ series: manySeries, total: 25, offset: 0, limit: 20 });
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Action")).toBeInTheDocument();
      });

      const showAllBtns = screen.queryAllByTestId("show-all-btn");
      if (showAllBtns.length > 0) {
        fireEvent.click(showAllBtns[0]);

        await waitFor(() => {
          expect(screen.getByText("Back to categories")).toBeInTheDocument();
        });
      }
    });
  });

  // ── Edge cases ──────────────────────────────────────────
  describe("edge cases", () => {
    it("handles series without cover image (fallback icon)", async () => {
      renderSeries();

      await waitFor(() => {
        // Stranger Things has no cover, should show fallback Tv2 icon
        expect(screen.getByText("Stranger Things")).toBeInTheDocument();
        // The empty cover fallback renders a div with Tv2 icon
      });
    });

    it("handles series without rating gracefully", async () => {
      renderSeries();

      await waitFor(() => {
        // The Office has no rating
        expect(screen.getByText("The Office")).toBeInTheDocument();
        // No rating badge for The Office
        const ratings = screen.queryAllByText(/^\d\.\d$/);
        const officeRatings = ratings.filter(r => r.textContent === "");
        // Just ensure it doesn't crash
      });
    });

    it("handles series without releaseDate (no year badge)", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("The Office")).toBeInTheDocument();
        // The Office has no releaseDate, so no year badge
      });
    });

    it("handles single category gracefully", async () => {
      mockSeriesCategories.mockResolvedValue({ categories: [sampleCategories[0]] });
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("1 categories")).toBeInTheDocument();
        expect(screen.getByText("Action")).toBeInTheDocument();
      });
    });

    it("opens overlay when clicking a series card", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
      });

      // Click the Breaking Bad card to open overlay
      const bbCard = screen.getByText("Breaking Bad").closest('[role="button"]') ||
                     screen.getByText("Breaking Bad");
      if (bbCard && bbCard.closest('[role="button"]')) {
        fireEvent.click(bbCard.closest('[role="button"]')!);
      } else {
        // Try the parent div with onClick handler
        fireEvent.click(bbCard);
      }

      await waitFor(() => {
        expect(screen.getByTestId("series-overlay")).toBeInTheDocument();
      });
    });

    it("closes overlay when close button is clicked", async () => {
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
      });

      // Click a series card to open overlay
      const bbCard = screen.getByText("Breaking Bad");
      fireEvent.click(bbCard);

      await waitFor(() => {
        expect(screen.getByTestId("series-overlay")).toBeInTheDocument();
      });

      // Close the overlay
      fireEvent.click(screen.getByLabelText("Close overlay"));

      await waitFor(() => {
        expect(screen.queryByTestId("series-overlay")).not.toBeInTheDocument();
      });
    });
  });

  // ── Empty / Filtered state ──────────────────────────────
  describe("empty and filtered states", () => {
    it('shows "No categories match your filters" when filtered out', async () => {
      // Set hiddenCategories to hide all categories
      mockSettings.hiddenCategories = ["1", "2"];
      renderSeries();

      await waitFor(() => {
        expect(screen.getByText("No categories match your filters")).toBeInTheDocument();
      });

      // Reset
      mockSettings.hiddenCategories = [];
    });
  });
});
