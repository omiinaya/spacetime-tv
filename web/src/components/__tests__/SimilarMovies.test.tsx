/**
 * Tests for the SimilarMovies component.
 *
 * SimilarMovies fetches movies from the same category (excluding the
 * current movie) and displays them in a horizontal scrollable row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SimilarMovies from "@/components/SimilarMovies";
import { imageUrl } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  imageUrl: (url: string) => url,
  api: {
    movies: {
      list: vi.fn(),
    },
  },
}));

// Need to import the mocked api
import { api } from "@/lib/api";

const sampleMovies = [
  { stream_id: 1, name: "Movie One", stream_icon: "/icons/movie1.jpg", rating: "8.5", stream_type: "movie", added: "", category_id: "1", category_ids: ["1"], container_extension: "mp4", custom_sid: null, direct_source: "" },
  { stream_id: 2, name: "Movie Two", stream_icon: "/icons/movie2.jpg", rating: "7.2", stream_type: "movie", added: "", category_id: "1", category_ids: ["1"], container_extension: "mp4", custom_sid: null, direct_source: "" },
  { stream_id: 3, name: "Movie Three", stream_icon: "", rating: "", stream_type: "movie", added: "", category_id: "1", category_ids: ["1"], container_extension: "mp4", custom_sid: null, direct_source: "" },
];

describe("SimilarMovies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when API returns empty", async () => {
    (api.movies.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      movies: [],
    });
    const { container } = render(
      <SimilarMovies categoryId="1" currentId={999} />,
    );
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("renders nothing initially until API responds", () => {
    (api.movies.list as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );
    const { container } = render(
      <SimilarMovies categoryId="1" currentId={1} />,
    );
    // Initially empty while loading
    expect(container.innerHTML).toBe("");
  });

  it("renders movies excluding the current movie", async () => {
    (api.movies.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      movies: sampleMovies,
    });

    render(<SimilarMovies categoryId="1" currentId={1} />);

    await waitFor(() => {
      expect(screen.getByText("Movie Two")).toBeInTheDocument();
      expect(screen.getByText("Movie Three")).toBeInTheDocument();
    });

    // Current movie (id=1) should be excluded
    expect(screen.queryByText("Movie One")).not.toBeInTheDocument();
  });

  it('renders "More Like This" heading', async () => {
    (api.movies.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      movies: sampleMovies,
    });

    render(<SimilarMovies categoryId="1" currentId={999} />);

    await waitFor(() => {
      expect(screen.getByText("More Like This")).toBeInTheDocument();
    });
  });

  it("renders posters for movies with stream_icon", async () => {
    (api.movies.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      movies: [sampleMovies[0], sampleMovies[1]],
    });

    render(<SimilarMovies categoryId="1" currentId={999} />);

    await waitFor(() => {
      const img = screen.getByAltText("Movie One poster");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "/icons/movie1.jpg");
    });
  });

  it("renders Film fallback icon when stream_icon is empty", async () => {
    (api.movies.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      movies: [sampleMovies[2]],
    });

    const { container } = render(
      <SimilarMovies categoryId="1" currentId={999} />,
    );

    await waitFor(() => {
      // The Film icon SVG should be in the container
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
    });
  });

  it("renders rating when present", async () => {
    (api.movies.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      movies: [sampleMovies[0]],
    });

    render(<SimilarMovies categoryId="1" currentId={999} />);

    await waitFor(() => {
      expect(screen.getByText("8.5")).toBeInTheDocument();
    });
  });

  it("limits to 10 movies", async () => {
    const manyMovies = Array.from({ length: 20 }, (_, i) => ({
      ...sampleMovies[0],
      stream_id: i + 100,
      name: `Movie ${i + 1}`,
    }));

    (api.movies.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      movies: manyMovies,
    });

    render(<SimilarMovies categoryId="1" currentId={999} />);

    await waitFor(() => {
      // Should only show 10 movies
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(10);
    });
  });

  it("calls api.movies.list with correct category and limit", async () => {
    (api.movies.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      movies: [],
    });

    render(<SimilarMovies categoryId="42" currentId={999} />);

    await waitFor(() => {
      expect(api.movies.list).toHaveBeenCalledWith("42", 12, 0);
    });
  });
});
