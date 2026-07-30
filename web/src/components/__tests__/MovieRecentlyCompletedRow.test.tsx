/**
 * Tests for MovieRecentlyCompletedRow component.
 *
 * Displays completed movies (>= 90% progress) with green checkmark.
 * Hidden when no completed movies or data is empty.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MovieRecentlyCompletedRow } from "@/components/MovieRecentlyCompletedRow";
import type { UnifiedMovie } from "@/lib/types";
import type { MovieProgress } from "@/lib/continueWatching";

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
    stream_type: "movie",
  } as UnifiedMovie,
  {
    stream_id: 102,
    name: "The Matrix (1999)",
    base_name: "The Matrix",
    stream_icon: "https://example.com/matrix.jpg",
    stream_type: "movie",
  } as UnifiedMovie,
];

const completedCW: MovieProgress[] = [
  {
    movieId: 101,
    movieName: "Inception",
    poster: "https://example.com/inception.jpg",
    progressSeconds: 3500,
    durationSeconds: 3600, // 97% done
    updatedAt: Date.now(),
  },
];

describe("MovieRecentlyCompletedRow", () => {
  const onSelectMovie = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Recently Completed heading when movies are >= 90% done", async () => {
    render(
      <MovieRecentlyCompletedRow
        movies={sampleMovies}
        continueWatching={completedCW}
        onSelectMovie={onSelectMovie}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Recently Completed")).toBeInTheDocument();
    });
  });

  it("renders movie title for completed item", async () => {
    render(
      <MovieRecentlyCompletedRow
        movies={sampleMovies}
        continueWatching={completedCW}
        onSelectMovie={onSelectMovie}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });
  });

  it("shows green check indicator for completed movies", async () => {
    render(
      <MovieRecentlyCompletedRow
        movies={sampleMovies}
        continueWatching={completedCW}
        onSelectMovie={onSelectMovie}
      />,
    );

    await waitFor(() => {
      const checkmarks = document.querySelectorAll(".text-green-400");
      expect(checkmarks.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("returns null when no completed movies exist", () => {
    const { container } = render(
      <MovieRecentlyCompletedRow
        movies={sampleMovies}
        continueWatching={[]}
        onSelectMovie={onSelectMovie}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when movies are still in progress (< 90%)", () => {
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
    const { container } = render(
      <MovieRecentlyCompletedRow
        movies={sampleMovies}
        continueWatching={inProgressCW}
        onSelectMovie={onSelectMovie}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dismiss button for completed items", async () => {
    render(
      <MovieRecentlyCompletedRow
        movies={sampleMovies}
        continueWatching={completedCW}
        onSelectMovie={onSelectMovie}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByLabelText("Remove from recently completed"),
      ).toBeInTheDocument();
    });
  });

  it("calls onSelectMovie when movie is clicked", async () => {
    render(
      <MovieRecentlyCompletedRow
        movies={sampleMovies}
        continueWatching={completedCW}
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
