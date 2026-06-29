/**
 * Tests for the SimilarSeries component.
 *
 * SimilarSeries fetches series from the same category (excluding the
 * current series) and displays them in a horizontal scrollable row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SimilarSeries from "@/components/SimilarSeries";
import { imageUrl } from "@/lib/api";

const mockNavigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/lib/api", () => ({
  imageUrl: (url: string) => url,
  api: {
    series: {
      list: vi.fn(),
    },
  },
}));

import { api } from "@/lib/api";

const sampleSeries = [
  { series_id: 1, name: "Series One", cover: "/covers/series1.jpg", rating: "9.0", category_id: ["1"], category_ids: ["1"], stream_type: "series", num: 1, series_episodes: [], release_date: "" },
  { series_id: 2, name: "Series Two", cover: "/covers/series2.jpg", rating: "8.2", category_id: ["1"], category_ids: ["1"], stream_type: "series", num: 2, series_episodes: [], release_date: "" },
  { series_id: 3, name: "Series Three", cover: "", rating: "", category_id: ["1"], category_ids: ["1"], stream_type: "series", num: 3, series_episodes: [], release_date: "" },
];

describe("SimilarSeries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when API returns empty", async () => {
    (api.series.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      series: [],
    });
    const { container } = render(
      <SimilarSeries categoryId="1" currentId={999} />,
    );
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("renders series excluding the current series", async () => {
    (api.series.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      series: sampleSeries,
    });

    render(<SimilarSeries categoryId="1" currentId={1} />);

    await waitFor(() => {
      expect(screen.getByText("Series Two")).toBeInTheDocument();
      expect(screen.getByText("Series Three")).toBeInTheDocument();
    });

    // Current series (id=1) should be excluded
    expect(screen.queryByText("Series One")).not.toBeInTheDocument();
  });

  it('renders "More Like This" heading', async () => {
    (api.series.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      series: sampleSeries,
    });

    render(<SimilarSeries categoryId="1" currentId={999} />);

    await waitFor(() => {
      expect(screen.getByText("More Like This")).toBeInTheDocument();
    });
  });

  it("renders cover images when cover is present", async () => {
    (api.series.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      series: [sampleSeries[0]],
    });

    render(<SimilarSeries categoryId="1" currentId={999} />);

    await waitFor(() => {
      const img = screen.getByAltText("Series One poster");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "/covers/series1.jpg");
    });
  });

  it("renders Tv2 fallback icon when cover is empty", async () => {
    (api.series.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      series: [sampleSeries[2]],
    });

    const { container } = render(
      <SimilarSeries categoryId="1" currentId={999} />,
    );

    await waitFor(() => {
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
    });
  });

  it("renders rating when present", async () => {
    (api.series.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      series: [sampleSeries[0]],
    });

    render(<SimilarSeries categoryId="1" currentId={999} />);

    await waitFor(() => {
      expect(screen.getByText("9.0")).toBeInTheDocument();
    });
  });

  it("limits to 10 series", async () => {
    const manySeries = Array.from({ length: 20 }, (_, i) => ({
      ...sampleSeries[0],
      series_id: i + 100,
      name: `Series ${i + 1}`,
    }));

    (api.series.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      series: manySeries,
    });

    render(<SimilarSeries categoryId="1" currentId={999} />);

    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(10);
    });
  });

  it("calls api.series.list with correct category and limit", async () => {
    (api.series.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      series: [],
    });

    render(<SimilarSeries categoryId="42" currentId={999} />);

    await waitFor(() => {
      expect(api.series.list).toHaveBeenCalledWith("42", 12, 0);
    });
  });

  it("navigates to /series with state on click", async () => {
    (api.series.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      series: [sampleSeries[0]],
    });

    render(<SimilarSeries categoryId="1" currentId={999} />);

    await waitFor(() => {
      expect(screen.getByText("Series One")).toBeInTheDocument();
    });

    screen.getByText("Series One").click();

    expect(mockNavigate).toHaveBeenCalledWith("/series", {
      state: { openSeries: sampleSeries[0] },
    });
  });
});
