/**
 * Tests for the MediaOverlay component.
 *
 * MediaOverlay is a full-screen modal overlay used for movie/series detail
 * views. It renders hero banner, poster, title, genres, rating, year, plot,
 * and slots for play buttons, trailers, and child content.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MediaOverlay from "@/components/MediaOverlay";

vi.mock("@/lib/api", () => ({
  imageUrl: (url: string) => url,
}));

// Prevent useLockBodyScroll side effects
vi.mock("@/hooks/useLockBodyScroll", () => ({
  useLockBodyScroll: vi.fn(),
}));

const defaultProps = {
  onClose: vi.fn(),
  title: "Test Movie",
  genres: ["Action", "Drama", "Sci-Fi", "Comedy"],
  rating: 8.5,
  year: "2024",
  plot: "A short plot.",
};

describe("MediaOverlay — basic rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the title", () => {
    render(<MediaOverlay {...defaultProps} />);
    expect(screen.getByText("Test Movie")).toBeInTheDocument();
  });

  it("renders with role='dialog' and aria-modal", () => {
    render(<MediaOverlay {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Test Movie");
  });

  it("renders genre tags (max 3)", () => {
    render(<MediaOverlay {...defaultProps} />);
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
    expect(screen.getByText("Sci-Fi")).toBeInTheDocument();
    // Comedy should be excluded (slice(0,3))
    expect(screen.queryByText("Comedy")).not.toBeInTheDocument();
  });

  it("renders rating with star icon", () => {
    render(<MediaOverlay {...defaultProps} />);
    expect(screen.getByText("8.5")).toBeInTheDocument();
    // Star icon is present (has fill)
    const stars = document.querySelector(".fill-yellow-400");
    expect(stars).not.toBeNull();
  });

  it("renders year", () => {
    render(<MediaOverlay {...defaultProps} />);
    expect(screen.getByText("2024")).toBeInTheDocument();
  });

  it("renders meta items", () => {
    render(
      <MediaOverlay
        {...defaultProps}
        metaItems={["2h 15m", "English", "4K"]}
      />,
    );
    expect(screen.getByText("2h 15m")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("4K")).toBeInTheDocument();
  });

  it("renders plot text", () => {
    render(<MediaOverlay {...defaultProps} />);
    expect(screen.getByText("A short plot.")).toBeInTheDocument();
  });

  it("renders banner image when bannerUrl is provided", () => {
    render(<MediaOverlay {...defaultProps} bannerUrl="/banners/test.jpg" />);
    const bannerImg = screen.getByAltText("Test Movie banner");
    expect(bannerImg).toBeInTheDocument();
    expect(bannerImg).toHaveAttribute("src", "/banners/test.jpg");
  });

  it("renders poster image when posterUrl is provided", () => {
    render(<MediaOverlay {...defaultProps} posterUrl="/posters/test.jpg" />);
    const posterImg = screen.getByAltText("Test Movie poster");
    expect(posterImg).toBeInTheDocument();
    expect(posterImg).toHaveAttribute("src", "/posters/test.jpg");
  });

  it("renders close button and calls onClose when clicked", () => {
    render(<MediaOverlay {...defaultProps} />);
    const closeBtn = screen.getByLabelText("Close");
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("MediaOverlay — plot toggle", () => {
  const longPlot = "A".repeat(250);

  it('shows "Show more" button for long plot', () => {
    render(<MediaOverlay {...defaultProps} plot={longPlot} />);
    expect(screen.getByText("Show more")).toBeInTheDocument();
    // Plot text should be line-clamped
    const p = screen.getByText(longPlot);
    expect(p.className).toContain("line-clamp-2");
  });

  it('toggles to "Show less" when clicked', () => {
    render(<MediaOverlay {...defaultProps} plot={longPlot} />);
    fireEvent.click(screen.getByText("Show more"));
    expect(screen.getByText("Show less")).toBeInTheDocument();
  });
});

describe("MediaOverlay — loading state", () => {
  it("shows loading spinner when loading is true", () => {
    render(<MediaOverlay {...defaultProps} loading={true} />);
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("hides plot and children while loading", () => {
    render(
      <MediaOverlay {...defaultProps} loading={true}>
        <span>child content</span>
      </MediaOverlay>,
    );
    expect(screen.queryByText("A short plot.")).not.toBeInTheDocument();
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
  });
});

describe("MediaOverlay — error state", () => {
  it("shows error message", () => {
    render(<MediaOverlay {...defaultProps} error="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("hides plot and children when error is present", () => {
    render(
      <MediaOverlay {...defaultProps} error="Failed to load">
        <span>child content</span>
      </MediaOverlay>,
    );
    expect(screen.queryByText("A short plot.")).not.toBeInTheDocument();
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
  });
});

describe("MediaOverlay — slots", () => {
  it("renders playButton", () => {
    render(
      <MediaOverlay {...defaultProps} playButton={<button>▶ Play</button>} />,
    );
    expect(screen.getByText("▶ Play")).toBeInTheDocument();
  });

  it("renders trailerEmbed", () => {
    render(
      <MediaOverlay
        {...defaultProps}
        trailerEmbed={<div data-testid="trailer">Trailer</div>}
      />,
    );
    expect(screen.getByTestId("trailer")).toBeInTheDocument();
  });

  it("renders titleActions", () => {
    render(
      <MediaOverlay
        {...defaultProps}
        titleActions={<span data-testid="title-action">Lang selector</span>}
      />,
    );
    expect(screen.getByTestId("title-action")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <MediaOverlay {...defaultProps}>
        <span>season tabs</span>
      </MediaOverlay>,
    );
    expect(screen.getByText("season tabs")).toBeInTheDocument();
  });
});

describe("MediaOverlay — edge cases", () => {
  it("handles empty genres gracefully", () => {
    render(<MediaOverlay {...defaultProps} genres={[]} />);
    // Should not crash. No genre tags rendered.
    expect(screen.queryByText("Action")).not.toBeInTheDocument();
  });

  it("handles no rating, year, or plot", () => {
    render(<MediaOverlay onClose={vi.fn()} title="Minimal" genres={[]} />);
    expect(screen.getByText("Minimal")).toBeInTheDocument();
    // No rating, year, or plot should be absent
    expect(screen.queryByText("8.5")).not.toBeInTheDocument();
  });

  it("handles bannerSrcset and posterSrcset", () => {
    render(
      <MediaOverlay
        {...defaultProps}
        bannerUrl="/banners/test.jpg"
        bannerSrcset="/banners/test-400.jpg 400w, /banners/test-800.jpg 800w"
        posterUrl="/posters/test.jpg"
        posterSrcset="/posters/test-200.jpg 200w"
      />,
    );
    const bannerImg = screen.getByAltText("Test Movie banner");
    expect(bannerImg).toHaveAttribute("src", "/banners/test.jpg");
    const posterImg = screen.getByAltText("Test Movie poster");
    expect(posterImg).toHaveAttribute("srcset");
  });

  it("does not render banner image when bannerUrl is absent", () => {
    render(<MediaOverlay {...defaultProps} />);
    expect(screen.queryByAltText(/banner/i)).not.toBeInTheDocument();
  });

  it("does not render poster image when posterUrl is absent", () => {
    render(<MediaOverlay {...defaultProps} />);
    expect(screen.queryByAltText(/poster/i)).not.toBeInTheDocument();
  });
});
