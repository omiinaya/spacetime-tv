/**
 * Tests for the HomePage continue-watching sections.
 *
 * HomePage renders "Continue Watching" rows for series and movies
 * from localStorage progress data, plus TMDB trending sections.
 * This test suite focuses on the continue-watching rendering:
 * empty state, item rendering, progress bars, cover fallback,
 * and resume interaction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HomePage from "@/pages/HomePage";
import type { SeriesProgress, MovieProgress } from "@/lib/continueWatching";

// ── Mock continueWatching module ──────────────────────────
let mockSeriesCW: SeriesProgress[] = [];
let mockMovieCW: MovieProgress[] = [];

const mockLoadServerProgress = vi.fn<
  () => Promise<{ series: SeriesProgress[]; movies: MovieProgress[] }>
>();

vi.mock("@/lib/continueWatching", () => ({
  getContinueWatching: () => mockSeriesCW,
  getMovieContinueWatching: () => mockMovieCW,
  loadServerProgress: (...args: unknown[]) =>
    (mockLoadServerProgress as unknown as (...a: unknown[]) => Promise<{ series: SeriesProgress[]; movies: MovieProgress[] }>)(...args),
}));

// ── Mock TMDB API (resolve immediately with no trending data) ──
const mockMovieTrending = vi.fn();
const mockTvTrending = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    tmdb: {
      trending: (...args: unknown[]) =>
        (mockMovieTrending as unknown as (...a: unknown[]) => Promise<{ trending: unknown[] }>)(...args),
      tv: {
        trending: (...args: unknown[]) =>
          (mockTvTrending as unknown as (...a: unknown[]) => Promise<{ trending: unknown[] }>)(...args),
      },
    },
  },
  tmdbImgProps: vi.fn(() => ({ src: "https://image.tmdb.org/poster.jpg" })),
}));

// ── Mock navigate ─────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Sample data ───────────────────────────────────────────
const sampleSeriesCW: SeriesProgress[] = [
  {
    seriesId: 1,
    seriesName: "Breaking Bad",
    cover: "https://image.tmdb.org/bb-poster.jpg",
    seasonNumber: 1,
    episodeNum: 3,
    episodeId: "ep-1-3",
    episodeTitle: "...And the Bag's in the River",
    progressSeconds: 1200,
    durationSeconds: 3600,
    updatedAt: Date.now() - 3600_000,
  },
  {
    seriesId: 2,
    seriesName: "Stranger Things",
    cover: "",
    seasonNumber: 2,
    episodeNum: 1,
    episodeId: "ep-2-1",
    episodeTitle: "Chapter One: MADMAX",
    progressSeconds: 0,
    durationSeconds: 3000,
    updatedAt: Date.now() - 7200_000,
  },
];

const singleSeriesCW: SeriesProgress[] = [sampleSeriesCW[0]];

const singleMovieCW: MovieProgress[] = [
  {
    movieId: 101,
    movieName: "Inception",
    poster: "https://image.tmdb.org/inception-poster.jpg",
    progressSeconds: 2400,
    durationSeconds: 5400,
    updatedAt: Date.now() - 1800_000,
  },
];

const sampleMovieCW: MovieProgress[] = [
  ...singleMovieCW,
  {
    movieId: 102,
    movieName: "The Matrix",
    poster: "",
    progressSeconds: 0,
    durationSeconds: 0,
    updatedAt: Date.now() - 86400_000,
  },
];

// ── Helper ─────────────────────────────────────────────────
function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  mockSeriesCW = [];
  mockMovieCW = [];
  mockLoadServerProgress.mockResolvedValue({ series: [], movies: [] });
  mockMovieTrending.mockResolvedValue({ trending: [] });
  mockTvTrending.mockResolvedValue({ trending: [] });
}

// ── Tests ─────────────────────────────────────────────────
describe("HomePage — Continue Watching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ── Empty state ─────────────────────────────────────────
  describe("empty state (no continue-watching, no trending)", () => {
    it("shows welcome message and quick links", async () => {
      renderHomePage();

      // Welcome section should render immediately
      expect(screen.getByText("Welcome")).toBeInTheDocument();

      // Quick links should be present
      expect(screen.getByText("Live TV")).toBeInTheDocument();
      expect(screen.getByText("Movies")).toBeInTheDocument();
      expect(screen.getByText("Series")).toBeInTheDocument();
      expect(screen.getByText("Watchlist")).toBeInTheDocument();
    });

    it("shows empty state after trending resolves with no data", async () => {
      renderHomePage();

      // Wait for trending to resolve (and thus trendingLoading → false)
      await waitFor(() => {
        expect(screen.getByText("Welcome to Spacetime-TV")).toBeInTheDocument();
      });

      expect(screen.getByText("Start watching from Live TV, Movies, or Series")).toBeInTheDocument();

      // Browse buttons should be present in empty state
      const browseLiveBtn = screen.getByText("Browse Live TV");
      expect(browseLiveBtn).toBeInTheDocument();
      const browseMoviesBtn = screen.getByText("Browse Movies");
      expect(browseMoviesBtn).toBeInTheDocument();
    });

    it('navigates to /live when "Browse Live TV" is clicked', async () => {
      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText("Welcome to Spacetime-TV")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Browse Live TV"));
      expect(mockNavigate).toHaveBeenCalledWith("/live");
    });

    it('navigates to /movies when "Browse Movies" is clicked', async () => {
      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText("Welcome to Spacetime-TV")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Browse Movies"));
      expect(mockNavigate).toHaveBeenCalledWith("/movies");
    });

    it("does NOT render Continue Watching sections when no data", () => {
      renderHomePage();
      expect(screen.queryByText("Continue Watching")).not.toBeInTheDocument();
      expect(screen.queryByText("Continue Watching — Movies")).not.toBeInTheDocument();
    });
  });

  // ── Series Continue Watching ────────────────────────────
  describe("series continue-watching", () => {
    beforeEach(() => {
      mockSeriesCW = singleSeriesCW;
    });

    it("renders the Continue Watching section with series items", async () => {
      renderHomePage();

      // Section title should be visible
      expect(screen.getByText("Continue Watching")).toBeInTheDocument();

      // Series name + progress should be visible
      expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
      expect(screen.getByText("S1 · E3")).toBeInTheDocument();
    });

    it("renders series poster image with lazy loading", () => {
      renderHomePage();
      const poster = screen.getByAltText("Breaking Bad poster");
      expect(poster).toBeInTheDocument();
      expect(poster).toHaveAttribute("loading", "lazy");
      expect(poster).toHaveAttribute("src", "https://image.tmdb.org/bb-poster.jpg");
    });

    it("shows fallback Tv2 icon when series has no cover", () => {
      mockSeriesCW = [sampleSeriesCW[1]]; // Stranger Things — no cover
      renderHomePage();

      expect(screen.getByText("Stranger Things")).toBeInTheDocument();
      // The fallback icon (Tv2) should be in a fallback container
      const fallbackContainer = screen.getByText("Stranger Things")
        .closest("button")
        ?.querySelector(".bg-\\[\\#141420\\]");
      // The fallback shows a Tv2 icon (lucide-react component → SVG)
      expect(fallbackContainer?.querySelector("svg")).toBeInTheDocument();
    });

    it("shows progress bar when durationSeconds > 0", () => {
      renderHomePage();

      // Breaking Bad: 1200/3600 = 33.3%
      const section = screen.getByText("Continue Watching").closest("section");
      expect(section).toBeInTheDocument();

      // The progress bar container has bg-black/40
      const progressBars = section!.querySelectorAll(".bg-black\\/40");
      expect(progressBars.length).toBeGreaterThanOrEqual(1);

      // The fill bar should have ~33.3% width
      const fillBar = progressBars[0]?.querySelector(".bg-primary") as HTMLElement | null;
      expect(fillBar).toBeInTheDocument();
      expect(fillBar?.style.width).toBe("33.33333333333333%");
    });

    it("does not show progress bar when durationSeconds is 0", () => {
      // Create an item with 0 duration
      mockSeriesCW = [{
        ...sampleSeriesCW[1],
        durationSeconds: 0,
        progressSeconds: 0,
      }];
      renderHomePage();

      // The section should render the item but no progress bar
      const section = screen.getByText("Continue Watching").closest("section");
      expect(section).toBeInTheDocument();

      // There should be no progress bar elements
      const progressBars = section!.querySelectorAll(".bg-black\\/40");
      expect(progressBars).toHaveLength(0);
    });

    it("navigates to series episode on click", () => {
      renderHomePage();

      const seriesCard = screen.getByText("Breaking Bad").closest("button");
      expect(seriesCard).toBeInTheDocument();
      fireEvent.click(seriesCard!);
      expect(mockNavigate).toHaveBeenCalledWith("/watch/series/1/ep-1-3");
    });
  });

  // ── Movie Continue Watching ─────────────────────────────
  describe("movie continue-watching", () => {
    beforeEach(() => {
      mockMovieCW = singleMovieCW;
    });

    it("renders the Continue Watching — Movies section", () => {
      renderHomePage();

      expect(screen.getByText("Continue Watching — Movies")).toBeInTheDocument();
    });

    it("renders movie poster with lazy loading", () => {
      renderHomePage();

      const poster = screen.getByAltText("Inception poster");
      expect(poster).toBeInTheDocument();
      expect(poster).toHaveAttribute("loading", "lazy");
      expect(poster).toHaveAttribute("src", "https://image.tmdb.org/inception-poster.jpg");
    });

    it("shows fallback Film icon when movie has no poster", () => {
      mockMovieCW = [sampleMovieCW[1]]; // The Matrix — no poster
      renderHomePage();

      expect(screen.getByText("The Matrix")).toBeInTheDocument();
      // The fallback container with Film icon
      const card = screen.getByText("The Matrix").closest("button");
      const fallbackDiv = card?.querySelector(".bg-\\[\\#141420\\]");
      expect(fallbackDiv?.querySelector("svg")).toBeInTheDocument();
    });

    it("shows progress bar for movies with duration", () => {
      renderHomePage();

      // Inception: 2400/5400 = 44.44%
      const section = screen.getByText("Continue Watching — Movies").closest("section");
      const fillBar = section!.querySelector(".bg-primary") as HTMLElement | null;
      expect(fillBar).toBeInTheDocument();
      expect(fillBar?.style.width).toBe("44.44444444444444%");
    });

    it("navigates to movie on click", () => {
      renderHomePage();

      const movieCard = screen.getByText("Inception").closest("button");
      expect(movieCard).toBeInTheDocument();
      fireEvent.click(movieCard!);
      expect(mockNavigate).toHaveBeenCalledWith("/watch/movie/101");
    });
  });

  // ── Multiple CW sections simultaneously ─────────────────
  describe("both series and movie CW sections", () => {
    beforeEach(() => {
      mockSeriesCW = singleSeriesCW;
      mockMovieCW = singleMovieCW;
    });

    it("renders both Continue Watching sections simultaneously", () => {
      renderHomePage();

      expect(screen.getByText("Continue Watching")).toBeInTheDocument();
      expect(screen.getByText("Continue Watching — Movies")).toBeInTheDocument();
      expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
      expect(screen.seriesByText?.("S1 · E3") ?? screen.getByText("S1 · E3")).toBeInTheDocument();
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });
  });

  // ── Server progress merge ───────────────────────────────
  describe("server progress merge", () => {
    it("updates series CW after server progress resolves", async () => {
      mockSeriesCW = []; // No local data initially
      // Server resolves with series data
      const serverSeries: SeriesProgress[] = [{
        seriesId: 3,
        seriesName: "Server Series",
        cover: "https://image.tmdb.org/server.jpg",
        seasonNumber: 1,
        episodeNum: 1,
        episodeId: "ep-s1",
        episodeTitle: "Server Episode",
        progressSeconds: 300,
        durationSeconds: 1800,
        updatedAt: Date.now(),
      }];
      mockLoadServerProgress.mockResolvedValue({ series: serverSeries, movies: [] });

      renderHomePage();

      // Should eventually show the server-provided series
      await waitFor(() => {
        expect(screen.getByText("Server Series")).toBeInTheDocument();
      });

      expect(screen.getByText("S1 · E1")).toBeInTheDocument();
      expect(mockLoadServerProgress).toHaveBeenCalledOnce();
    });

    it("updates movie CW after server progress resolves", async () => {
      mockMovieCW = [];
      const serverMovies: MovieProgress[] = [{
        movieId: 201,
        movieName: "Server Movie",
        poster: "https://image.tmdb.org/srv-movie.jpg",
        progressSeconds: 900,
        durationSeconds: 3600,
        updatedAt: Date.now(),
      }];
      mockLoadServerProgress.mockResolvedValue({ series: [], movies: serverMovies });

      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText("Server Movie")).toBeInTheDocument();
      });
    });
  });

  // ── Edge cases ──────────────────────────────────────────
  describe("edge cases", () => {
    it("handles single series CW item", () => {
      mockSeriesCW = singleSeriesCW;
      mockMovieCW = [];
      renderHomePage();

      // Only series section should render
      expect(screen.getByText("Continue Watching")).toBeInTheDocument();
      expect(screen.queryByText("Continue Watching — Movies")).not.toBeInTheDocument();
    });

    it("handles single movie CW item", () => {
      mockSeriesCW = [];
      mockMovieCW = singleMovieCW;
      renderHomePage();

      expect(screen.queryByText("Continue Watching")).not.toBeInTheDocument();
      expect(screen.getByText("Continue Watching — Movies")).toBeInTheDocument();
    });
  });
});
