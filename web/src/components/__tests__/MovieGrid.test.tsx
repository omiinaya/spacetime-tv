/**
 * Tests for MovieGrid component.
 *
 * Renders a responsive grid of movie cards with poster, rating badge,
 * year badge, language badge, watchlist heart, focus highlighting,
 * and keyboard/click interactions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MovieGrid from "../MovieGrid";
import type { UnifiedMovie } from "@/lib/types";

// Mock API and watchlist modules
vi.mock("@/lib/api", () => ({
  imageUrl: (url: string) => url,
}));

vi.mock("@/lib/watchlist", () => ({
  isInWatchlist: vi.fn(() => false),
  getWatchlist: vi.fn(() => []),
}));

// Import the mocked module so we can control isInWatchlist per test
import { isInWatchlist } from "@/lib/watchlist";

const makeMovie = (overrides: Partial<UnifiedMovie> = {}): UnifiedMovie =>
  ({
    stream_id: 1,
    name: "Inception (2010)",
    base_name: "Inception",
    stream_icon: "https://example.com/inception.jpg",
    rating: "8.5",
    language_count: 1,
    stream_type: "movie",
    ...overrides,
  }) as UnifiedMovie;

const defaultProps = {
  movies: [] as UnifiedMovie[],
  focusedIdx: null as number | null,
  onSelect: vi.fn(),
  onKeyDown: vi.fn(),
  onToggleWatchlist: vi.fn(),
  yearFromName: vi.fn(() => null),
  gridRef: { current: null } as React.RefObject<HTMLDivElement | null>,
};

describe("MovieGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.movies = [];
    defaultProps.focusedIdx = null;
  });

  // ── Grid container ────────────────────────────────────────────

  it("renders the grid container with responsive columns", () => {
    const { container } = render(<MovieGrid {...defaultProps} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid).toBeInTheDocument();
    expect(grid.className).toContain("grid");
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("sm:grid-cols-3");
    expect(grid.className).toContain("md:grid-cols-4");
    expect(grid.className).toContain("lg:grid-cols-5");
    expect(grid.className).toContain("xl:grid-cols-6");
  });

  it("passes gridRef to the container div", () => {
    const ref = { current: null as HTMLDivElement | null };
    const { container } = render(<MovieGrid {...defaultProps} gridRef={ref} />);
    expect(ref.current).toBe(container.firstChild);
  });

  // ── Rendering movie cards ─────────────────────────────────────

  it("renders all movie cards", () => {
    const movies = [
      makeMovie({ stream_id: 1, name: "Movie A", base_name: "Movie A" }),
      makeMovie({ stream_id: 2, name: "Movie B", base_name: "Movie B" }),
      makeMovie({ stream_id: 3, name: "Movie C", base_name: "Movie C" }),
    ];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    expect(screen.getByText("Movie A")).toBeInTheDocument();
    expect(screen.getByText("Movie B")).toBeInTheDocument();
    expect(screen.getByText("Movie C")).toBeInTheDocument();
  });

  it("renders empty state gracefully", () => {
    const { container } = render(<MovieGrid {...defaultProps} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children.length).toBe(0);
  });

  // ── Rating badge ──────────────────────────────────────────────

  it("shows rating badge when rating is present", () => {
    const movies = [makeMovie({ rating: "9.2" })];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    expect(screen.getByText("9.2")).toBeInTheDocument();
  });

  it("formats rating with one decimal place", () => {
    const movies = [makeMovie({ rating: "7" })];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    expect(screen.getByText("7.0")).toBeInTheDocument();
  });

  it("does not show rating badge when rating is empty", () => {
    const movies = [makeMovie({ rating: "" })];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    expect(screen.queryByText(/\d+\.\d/)).not.toBeInTheDocument();
  });

  // ── Year badge ────────────────────────────────────────────────

  it("shows year badge when yearFromName returns a year", () => {
    const yearFromName = vi.fn(() => "2010");
    const movies = [makeMovie({ name: "Inception (2010)" })];
    render(
      <MovieGrid
        {...defaultProps}
        movies={movies}
        yearFromName={yearFromName}
      />,
    );

    expect(screen.getByText("2010")).toBeInTheDocument();
    expect(yearFromName).toHaveBeenCalledWith("Inception (2010)");
  });

  it("does not show year badge when yearFromName returns null", () => {
    const yearFromName = vi.fn(() => null);
    const movies = [makeMovie({ name: "Unknown Movie" })];
    render(
      <MovieGrid
        {...defaultProps}
        movies={movies}
        yearFromName={yearFromName}
      />,
    );

    expect(screen.queryByText(/^\\d{4}$/)).not.toBeInTheDocument();
  });

  // ── Watchlist heart button ────────────────────────────────────

  it("renders watchlist heart button for each movie", () => {
    const movies = [makeMovie({ stream_id: 1 })];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    const heartBtn = screen.getByLabelText("Add to watchlist");
    expect(heartBtn).toBeInTheDocument();
    expect(heartBtn.querySelector("svg.lucide-heart")).toBeInTheDocument();
  });

  it("calls isInWatchlist for each movie stream_id", () => {
    const movies = [makeMovie({ stream_id: 42 }), makeMovie({ stream_id: 99 })];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    expect(isInWatchlist).toHaveBeenCalledWith(42);
    expect(isInWatchlist).toHaveBeenCalledWith(99);
  });

  it('shows "Remove from watchlist" label when movie is in watchlist', () => {
    (isInWatchlist as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const movies = [makeMovie({ stream_id: 1 })];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    expect(screen.getByLabelText("Remove from watchlist")).toBeInTheDocument();
  });

  it('shows "Add to watchlist" label when movie is not in watchlist', () => {
    (isInWatchlist as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const movies = [makeMovie({ stream_id: 1 })];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    expect(screen.getByLabelText("Add to watchlist")).toBeInTheDocument();
  });

  // ── Focused state ─────────────────────────────────────────────

  it("applies focused styling to the card at focusedIdx", () => {
    const movies = [
      makeMovie({ stream_id: 1, name: "Movie One" }),
      makeMovie({ stream_id: 2, name: "Movie Two" }),
      makeMovie({ stream_id: 3, name: "Movie Three" }),
    ];
    const { container } = render(
      <MovieGrid {...defaultProps} movies={movies} focusedIdx={1} />,
    );

    const cards = container.querySelectorAll("[data-grid-idx]");
    expect(cards.length).toBe(3);

    // The focused card (idx 1) should have 'border-primary' and NOT 'border-border'
    expect(cards[0].className).toContain("border-border");
    expect(cards[0].className).not.toContain("border-primary ");

    expect(cards[1].className).toContain("border-primary");
    expect(cards[1].className).not.toContain("border-border");

    // Card at idx 2 is not focused
    expect(cards[2].className).toContain("border-border");
  });

  it("does not apply focus styles when focusedIdx is null", () => {
    const movies = [makeMovie({ stream_id: 1 })];
    const { container } = render(
      <MovieGrid {...defaultProps} movies={movies} focusedIdx={null} />,
    );

    const card = container.querySelector("[data-grid-idx]")!;
    expect(card.className).toContain("border-border");
    expect(card.className).not.toContain("border-primary ");
  });

  // ── Click interaction ─────────────────────────────────────────

  it("calls onSelect with the movie when a card is clicked", () => {
    const onSelect = vi.fn();
    const movies = [makeMovie({ stream_id: 42 })];
    render(<MovieGrid {...defaultProps} movies={movies} onSelect={onSelect} />);

    const card = screen.getByText("Inception").closest("[data-grid-idx]")!;
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ stream_id: 42 }),
    );
  });

  // ── KeyDown interaction ───────────────────────────────────────

  it("calls onKeyDown when a key is pressed on a card", () => {
    const onKeyDown = vi.fn();
    const movies = [
      makeMovie({ stream_id: 1, name: "Test Movie", base_name: "Test Movie" }),
    ];
    render(
      <MovieGrid {...defaultProps} movies={movies} onKeyDown={onKeyDown} />,
    );

    const card = screen.getByText("Test Movie").closest("[data-grid-idx]")!;
    fireEvent.keyDown(card, { key: "ArrowRight" });
    expect(onKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ArrowRight" }),
      0,
    );
  });

  it("calls onSelect on Enter key", () => {
    const onSelect = vi.fn();
    const movies = [makeMovie({ stream_id: 1 })];
    render(<MovieGrid {...defaultProps} movies={movies} onSelect={onSelect} />);

    const card = screen.getByText("Inception").closest("[data-grid-idx]")!;
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ stream_id: 1 }),
    );
  });

  it("calls onSelect on Space key", () => {
    const onSelect = vi.fn();
    const movies = [makeMovie({ stream_id: 1 })];
    render(<MovieGrid {...defaultProps} movies={movies} onSelect={onSelect} />);

    const card = screen.getByText("Inception").closest("[data-grid-idx]")!;
    fireEvent.keyDown(card, { key: " " });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ stream_id: 1 }),
    );
  });

  it("calls onKeyDown alongside onSelect for Enter/Space", () => {
    const onSelect = vi.fn();
    const onKeyDown = vi.fn();
    const movies = [makeMovie({ stream_id: 1 })];
    render(
      <MovieGrid
        {...defaultProps}
        movies={movies}
        onSelect={onSelect}
        onKeyDown={onKeyDown}
      />,
    );

    const card = screen.getByText("Inception").closest("[data-grid-idx]")!;
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onSelect).toHaveBeenCalled();
    expect(onKeyDown).toHaveBeenCalled();
  });

  // ── Watchlist toggle (heart click) ────────────────────────────

  it("calls onToggleWatchlist when heart button is clicked", () => {
    const onToggleWatchlist = vi.fn();
    const movies = [makeMovie({ stream_id: 42 })];
    render(
      <MovieGrid
        {...defaultProps}
        movies={movies}
        onToggleWatchlist={onToggleWatchlist}
      />,
    );

    const heartBtn = screen.getByLabelText("Add to watchlist");
    fireEvent.click(heartBtn);
    expect(onToggleWatchlist).toHaveBeenCalledWith(42);
  });

  it("stops propagation on heart button click (does not trigger onSelect)", () => {
    const onSelect = vi.fn();
    const onToggleWatchlist = vi.fn();
    const movies = [makeMovie({ stream_id: 42 })];
    render(
      <MovieGrid
        {...defaultProps}
        movies={movies}
        onSelect={onSelect}
        onToggleWatchlist={onToggleWatchlist}
      />,
    );

    const heartBtn = screen.getByLabelText("Add to watchlist");
    fireEvent.click(heartBtn);
    // onSelect should NOT be called — stopPropagation prevents it
    expect(onToggleWatchlist).toHaveBeenCalledWith(42);
    expect(onSelect).not.toHaveBeenCalled();
  });

  // ── Language badge ────────────────────────────────────────────

  it("shows language badge when language_count > 1", () => {
    const movies = [makeMovie({ language_count: 3 })];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    // The globe icon should be present
    const svgs = document.querySelectorAll("svg.lucide-globe");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show language badge when language_count is 1", () => {
    const movies = [makeMovie({ language_count: 1 })];
    const { container } = render(
      <MovieGrid {...defaultProps} movies={movies} />,
    );

    expect(container.querySelectorAll("svg.lucide-globe").length).toBe(0);
  });

  it("does not show language badge when language_count is undefined", () => {
    const movies = [makeMovie({ language_count: undefined })];
    const { container } = render(
      <MovieGrid {...defaultProps} movies={movies} />,
    );

    expect(container.querySelectorAll("svg.lucide-globe").length).toBe(0);
  });

  // ── Poster / fallback ─────────────────────────────────────────

  it("renders poster image when stream_icon is present", () => {
    const movies = [
      makeMovie({ stream_icon: "https://example.com/poster.jpg" }),
    ];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    const img = screen.getByAltText("");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/poster.jpg");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("shows fallback Film icon when stream_icon is empty", () => {
    const movies = [makeMovie({ stream_icon: "" })];
    const { container } = render(
      <MovieGrid {...defaultProps} movies={movies} />,
    );

    const svgs = container.querySelectorAll("svg.lucide-film");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows fallback Film icon when stream_icon is undefined", () => {
    const movies = [makeMovie({ stream_icon: undefined })];
    const { container } = render(
      <MovieGrid {...defaultProps} movies={movies} />,
    );

    const svgs = container.querySelectorAll("svg.lucide-film");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  // ── Title display ─────────────────────────────────────────────

  it("shows base_name over name for the title", () => {
    const movies = [
      makeMovie({
        name: "Inception (2010)",
        base_name: "Inception",
      }),
    ];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    expect(screen.getByText("Inception")).toBeInTheDocument();
    expect(screen.queryByText("Inception (2010)")).not.toBeInTheDocument();
  });

  it("falls back to name when base_name is not set", () => {
    const movies = [makeMovie({ name: "The Matrix", base_name: "" })];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    expect(screen.getByText("The Matrix")).toBeInTheDocument();
  });

  // ── data-grid-idx attribute ───────────────────────────────────

  it("assigns data-grid-idx for keyboard navigation", () => {
    const movies = [makeMovie({ stream_id: 1 }), makeMovie({ stream_id: 2 })];
    const { container } = render(
      <MovieGrid {...defaultProps} movies={movies} />,
    );

    const cards = container.querySelectorAll("[data-grid-idx]");
    expect(cards.length).toBe(2);
    expect(cards[0]).toHaveAttribute("data-grid-idx", "0");
    expect(cards[1]).toHaveAttribute("data-grid-idx", "1");
  });

  // ── Role and tabIndex ─────────────────────────────────────────

  it('each card has role="button" and tabIndex={0}', () => {
    const movies = [makeMovie({ stream_id: 1 })];
    render(<MovieGrid {...defaultProps} movies={movies} />);

    const card = screen.getByText("Inception").closest("[data-grid-idx]")!;
    expect(card).toHaveAttribute("role", "button");
    expect(card).toHaveAttribute("tabindex", "0");
  });
});
