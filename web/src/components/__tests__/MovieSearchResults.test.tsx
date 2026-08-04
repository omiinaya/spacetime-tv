/**
 * Tests for MovieSearchResults — the "Movies (n)" section of the search page.
 *
 * Covers: null render for empty movies, heading count, TMDB-enriched poster +
 * rating + genres vs stream-icon fallback, navigation signal, and load-more
 * button states.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import MovieSearchResults from "@/components/MovieSearchResults";
import type { Movie, TmdbEnrichData } from "@/lib/types";

const movies: Movie[] = [
  {
    stream_id: 11,
    name: "The Matrix",
    stream_icon: "movieicons/matrix.png",
    rating: "0",
  } as Movie,
  {
    stream_id: 12,
    name: "No Poster Film",
    stream_icon: "",
    rating: "0",
  } as Movie,
];

const enrich: Record<string, TmdbEnrichData> = {
  "11": {
    poster: "/abc123.jpg",
    rating: 16,
    genres: ["Action", "Sci-Fi", "Thriller"],
  } as TmdbEnrichData,
};

function renderResults(
  overrides: Partial<Parameters<typeof MovieSearchResults>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <MovieSearchResults
        movies={movies}
        enrichData={enrich}
        totalCount={10}
        loadingMore={false}
        onLoadMore={vi.fn()}
        showLoadMore={true}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("MovieSearchResults", () => {
  it("returns null when there are no movies", () => {
    const { container } = renderResults({ movies: [] });
    expect(container.firstChild).toBeNull();
  });

  it("shows the section heading with the movie count", () => {
    renderResults();
    expect(screen.getByText("Movies (2)")).toBeTruthy();
  });

  it("uses the TMDB poster URL when enrichment exists", () => {
    renderResults();
    const img = screen.getByAltText("The Matrix poster") as HTMLImageElement;
    expect(img.src).toContain("w342");
    expect(img.src).toContain("abc123");
    expect(img.srcset).toBeTruthy();
  });

  it("shows the TMDB-derived rating badge", () => {
    renderResults();
    expect(screen.getByText("8.0")).toBeTruthy();
  });

  it("renders genre chips from enrichment (max 2)", () => {
    renderResults();
    expect(screen.getByText("Action")).toBeTruthy();
    expect(screen.getByText("Sci-Fi")).toBeTruthy();
    expect(screen.queryByText("Thriller")).toBeNull();
  });

  it("hides the poster image on load error", () => {
    renderResults();
    const img = screen.getByAltText("The Matrix poster") as HTMLImageElement;
    fireEvent.error(img);
    expect(img.style.display).toBe("none");
  });

  it("emits the watch-link signal for navigation", () => {
    renderResults();
    const card = screen.getByText("The Matrix").closest("button")!;
    expect(card.hasAttribute("data-watch-link")).toBe(true);
  });

  it("shows load-more and calls onLoadMore", () => {
    const onLoadMore = vi.fn();
    renderResults({ onLoadMore });
    fireEvent.click(screen.getByText(/Load more movies/));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it("hides load-more when counts match", () => {
    renderResults({ totalCount: movies.length });
    expect(screen.queryByText(/Load more movies/)).toBeNull();
  });

  it("spins while loading more", () => {
    renderResults({ loadingMore: true });
    const btn = screen.getByText(/Load more movies/).closest("button")!;
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.querySelector("svg")).toBeTruthy();
  });
});
