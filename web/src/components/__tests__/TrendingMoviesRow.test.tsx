/**
 * Tests for TrendingMoviesRow component.
 *
 * Renders a ContentRow with TMDB trending movie cards, matched
 * against the local movie catalog via tmdb id or name similarity.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TrendingMoviesRow from "../TrendingMoviesRow";
import type { TmdbMovieResult, UnifiedMovie } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  tmdbImgProps: (path: string) => ({
    src: `https://image.tmdb.org/t/p/w342${path}`,
    srcSet: "",
    sizes: "",
    loading: "lazy" as const,
  }),
}));

const makeTmdbMovie = (
  overrides: Partial<TmdbMovieResult> = {},
): TmdbMovieResult =>
  ({
    id: 1,
    title: "Test Trending Movie",
    poster_path: "/testPoster.jpg",
    release_date: "2024-06-15",
    vote_average: 7.5,
    adult: false,
    backdrop_path: null,
    genre_ids: [],
    original_language: "en",
    original_title: "Test Trending Movie",
    overview: "An overview",
    popularity: 100,
    video: false,
    vote_count: 500,
    ...overrides,
  }) as TmdbMovieResult;

const makeUnifiedMovie = (
  overrides: Partial<UnifiedMovie> = {},
): UnifiedMovie =>
  ({
    stream_id: 100,
    name: "Test Trending Movie",
    base_name: "Test Trending Movie",
    stream_icon: "https://example.com/poster.jpg",
    rating: "7.5",
    tmdb: "1",
    added: "1700000000",
    stream_type: "movie",
    ...overrides,
  }) as UnifiedMovie;

describe("TrendingMoviesRow", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty state ───────────────────────────────────────────────

  it("returns null when trending array is empty", () => {
    const { container } = render(
      <TrendingMoviesRow trending={[]} movies={[]} onSelect={onSelect} />,
    );
    expect(container.firstChild).toBeNull();
  });

  // ── ContentRow title ──────────────────────────────────────────

  it('renders ContentRow with title "Trending This Week"', () => {
    const trending = [makeTmdbMovie()];
    render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    expect(screen.getByText("Trending This Week")).toBeInTheDocument();
  });

  it("renders item count in the ContentRow", () => {
    const trending = [makeTmdbMovie({ id: 1 }), makeTmdbMovie({ id: 2 })];
    render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    // ContentRenders item count via toLocaleString()
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  // ── Rating badge ──────────────────────────────────────────────

  it("shows rating badge when vote_average > 0", () => {
    const trending = [makeTmdbMovie({ vote_average: 8.2 })];
    render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    expect(screen.getByText("8.2")).toBeInTheDocument();
  });

  it("does not show rating badge when vote_average is 0", () => {
    const trending = [makeTmdbMovie({ vote_average: 0 })];
    render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });

  it("does not show rating badge when vote_average is negative", () => {
    const trending = [makeTmdbMovie({ vote_average: -1 })];
    const { container } = render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    // No star badge should be rendered
    expect(container.querySelectorAll("svg.lucide-star").length).toBe(0);
  });

  // ── Year badge ────────────────────────────────────────────────

  it("shows year badge when release_date is present", () => {
    const trending = [makeTmdbMovie({ release_date: "2023-12-01" })];
    render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    // Year appears in both the badge and subtitle text
    const yearElements = screen.getAllByText("2023");
    expect(yearElements.length).toBeGreaterThanOrEqual(2);
  });

  it("does not show year badge when release_date is empty", () => {
    const trending = [makeTmdbMovie({ release_date: "" })];
    const { container } = render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    // The year badge renders inside a div with bg-black/70
    const yearBadges = container.querySelectorAll(".bg-black\\/70");
    // Only one badge (no year badge), but the rating badge also uses bg-black/70
    // So just verify the text is not in the document
    expect(screen.queryByText(/^\\d{4}$/)).not.toBeInTheDocument();
  });

  // ── Poster / fallback ─────────────────────────────────────────

  it("renders poster image when poster_path is present", () => {
    const trending = [makeTmdbMovie({ poster_path: "/poster.jpg" })];
    render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    const img = screen.getByAltText("Test Trending Movie poster");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute(
      "src",
      "https://image.tmdb.org/t/p/w342/poster.jpg",
    );
  });

  it("shows fallback Film icon when poster_path is null", () => {
    const trending = [makeTmdbMovie({ poster_path: null })];
    const { container } = render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    const svgs = container.querySelectorAll("svg.lucide-film");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows fallback Film icon when poster_path is empty string", () => {
    const trending = [makeTmdbMovie({ poster_path: "" as string | null })];
    const { container } = render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    // Empty string is falsy in the component check
    const svgs = container.querySelectorAll("svg.lucide-film");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  // ── Movie title display ───────────────────────────────────────

  it("renders the TMDB title text", () => {
    const trending = [makeTmdbMovie({ title: "Inception" })];
    render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    expect(screen.getByText("Inception")).toBeInTheDocument();
  });

  // ── Movie matching via TMDB id ────────────────────────────────

  it("matches movie via exact tmdb id and calls onSelect on click", () => {
    const trending = [makeTmdbMovie({ id: 42, title: "Matched Movie" })];
    const movies = [makeUnifiedMovie({ stream_id: 1, tmdb: "42" })];
    render(
      <TrendingMoviesRow
        trending={trending}
        movies={movies}
        onSelect={onSelect}
      />,
    );
    const card = screen.getByText("Matched Movie");
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ stream_id: 1 }),
    );
  });

  // ── Movie matching via name similarity ────────────────────────

  it("matches movie via name similarity when tmdb id differs", () => {
    const trending = [
      makeTmdbMovie({
        id: 999,
        title: "The Matrix Revolutions",
      }),
    ];
    const movies = [
      makeUnifiedMovie({
        stream_id: 2,
        name: "The Matrix Revolutions (2003)",
        tmdb: "888",
      }),
    ];
    render(
      <TrendingMoviesRow
        trending={trending}
        movies={movies}
        onSelect={onSelect}
      />,
    );
    const card = screen.getByText("The Matrix Revolutions");
    fireEvent.click(card);
    // Even though tmdb doesn't match, the name similarity should match
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ stream_id: 2 }),
    );
  });

  it("does not call onSelect when no matching movie is found", () => {
    const trending = [makeTmdbMovie({ id: 1, title: "No Match Here" })];
    const movies = [
      makeUnifiedMovie({ stream_id: 1, name: "Different Movie", tmdb: "2" }),
    ];
    render(
      <TrendingMoviesRow
        trending={trending}
        movies={movies}
        onSelect={onSelect}
      />,
    );
    const card = screen.getByText("No Match Here");
    fireEvent.click(card);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders year text below the title when release_date present", () => {
    const trending = [makeTmdbMovie({ release_date: "2022-01-01" })];
    render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    // Year appears both in the badge and as a subtitle text
    const yearElements = screen.getAllByText("2022");
    expect(yearElements.length).toBeGreaterThanOrEqual(2);
  });

  it("assigns data-row-idx attributes for keyboard navigation", () => {
    const trending = [makeTmdbMovie({ id: 1 }), makeTmdbMovie({ id: 2 })];
    const { container } = render(
      <TrendingMoviesRow trending={trending} movies={[]} onSelect={onSelect} />,
    );
    const cards = container.querySelectorAll("[data-row-idx]");
    expect(cards.length).toBe(2);
    expect(cards[0]).toHaveAttribute("data-row-idx", "0");
    expect(cards[1]).toHaveAttribute("data-row-idx", "1");
  });
});
