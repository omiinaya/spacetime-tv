/**
 * Tests for the TmdbSimilarShows component.
 *
 * TmdbSimilarShows fetches TMDB-based similar TV show recommendations
 * and displays them in a horizontal scrollable row with loading skeletons.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TmdbSimilarShows from "@/components/TmdbSimilarShows";

const mockNavigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/lib/api", () => ({
  api: {
    tmdb: {
      tv: {
        similar: vi.fn(),
      },
    },
  },
}));

import { api } from "@/lib/api";

const sampleResults = [
  {
    id: 201,
    name: "Similar Show 1",
    poster_path: "/show1.jpg",
    first_air_date: "2022-09-01",
    vote_average: 8.5,
    overview: "Great show",
    genre_ids: [18, 80],
    popularity: 200,
    vote_count: 1000,
    origin_country: ["US"],
    original_language: "en",
    original_name: "Similar Show 1 Original",
    backdrop_path: null,
    media_type: "tv",
  },
  {
    id: 202,
    name: "Similar Show 2",
    poster_path: null,
    first_air_date: "",
    vote_average: 0,
    overview: "",
    genre_ids: [],
    popularity: 50,
    vote_count: 100,
    origin_country: [],
    original_language: "en",
    original_name: "Similar Show 2 Original",
    backdrop_path: null,
    media_type: "tv",
  },
];

describe("TmdbSimilarShows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when tmdbId is null", () => {
    const { container } = render(<TmdbSimilarShows tmdbId={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when API returns empty results", async () => {
    (api.tmdb.tv.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [],
    });

    const { container } = render(<TmdbSimilarShows tmdbId={123} />);

    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("shows loading skeletons while fetching", () => {
    (api.tmdb.tv.similar as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    render(<TmdbSimilarShows tmdbId={123} />);

    expect(screen.getByText("TMDB Recommendations…")).toBeInTheDocument();
    // Should render 6 skeleton placeholders
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(6);
  });

  it("renders show recommendations after loading", async () => {
    (api.tmdb.tv.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: sampleResults,
    });

    render(<TmdbSimilarShows tmdbId={123} />);

    await waitFor(() => {
      expect(screen.getByText("TMDB Recommendations")).toBeInTheDocument();
    });

    expect(screen.getByText("Similar Show 1")).toBeInTheDocument();
    expect(screen.getByText("Similar Show 2")).toBeInTheDocument();
  });

  it("renders year extracted from first_air_date", async () => {
    (api.tmdb.tv.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [sampleResults[0]],
    });

    render(<TmdbSimilarShows tmdbId={123} />);

    await waitFor(() => {
      expect(screen.getByText("2022")).toBeInTheDocument();
    });
  });

  it("renders poster image with TMDB URL when poster_path exists", async () => {
    (api.tmdb.tv.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [sampleResults[0]],
    });

    render(<TmdbSimilarShows tmdbId={123} />);

    await waitFor(() => {
      const img = screen.getByAltText("Similar Show 1 poster");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute(
        "src",
        "https://image.tmdb.org/t/p/w342/show1.jpg",
      );
    });
  });

  it("renders fallback when poster_path is null", async () => {
    (api.tmdb.tv.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [sampleResults[1]],
    });

    const { container } = render(<TmdbSimilarShows tmdbId={123} />);

    await waitFor(() => {
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
    });
  });

  it("navigates to series search on click", async () => {
    (api.tmdb.tv.similar as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [sampleResults[0]],
    });

    render(<TmdbSimilarShows tmdbId={123} />);

    await waitFor(() => {
      expect(screen.getByText("Similar Show 1")).toBeInTheDocument();
    });

    screen.getByText("Similar Show 1").click();

    expect(mockNavigate).toHaveBeenCalledWith(
      "/series?q=Similar%20Show%201",
    );
  });

  it("handles API error gracefully", async () => {
    (api.tmdb.tv.similar as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("API error"),
    );

    const { container } = render(<TmdbSimilarShows tmdbId={123} />);

    await waitFor(() => {
      // Should hide after error resolves to empty
      expect(container.innerHTML).toBe("");
    });
  });
});
