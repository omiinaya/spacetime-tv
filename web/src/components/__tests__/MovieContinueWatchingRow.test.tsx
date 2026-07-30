/**
 * Tests for MovieContinueWatchingRow component.
 *
 * Displays in-progress movies with progress bars and dismiss buttons.
 * Hidden when no movies match or progress is >= 90%.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MovieContinueWatchingRow } from "@/components/MovieContinueWatchingRow";
import type { UnifiedMovie, TmdbMovieResult } from "@/lib/types";
import type { MovieProgress } from "@/lib/continueWatching";

// Mock the API modules
vi.mock("@/lib/api", () => ({
  imageUrl: (url: string) => url,
}));

vi.mock("@/lib/continueWatching", () => ({
  removeMovieProgress: vi.fn(),
}));

const sampleMovies: UnifiedMovie[] = [
  {
    stream_id: 101,
    name: "Inception (2010)",
    base_name: "Inception",
    stream_icon: "https://example.com/inception.jpg",
    rating: "8.5",
    tmdb: "123",
    language_count: 2,
    added: "1700000000",
    stream_type: "movie",
  } as UnifiedMovie,
  {
    stream_id: 102,
    name: "The Matrix (1999)",
    base_name: "The Matrix",
    stream_icon: "https://example.com/matrix.jpg",
    rating: "8.7",
    language_count: 1,
    added: "1700000000",
    stream_type: "movie",
  } as UnifiedMovie,
];

const inProgressCW: MovieProgress[] = [
  {
    movieId: 101,
    movieName: "Inception",
    poster: "https://example.com/inception.jpg",
    progressSeconds: 300,
    durationSeconds: 3600,
    updatedAt: Date.now(),
  },
];

describe("MovieContinueWatchingRow", () => {
  const onSelectMovie = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Continue Watching heading when there are in-progress movies", async () => {
    render(
      <MovieContinueWatchingRow
        movies={sampleMovies}
        continueWatching={inProgressCW}
        onSelectMovie={onSelectMovie}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Continue Watching")).toBeInTheDocument();
    });
  });

  it("renders movie poster and title", async () => {
    render(
      <MovieContinueWatchingRow
        movies={sampleMovies}
        continueWatching={inProgressCW}
        onSelectMovie={onSelectMovie}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });
  });

  it("shows progress bar with correct width percentage", async () => {
    render(
      <MovieContinueWatchingRow
        movies={sampleMovies}
        continueWatching={inProgressCW}
        onSelectMovie={onSelectMovie}
      />,
    );

    await waitFor(() => {
      const progressBars = document.querySelectorAll('[style*="width:"]');
      expect(progressBars.length).toBeGreaterThanOrEqual(1);
      // 300/3600 * 100 = 8.33%
      expect(progressBars[0]?.getAttribute("style")).toContain("8.33");
    });
  });

  it("renders dismiss button", async () => {
    render(
      <MovieContinueWatchingRow
        movies={sampleMovies}
        continueWatching={inProgressCW}
        onSelectMovie={onSelectMovie}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByLabelText("Remove from continue watching"),
      ).toBeInTheDocument();
    });
  });

  it("returns null when no matching movies in progress", () => {
    const { container } = render(
      <MovieContinueWatchingRow
        movies={sampleMovies}
        continueWatching={[]}
        onSelectMovie={onSelectMovie}
      />,
    );
    // Component returns null — container should be empty
    expect(container.firstChild).toBeNull();
  });

  it("returns null when movies are >= 90% done (completed)", () => {
    const almostDoneCW: MovieProgress[] = [
      {
        movieId: 101,
        movieName: "Inception",
        poster: "https://example.com/inception.jpg",
        progressSeconds: 3500,
        durationSeconds: 3600,
        updatedAt: Date.now(),
      },
    ];
    const { container } = render(
      <MovieContinueWatchingRow
        movies={sampleMovies}
        continueWatching={almostDoneCW}
        onSelectMovie={onSelectMovie}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onSelectMovie when movie is clicked", async () => {
    render(
      <MovieContinueWatchingRow
        movies={sampleMovies}
        continueWatching={inProgressCW}
        onSelectMovie={onSelectMovie}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });

    screen.getByText("Inception").click();
    expect(onSelectMovie).toHaveBeenCalledWith(
      expect.objectContaining({ stream_id: 101 }),
    );
  });
});
