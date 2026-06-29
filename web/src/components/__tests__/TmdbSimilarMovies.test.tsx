/**
 * Tests for the TmdbSimilarMovies component.
 *
 * TmdbSimilarMovies fetches TMDB-based similar movie recommendations
 * and displays them in a horizontal scrollable row with loading skeletons.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import TmdbSimilarMovies from "@/components/TmdbSimilarMovies";

const mockNavigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/lib/api", () => ({
  tmdbImgProps: (path: string) => ({
    src: `https://image.tmdb.org/t/p/w342${path}`,
  }),
  api: {
    tmdb: {
      similar: vi.fn(),
    },
  },
}));

import { api } from "@/lib/api";

const sampleResults = [
  {
    id: 101,
    title: "Similar Movie 1",
    poster_path: "/poster1.jpg",
    release_date: "2023-05-15",
    vote_average: 8.1,
    overview: "Great movie",
    genre_ids: [28, 12],
    popularity: 100,
    vote_count: 500,
    adult: false,
    video: false,
    original_language: "en",
    original_title: "Similar Movie 1 Original",
    backdrop_path: null,
    media_type: "movie",
  },
  {
    id: 102,
    title: "Similar Movie 2",
    poster_path: null,
    release_date: "",
    vote_average: 0,
    overview: "",
    genre_ids: [],
    popularity: 50,
    vote_count: 100,
    adult: false,
    video: false,
    original_language: "en",
    original_title: "Similar Movie 2 Original",
    backdrop_path: null,
    media_type: "movie",
  },
];

describe("TmdbSimilarMovies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when tmdbId is null", () => {
    const { container } = render(<TmdbSimilarMovies tmdbId={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when API returns empty results", async () => {
    (api.tmdb.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [],
    });

    const { container } = render(<TmdbSimilarMovies tmdbId={123} />);

    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("shows loading skeletons while fetching", () => {
    (api.tmdb.similar as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    render(<TmdbSimilarMovies tmdbId={123} />);

    expect(screen.getByText("TMDB Recommendations…")).toBeInTheDocument();
    // Should render 6 skeleton placeholders
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(6);
  });

  it("renders movie recommendations after loading", async () => {
    (api.tmdb.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: sampleResults,
    });

    render(<TmdbSimilarMovies tmdbId={123} />);

    await waitFor(() => {
      expect(screen.getByText("TMDB Recommendations")).toBeInTheDocument();
    });

    expect(screen.getByText("Similar Movie 1")).toBeInTheDocument();
    expect(screen.getByText("Similar Movie 2")).toBeInTheDocument();
  });

  it("renders year extracted from release_date", async () => {
    (api.tmdb.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [sampleResults[0]],
    });

    render(<TmdbSimilarMovies tmdbId={123} />);

    await waitFor(() => {
      expect(screen.getByText("2023")).toBeInTheDocument();
    });
  });

  it("renders poster image with tmdbImgProps", async () => {
    (api.tmdb.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [sampleResults[0]],
    });

    render(<TmdbSimilarMovies tmdbId={123} />);

    await waitFor(() => {
      const img = screen.getByAltText("Similar Movie 1 poster");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute(
        "src",
        "https://image.tmdb.org/t/p/w342/poster1.jpg",
      );
    });
  });

  it("renders fallback when poster_path is null", async () => {
    (api.tmdb.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [sampleResults[1]],
    });

    const { container } = render(<TmdbSimilarMovies tmdbId={123} />);

    await waitFor(() => {
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
    });
  });

  it("navigates to movies search on click", async () => {
    (api.tmdb.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [sampleResults[0]],
    });

    render(<TmdbSimilarMovies tmdbId={123} />);

    await waitFor(() => {
      expect(screen.getByText("Similar Movie 1")).toBeInTheDocument();
    });

    screen.getByText("Similar Movie 1").click();

    expect(mockNavigate).toHaveBeenCalledWith(
      "/movies?q=Similar%20Movie%201",
    );
  });

  it("handles API error gracefully", async () => {
    (api.tmdb.similar as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("API error"),
    );

    const { container } = render(<TmdbSimilarMovies tmdbId={123} />);

    await waitFor(() => {
      // Should hide after error resolves to empty
      expect(container.innerHTML).toBe("");
    });
  });
});
