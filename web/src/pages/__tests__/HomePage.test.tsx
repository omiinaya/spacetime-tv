/**
 * Tests for the HomePage component.
 *
 * HomePage renders quick links to Live TV / Movies / Series / Watchlist,
 * trending TMDB rows, and an empty state when nothing is available.
 * Continue-watching history was moved to the History page (sidebar).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import HomePage from "@/pages/HomePage";

// ── Mock TMDB API (resolve immediately with configurable data) ──
const mockMovieTrending = vi.fn();
const mockTvTrending = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    tmdb: {
      trending: (...args: unknown[]) =>
        (
          mockMovieTrending as unknown as (
            ...a: unknown[]
          ) => Promise<{ trending: unknown[] }>
        )(...args),
      tv: {
        trending: (...args: unknown[]) =>
          (
            mockTvTrending as unknown as (
              ...a: unknown[]
            ) => Promise<{ trending: unknown[] }>
          )(...args),
      },
    },
  },
  tmdbImgProps: vi.fn(() => ({ src: "https://image.tmdb.org/poster.jpg" })),
}));

// ── Mock navigate ─────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Sample data ───────────────────────────────────────────
const sampleTrendingMovies = [
  {
    id: 1,
    title: "Test Movie",
    poster_path: "/poster.jpg",
    vote_average: 7.5,
    release_date: "2026-01-01",
  },
];

const sampleTrendingSeries = [
  {
    id: 10,
    name: "Test Series",
    poster_path: "/series-poster.jpg",
    vote_average: 8.0,
    first_air_date: "2025-06-01",
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
  mockMovieTrending.mockResolvedValue({ trending: [] });
  mockTvTrending.mockResolvedValue({ trending: [] });
}

// ── Tests ─────────────────────────────────────────────────
describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ── Empty state ─────────────────────────────────────────
  describe("empty state (no trending data)", () => {
    it("shows welcome message and quick links", () => {
      renderHomePage();
      expect(screen.getByText("Welcome")).toBeInTheDocument();
      expect(screen.getByText("Live TV")).toBeInTheDocument();
      expect(screen.getByText("Movies")).toBeInTheDocument();
      expect(screen.getByText("Series")).toBeInTheDocument();
      expect(screen.getByText("Watchlist")).toBeInTheDocument();
    });

    it("shows empty state after trending resolves with no data", async () => {
      renderHomePage();
      await waitFor(() => {
        expect(screen.getByText("Welcome to Spacetime-TV")).toBeInTheDocument();
      });
      expect(
        screen.getByText("Start watching from Live TV, Movies, or Series"),
      ).toBeInTheDocument();
      expect(screen.getByText("Browse Live TV")).toBeInTheDocument();
      expect(screen.getByText("Browse Movies")).toBeInTheDocument();
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

    it("does NOT render Continue Watching sections (moved to History)", () => {
      renderHomePage();
      expect(screen.queryByText("Continue Watching")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Continue Watching — Movies"),
      ).not.toBeInTheDocument();
    });
  });

  // ── Quick links ─────────────────────────────────────────
  describe("quick links", () => {
    it("navigates to /live when Live TV quick link is clicked", () => {
      renderHomePage();
      fireEvent.click(screen.getByText("Live TV"));
      expect(mockNavigate).toHaveBeenCalledWith("/live");
    });

    it("navigates to /movies when Movies quick link is clicked", () => {
      renderHomePage();
      fireEvent.click(screen.getByText("Movies"));
      expect(mockNavigate).toHaveBeenCalledWith("/movies");
    });

    it("navigates to /series when Series quick link is clicked", () => {
      renderHomePage();
      fireEvent.click(screen.getByText("Series"));
      expect(mockNavigate).toHaveBeenCalledWith("/series");
    });

    it("navigates to /watchlist when Watchlist quick link is clicked", () => {
      renderHomePage();
      fireEvent.click(screen.getByText("Watchlist"));
      expect(mockNavigate).toHaveBeenCalledWith("/watchlist");
    });
  });

  // ── Trending ────────────────────────────────────────────
  describe("trending sections", () => {
    it("renders trending movies row when data returns", async () => {
      mockMovieTrending.mockResolvedValue({ trending: sampleTrendingMovies });
      mockTvTrending.mockResolvedValue({ trending: [] });
      renderHomePage();

      await waitFor(() => {
        expect(
          screen.getByText("Trending Movies This Week"),
        ).toBeInTheDocument();
      });
      expect(screen.getByText("Test Movie")).toBeInTheDocument();
      expect(screen.getByText("2026")).toBeInTheDocument();
    });

    it("renders trending series row when data returns", async () => {
      mockMovieTrending.mockResolvedValue({ trending: [] });
      mockTvTrending.mockResolvedValue({ trending: sampleTrendingSeries });
      renderHomePage();

      await waitFor(() => {
        expect(
          screen.getByText("Trending Series This Week"),
        ).toBeInTheDocument();
      });
      expect(screen.getByText("Test Series")).toBeInTheDocument();
      expect(screen.getByText("2025")).toBeInTheDocument();
    });

    it("navigates to /movies from 'View all' in trending movies", async () => {
      mockMovieTrending.mockResolvedValue({ trending: sampleTrendingMovies });
      mockTvTrending.mockResolvedValue({ trending: [] });
      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText("View all →")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("View all →"));
      expect(mockNavigate).toHaveBeenCalledWith("/movies");
    });
  });
});
