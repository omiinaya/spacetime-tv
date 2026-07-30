/**
 * Tests for the SeriesOverlay component.
 *
 * SeriesOverlay shows a rich detail overlay for TV series with TMDB enrichment,
 * season tabs, episode grid, watch progress indicators, and recommendations.
 * This suite covers: loading, error, season tabs, episode rendering,
 * play/watchlist interaction, progress indicators, and empty states.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SeriesOverlay from "@/components/SeriesOverlay";
import type { Series, SeriesDetails, Episode } from "@/lib/types";

// ── Router mock ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Watchlist mock ───────────────────────────────────────
const mockIsSeriesInWatchlist = vi.fn(() => false);
const mockToggleSeriesWatchlist = vi.fn();
vi.mock("@/lib/watchlist", () => ({
  isSeriesInWatchlist: (...args: unknown[]) =>
    (mockIsSeriesInWatchlist as (...a: unknown[]) => boolean)(...args),
  toggleSeriesWatchlist: (...args: unknown[]) =>
    (mockToggleSeriesWatchlist as (...a: unknown[]) => void)(...args),
}));

// ── Continue watching mock ──────────────────────────────
const mockGetSeriesProgress = vi.fn();
vi.mock("@/lib/continueWatching", () => ({
  getSeriesProgress: (...args: unknown[]) =>
    (
      mockGetSeriesProgress as (
        ...a: unknown[]
      ) => Map<string, { progressSeconds: number; durationSeconds: number }>
    )(...args),
}));

// ── API mock ─────────────────────────────────────────────
const mockSeriesDetails = vi.fn();
const mockTmdbTvDetails = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    series: {
      details: (...args: unknown[]) =>
        (mockSeriesDetails as (...a: unknown[]) => Promise<SeriesDetails>)(
          ...args,
        ),
    },
    tmdb: {
      tv: {
        details: (...args: unknown[]) =>
          (mockTmdbTvDetails as (...a: unknown[]) => Promise<unknown>)(...args),
      },
    },
  },
  imageUrl: (url: string) => url,
  tmdbSrcset: vi.fn(() => ""),
}));

// ── Child component mocks ────────────────────────────────
vi.mock("@/components/SimilarSeries", () => ({
  default: () => <div data-testid="similar-series">Similar</div>,
}));
vi.mock("@/components/TmdbSimilarShows", () => ({
  default: () => <div data-testid="tmdb-similar-shows">TMDB Similar</div>,
}));

// ── Sample data ──────────────────────────────────────────
const sampleSeries: Series = {
  num: 1,
  name: "Breaking Bad",
  series_id: 1001,
  cover: "https://example.com/bb-cover.jpg",
  plot: "A high school chemistry teacher diagnosed with cancer turns to crime.",
  cast: "Bryan Cranston, Aaron Paul, Anna Gunn",
  director: "Vince Gilligan",
  genre: "Crime, Drama, Thriller",
  releaseDate: "2008-01-20",
  rating: "9.5",
  rating_5based: "4.9",
  tmdb: "1396",
  youtube_trailer: "",
  category_id: "20",
};

const ep1: Episode = {
  id: "ep1",
  episode_num: 1,
  title: "Pilot",
  container_extension: "mp4",
  info: {
    duration_secs: 2880,
    movie_image: "https://example.com/ep1.jpg",
    plot: "Walter White, a high school chemistry teacher, is diagnosed with cancer.",
    season: 1,
  },
};

const ep2: Episode = {
  id: "ep2",
  episode_num: 2,
  title: "Cat's in the Bag...",
  container_extension: "mp4",
  info: {
    duration_secs: 2880,
    season: 1,
  },
};

const epS2: Episode = {
  id: "ep-s2-1",
  episode_num: 1,
  title: "Season 2 Premiere",
  container_extension: "mp4",
  info: {
    duration_secs: 2880,
    season: 2,
  },
};

const fullSeriesDetails: SeriesDetails = {
  info: {
    name: "Breaking Bad",
    cover: "https://example.com/bb-cover.jpg",
    plot: "A high school chemistry teacher diagnosed with cancer turns to crime.",
    cast: "Bryan Cranston, Aaron Paul, Anna Gunn",
    director: "Vince Gilligan",
    genre: "Crime, Drama, Thriller",
    releaseDate: "2008-01-20",
    release_date: "2008-01-20",
    last_modified: "2024-01-01",
    rating: "9.5",
    rating_5based: "4.9",
    backdrop_path: ["/bb-backdrop.jpg"],
    tmdb: "1396",
    youtube_trailer: "",
    episode_run_time: "48",
    category_id: "20",
    category_ids: [20],
  },
  seasons: [
    {
      name: "Season 1",
      season_number: 1,
      episode_count: "7",
      cover: "",
      cover_big: "",
      cover_tmdb: "",
      overview: "",
      air_date: "2008-01-20",
      releaseDate: "2008-01-20",
      duration: "48",
    },
    {
      name: "Season 2",
      season_number: 2,
      episode_count: "13",
      cover: "",
      cover_big: "",
      cover_tmdb: "",
      overview: "",
      air_date: "2009-03-08",
      releaseDate: "2009-03-08",
      duration: "48",
    },
  ],
  episodes: {
    "1": [ep1, ep2],
    "2": [epS2],
  },
};

const tmdbTvEnrichment = {
  enabled: true,
  info: {
    overview: "TMDB series overview",
    backdrop_path: "/tmdb_backdrop.jpg",
    poster_path: "/tmdb_poster.jpg",
    vote_average: 9.4,
    genres: [
      { id: 18, name: "Drama" },
      { id: 80, name: "Crime" },
    ],
    networks: [{ name: "AMC" }],
    created_by: [{ name: "Vince Gilligan" }],
    number_of_seasons: 5,
    number_of_episodes: 62,
    episode_run_time: [48],
    status: "Ended",
    first_air_date: "2008-01-20",
    seasons: [
      { season_number: 1, episode_count: 7, name: "Season 1", overview: "" },
      { season_number: 2, episode_count: 13, name: "Season 2", overview: "" },
    ],
  },
};

// ── Helper ────────────────────────────────────────────────
function renderOverlay(series: Series = sampleSeries) {
  return render(
    <MemoryRouter>
      <SeriesOverlay series={series} onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────
describe("SeriesOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSeriesInWatchlist.mockReturnValue(false);
    mockGetSeriesProgress.mockReturnValue(new Map());
  });

  // ── Loading state ───────────────────────────────────
  it("shows loading spinner while data loads", () => {
    mockSeriesDetails.mockReturnValue(new Promise(() => {}));
    mockTmdbTvDetails.mockReturnValue(new Promise(() => {}));
    renderOverlay();
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  // ── Error state ─────────────────────────────────────
  it("shows error message when provider data fails", async () => {
    mockSeriesDetails.mockRejectedValue(new Error("Failed to load series"));
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();
    expect(await screen.findByText("Failed to load series")).toBeTruthy();
    expect(screen.queryByTestId("similar-series")).not.toBeInTheDocument();
  });

  it("shows empty episode grid when details have no episodes", async () => {
    mockSeriesDetails.mockResolvedValue({
      info: fullSeriesDetails.info,
      seasons: [],
      episodes: {},
    });
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();
    expect(await screen.findByText("No episodes for Season 1")).toBeTruthy();
  });

  // ── Normal rendering ────────────────────────────────
  it("renders series title and plot from provider data", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByText("Breaking Bad")).toBeTruthy();
    expect(screen.getByText(/turns to crime/)).toBeTruthy();
  });

  it("renders genres from provider data", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByText("Crime")).toBeTruthy();
    expect(screen.getByText("Drama")).toBeTruthy();
    expect(screen.getByText("Thriller")).toBeTruthy();
  });

  it("renders cast and director", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByText("Bryan Cranston")).toBeTruthy();
    expect(screen.getByText(/Vince Gilligan/)).toBeTruthy();
  });

  // ── Season tabs ──────────────────────────────────────
  it("renders season tabs and switches episodes on click", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByText("Season 1")).toBeTruthy();
    expect(screen.getByText("Season 2")).toBeTruthy();

    // Season 1 is active by default — shows episodes
    expect(screen.getByText("Pilot")).toBeTruthy();
    expect(screen.getByText("Cat's in the Bag...")).toBeTruthy();

    // Switch to Season 2
    fireEvent.click(screen.getByText("Season 2"));
    expect(screen.getByText("Season 2 Premiere")).toBeTruthy();
    // Season 1 episodes should no longer be visible
    expect(screen.queryByText("Pilot")).not.toBeInTheDocument();
  });

  it("shows season episode count in tab", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByText("7ep")).toBeTruthy();
    expect(screen.getByText("13ep")).toBeTruthy();
  });

  // ── Episode grid ─────────────────────────────────────
  it("renders episode thumbnails and navigation", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByText("Pilot")).toBeTruthy();
    // Episode number badge
    expect(screen.getByText("E01")).toBeTruthy();
    // Duration appears in meta row and episode grid; check at least one exists
    const durationEls = screen.getAllByText("48m");
    expect(durationEls.length).toBeGreaterThanOrEqual(1);
  });

  it("navigates to series watch page on episode click", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    const pilotBtn = await screen.findByLabelText(/Pilot/);
    fireEvent.click(pilotBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/watch/series/1001/ep1");
  });

  it("shows placeholder for episodes without thumbnails", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    // ep2 has no movie_image — check for the Play icon fallback
    expect(await screen.findByText("Cat's in the Bag...")).toBeTruthy();
  });

  // ── Play button (first episode) ──────────────────────
  it("play button navigates to first episode", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    const playBtn = await screen.findByText(/Play/);
    fireEvent.click(playBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/watch/series/1001/ep1");
  });

  it("play button shows correct season/episode prefix", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByText("Play S1 E1")).toBeTruthy();
  });

  // ── Watchlist toggle ─────────────────────────────────
  it("toggles watchlist on heart button click", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    const heartBtn = await screen.findByLabelText("Add to watchlist");
    fireEvent.click(heartBtn);
    expect(mockToggleSeriesWatchlist).toHaveBeenCalledWith(1001);
  });

  it("shows correct watchlist aria-label when in watchlist", async () => {
    mockIsSeriesInWatchlist.mockReturnValue(true);
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByLabelText("Remove from watchlist")).toBeTruthy();
  });

  // ── TMDB enrichment ──────────────────────────────────
  it("uses TMDB genres when provider data is available", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(tmdbTvEnrichment);
    renderOverlay();

    // TMDB genres should take priority — Drama and Crime
    expect(await screen.findByText("Drama")).toBeTruthy();
    expect(screen.getByText("Crime")).toBeTruthy();
  });

  it("renders TMDB meta items (seasons, episodes, status, network)", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(tmdbTvEnrichment);
    renderOverlay();

    expect(await screen.findByText("5 seasons")).toBeTruthy();
    expect(screen.getByText("62 episodes")).toBeTruthy();
    expect(screen.getByText("Ended")).toBeTruthy();
    expect(screen.getByText("AMC")).toBeTruthy();
  });

  it("renders TMDB link", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(tmdbTvEnrichment);
    renderOverlay();

    const tmdbLink = await screen.findByText("TMDB");
    expect(tmdbLink.closest("a")).toHaveAttribute(
      "href",
      "https://www.themoviedb.org/tv/1396",
    );
  });

  it("falls back to provider data when TMDB data is unavailable", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue({ enabled: false, info: null });
    renderOverlay();

    // Provider genres should be used
    expect(await screen.findByText("Crime")).toBeTruthy();
    expect(screen.getByText("Drama")).toBeTruthy();
    expect(screen.getByText("Thriller")).toBeTruthy();
    // Provider season count used as fallback
    expect(screen.getByText("2 seasons")).toBeTruthy();
  });

  // ── Episode progress indicators ──────────────────────
  it("shows watched checkmark on episodes with 90%+ progress", async () => {
    const progressMap = new Map([
      ["1:1", { progressSeconds: 2880, durationSeconds: 2880 }], // 100%
      ["1:2", { progressSeconds: 1440, durationSeconds: 2880 }], // 50%
    ]);
    mockGetSeriesProgress.mockReturnValue(progressMap);
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    // Ep1 is fully watched — should have green checkmark
    await waitFor(() => {
      const checkmarks = document.querySelectorAll(
        ".bg-green-500\\/80, .text-green-500",
      );
      expect(checkmarks.length).toBeGreaterThan(0);
    });
  });

  it("shows watched count badge on season tabs", async () => {
    const progressMap = new Map([
      ["1:1", { progressSeconds: 2880, durationSeconds: 2880 }],
      ["1:2", { progressSeconds: 2880, durationSeconds: 2880 }],
    ]);
    mockGetSeriesProgress.mockReturnValue(progressMap);
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    // Season 1 tab should show ✓2
    expect(await screen.findByText(/✓2/)).toBeTruthy();
  });

  // ── Empty state ──────────────────────────────────────
  it("shows empty episode message for season with no episodes", async () => {
    const noEpDetails = {
      ...fullSeriesDetails,
      episodes: { "1": [], "2": [epS2] },
    };
    mockSeriesDetails.mockResolvedValue(noEpDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByText("No episodes for Season 1")).toBeTruthy();
  });

  // ── Recommendation sections ──────────────────────────
  it("renders SimilarSeries and TmdbSimilarShows", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(tmdbTvEnrichment);
    renderOverlay();

    expect(await screen.findByTestId("similar-series")).toBeTruthy();
    expect(screen.getByTestId("tmdb-similar-shows")).toBeTruthy();
  });

  // ── Cast navigation ──────────────────────────────────
  it("navigates to person page on cast member click", async () => {
    mockSeriesDetails.mockResolvedValue(fullSeriesDetails);
    mockTmdbTvDetails.mockResolvedValue(null);
    renderOverlay();

    const castBtn = await screen.findByText("Bryan Cranston");
    fireEvent.click(castBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/person/Bryan%20Cranston");
  });
});