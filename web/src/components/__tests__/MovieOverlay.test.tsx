/**
 * Tests for the MovieOverlay component.
 *
 * MovieOverlay shows a rich detail overlay for movies with TMDB enrichment,
 * language selector, watchlist, trailer, and recommendations.
 * This suite covers: loading, error, base info, TMDB enrichment,
 * language switching, play/watchlist/trailer interactions, and fallbacks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import MovieOverlay from "@/components/MovieOverlay";
import type { UnifiedMovie, MovieInfo } from "@/lib/types";

// ── Router mock ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Watchlist mock ───────────────────────────────────────
const mockIsInWatchlist = vi.fn(() => false);
const mockToggleWatchlist = vi.fn();
vi.mock("@/lib/watchlist", () => ({
  isInWatchlist: (...args: unknown[]) =>
    (mockIsInWatchlist as (...a: unknown[]) => boolean)(...args),
  toggleWatchlist: (...args: unknown[]) =>
    (mockToggleWatchlist as (...a: unknown[]) => void)(...args),
}));

// ── API mock ─────────────────────────────────────────────
const mockMovieDetails = vi.fn();
const mockTmdbDetails = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    movies: {
      details: (...args: unknown[]) =>
        (mockMovieDetails as (...a: unknown[]) => Promise<{ info: MovieInfo }>)(
          ...args,
        ),
    },
    tmdb: {
      details: (...args: unknown[]) =>
        (mockTmdbDetails as (...a: unknown[]) => Promise<unknown>)(...args),
    },
  },
  imageUrl: (url: string) => url,
  tmdbSrcset: vi.fn(() => ""),
}));

// ── Child component mocks ────────────────────────────────
vi.mock("@/components/SimilarMovies", () => ({
  default: () => <div data-testid="similar-movies">Similar</div>,
}));
vi.mock("@/components/TmdbSimilarMovies", () => ({
  default: () => <div data-testid="tmdb-similar">TMDB Similar</div>,
}));

// ── Sample data ───────────────────────────────────────���──
const sampleMovie: UnifiedMovie = {
  num: 1,
  name: "Inception",
  stream_id: 101,
  stream_icon: "https://example.com/inception.jpg",
  rating: "8.8",
  rating_5based: 4.4,
  tmdb: "27205",
  category_id: "10",
  container_extension: "mp4",
  base_name: "Inception",
  languages: [
    { code: "EN", name: "English", stream_id: 101, container_extension: "mp4" },
    { code: "FR", name: "French", stream_id: 102, container_extension: "mp4" },
  ],
  language_count: 2,
};

const fullMovieInfo: MovieInfo = {
  name: "Inception",
  plot: "A thief who steals corporate secrets through dream-sharing technology.",
  cast: "Leonardo DiCaprio, Joseph Gordon-Levitt, Ellen Page",
  director: "Christopher Nolan",
  genre: "Action, Sci-Fi, Thriller",
  rating: "8.8",
  releasedate: "2010-07-16",
  backdrop_path: ["/backdrop.jpg"],
  cover_big: "https://example.com/cover.jpg",
  movie_image: "https://example.com/poster.jpg",
  youtube_trailer: "d3A3",
  duration: "2h 28m",
  tmdb_id: "27205",
};

const minimalMovieInfo: MovieInfo = {
  name: "Inception",
  rating: "8.8",
  releasedate: "2010-07-16",
};

const tmdbEnrichment = {
  enabled: true,
  info: {
    overview: "TMDB overview text",
    backdrop_path: "/tmdb_backdrop.jpg",
    poster_path: "/tmdb_poster.jpg",
    vote_average: 8.5,
    genres: [
      { id: 28, name: "Action" },
      { id: 878, name: "Science Fiction" },
    ],
    runtime: 148,
    status: "Released",
    release_date: "2010-07-16",
  },
};

// ── Helper ────────────────────────────────────────────────
function renderOverlay(movie: UnifiedMovie = sampleMovie) {
  return render(
    <MemoryRouter>
      <MovieOverlay movie={movie} onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────
describe("MovieOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsInWatchlist.mockReturnValue(false);
  });

  // ── Loading state ───────────────────────────────────
  it("shows loading spinner while data is loading", () => {
    mockMovieDetails.mockReturnValue(new Promise(() => {})); // never resolves
    mockTmdbDetails.mockReturnValue(new Promise(() => {}));
    renderOverlay();
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  // ── Error state ─────────────────────────────────────
  it("shows error message when provider data fails", async () => {
    mockMovieDetails.mockRejectedValue(new Error("Failed to load"));
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();
    expect(await screen.findByText("Failed to load")).toBeTruthy();
    expect(screen.queryByTestId("similar-movies")).not.toBeInTheDocument();
  });

  it("shows 'No details available' when provider returns no info", async () => {
    mockMovieDetails.mockResolvedValue({ info: null as unknown as MovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();
    expect(await screen.findByText("No details available")).toBeTruthy();
  });

  // ── Normal rendering (provider data) ─────────────────
  it("renders movie title, plot, genres from provider data", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();

    // All assertions inside one waitFor: title, plot and genres render from
    // separate async state updates; asserting each with a bare getByText
    // after findByText(title) races the later updates under CPU contention.
    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeTruthy();
      expect(screen.getByText(/corporate secrets/)).toBeTruthy();
      expect(screen.getByText("Action")).toBeTruthy();
      expect(screen.getByText("Sci-Fi")).toBeTruthy();
      expect(screen.getByText("Thriller")).toBeTruthy();
    });
  });

  it("renders rating, year, and duration from provider data", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();

    await waitFor(() => {
      expect(screen.getByText("8.8")).toBeTruthy();
      expect(screen.getByText("2010")).toBeTruthy();
      // Duration appears in both meta row and body section
      expect(screen.getAllByText("2h 28m").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders cast and director", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByText("Leonardo DiCaprio")).toBeTruthy();
    expect(screen.getByText(/Christopher Nolan/)).toBeTruthy();
  });

  // ── TMDB enrichment ──────────────────────────────────
  it("uses TMDB genres, plot, and rating when provider data is minimal", async () => {
    mockMovieDetails.mockResolvedValue({ info: minimalMovieInfo });
    mockTmdbDetails.mockResolvedValue(tmdbEnrichment);
    renderOverlay();

    expect(await screen.findByText("TMDB overview text")).toBeTruthy();
    expect(screen.getByText("Action")).toBeTruthy();
    expect(screen.getByText("Science Fiction")).toBeTruthy();
  });

  it("renders TMDB link when tmdb_id is available from provider", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();

    const tmdbLink = await screen.findByText("TMDB");
    expect(tmdbLink.closest("a")).toHaveAttribute(
      "href",
      "https://www.themoviedb.org/movie/27205",
    );
  });

  it("falls back to provider data when TMDB data is unavailable", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue({ enabled: false, info: null });
    renderOverlay();

    // Provider genre should be used
    expect(await screen.findByText("Action")).toBeTruthy();
    // Provider cast still shown
    expect(screen.getByText("Leonardo DiCaprio")).toBeTruthy();
  });

  // ── Language selector ────────────────────────────────
  it("shows language dropdown and allows switching", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();

    // Default shows English
    expect(await screen.findByText("English")).toBeTruthy();

    // Open dropdown
    fireEvent.click(screen.getByText("English"));
    expect(screen.getByText("French")).toBeTruthy();

    // Switch to French
    fireEvent.click(screen.getByText("French"));
    expect(screen.getByText("French")).toBeTruthy();
  });

  // ── Play button ──────────────────────────────────────
  it("navigates to watch page on play click", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();

    const playBtn = await screen.findByText("Play");
    fireEvent.click(playBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/watch/movie/101");
  });

  // ── Watchlist toggle ─────────────────────────────────
  it("toggles watchlist on heart button click", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();

    const heartBtn = await screen.findByLabelText("Add to watchlist");
    fireEvent.click(heartBtn);
    expect(mockToggleWatchlist).toHaveBeenCalledWith(101);
  });

  it("shows correct watchlist aria-label when already in watchlist", async () => {
    mockIsInWatchlist.mockReturnValue(true);
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();

    expect(await screen.findByLabelText("Remove from watchlist")).toBeTruthy();
  });

  // ── Trailer ──────────────────────────────────────────
  it("shows trailer button and toggles trailer embed", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();

    const trailerBtn = await screen.findByText("Trailer");
    fireEvent.click(trailerBtn);
    // After click the button text should be "Hide"
    expect(screen.getByText("Hide")).toBeTruthy();
  });

  // ── Cast navigation ──────────────────────────────────
  it("navigates to person page on cast member click", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(null);
    renderOverlay();

    const castBtn = await screen.findByText("Leonardo DiCaprio");
    fireEvent.click(castBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/person/Leonardo%20DiCaprio");
  });

  // ── Recommendation sections ──────────────────────────
  it("renders SimilarMovies and TmdbSimilarMovies", async () => {
    mockMovieDetails.mockResolvedValue({ info: fullMovieInfo });
    mockTmdbDetails.mockResolvedValue(tmdbEnrichment);
    renderOverlay();

    expect(await screen.findByTestId("similar-movies")).toBeTruthy();
    expect(screen.getByTestId("tmdb-similar")).toBeTruthy();
  });
});
