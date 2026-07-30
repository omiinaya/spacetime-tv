/**
 * Tests for RecentlyAddedRow component.
 *
 * Shows a horizontal scrollable row of recently added movies,
 * filtered by the `added` field, sorted descending, limited to 12.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RecentlyAddedRow from "../RecentlyAddedRow";
import type { UnifiedMovie } from "@/lib/types";

// Mock the API imageUrl helper
vi.mock("@/lib/api", () => ({
  imageUrl: (url: string) => url,
}));

const makeMovie = (
  overrides: Partial<UnifiedMovie> = {},
): UnifiedMovie =>
  ({
    stream_id: Date.now() + Math.random(),
    name: "Test Movie",
    base_name: "Test Movie",
    stream_icon: "",
    rating: "",
    added: "1700000000",
    stream_type: "movie",
    ...overrides,
  }) as UnifiedMovie;

describe("RecentlyAddedRow", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty state ───────────────────────────────────────────────

  it("returns null when movies array is empty", () => {
    const { container } = render(
      <RecentlyAddedRow movies={[]} onSelect={onSelect} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when no movies have an `added` field", () => {
    const noAdded = [
      makeMovie({ added: undefined }),
      makeMovie({ added: undefined }),
    ];
    const { container } = render(
      <RecentlyAddedRow movies={noAdded} onSelect={onSelect} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("filters out movies without `added` field", () => {
    const mixed = [
      makeMovie({
        stream_id: 1,
        name: "With Added",
        base_name: "With Added",
        added: "1700000000",
      }),
      makeMovie({
        stream_id: 2,
        name: "No Added",
        base_name: "No Added",
        added: undefined,
      }),
      makeMovie({
        stream_id: 3,
        name: "Also Added",
        base_name: "Also Added",
        added: "1690000000",
      }),
    ];
    render(<RecentlyAddedRow movies={mixed} onSelect={onSelect} />);

    expect(screen.getByText("With Added")).toBeInTheDocument();
    expect(screen.getByText("Also Added")).toBeInTheDocument();
    expect(screen.queryByText("No Added")).not.toBeInTheDocument();
  });

  // ── Sorting ───────────────────────────────────────────────────

  it("sorts by `added` descending", () => {
    const movies = [
      makeMovie({ stream_id: 1, name: "Oldest", added: "1000000000", base_name: "Oldest" }),
      makeMovie({ stream_id: 2, name: "Newest", added: "2000000000", base_name: "Newest" }),
      makeMovie({ stream_id: 3, name: "Middle", added: "1500000000", base_name: "Middle" }),
    ];
    render(<RecentlyAddedRow movies={movies} onSelect={onSelect} />);

    const titles = screen.getAllByRole("button");
    // Each button contains a <p> with the movie name
    expect(titles[0]).toHaveTextContent("Newest");
    expect(titles[1]).toHaveTextContent("Middle");
    expect(titles[2]).toHaveTextContent("Oldest");
  });

  // ── Limit ─────────────────────────────────────────────────────

  it("renders up to 12 items even when more movies have `added` field", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeMovie({
        stream_id: 100 + i,
        name: `Movie ${i + 1}`,
        added: String(1700000000 + i),
      }),
    );
    render(<RecentlyAddedRow movies={many} onSelect={onSelect} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(12);
  });

  // ── Heading ───────────────────────────────────────────────────

  it('renders "Recently Added" heading', () => {
    const movies = [makeMovie({ stream_id: 1 })];
    render(<RecentlyAddedRow movies={movies} onSelect={onSelect} />);

    expect(screen.getByText("Recently Added")).toBeInTheDocument();
  });

  // ── Poster / fallback ─────────────────────────────────────────

  it("renders poster image when stream_icon is present", () => {
    const movies = [
      makeMovie({
        stream_id: 1,
        name: "Poster Movie",
        stream_icon: "https://example.com/poster.jpg",
      }),
    ];
    render(<RecentlyAddedRow movies={movies} onSelect={onSelect} />);

    const img = screen.getByAltText("Poster Movie poster");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/poster.jpg");
  });

  it("shows fallback Film icon when stream_icon is empty", () => {
    const movies = [
      makeMovie({
        stream_id: 1,
        stream_icon: "",
      }),
    ];
    const { container } = render(
      <RecentlyAddedRow movies={movies} onSelect={onSelect} />,
    );

    // Film icon from lucide-react
    const svgs = container.querySelectorAll("svg.lucide-film");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
    // No img tag should be rendered
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows fallback Film icon when stream_icon is undefined", () => {
    const movies = [makeMovie({ stream_id: 1, stream_icon: undefined })];
    const { container } = render(
      <RecentlyAddedRow movies={movies} onSelect={onSelect} />,
    );

    const svgs = container.querySelectorAll("svg.lucide-film");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  // ── Rating badge ──────────────────────────────────────────────

  it("shows rating badge when rating is present", () => {
    const movies = [
      makeMovie({ stream_id: 1, rating: "8.5" }),
    ];
    render(<RecentlyAddedRow movies={movies} onSelect={onSelect} />);

    expect(screen.getByText("★8.5")).toBeInTheDocument();
  });

  it("formats rating with one decimal place", () => {
    const movies = [
      makeMovie({ stream_id: 1, rating: "9" }),
    ];
    render(<RecentlyAddedRow movies={movies} onSelect={onSelect} />);

    expect(screen.getByText("★9.0")).toBeInTheDocument();
  });

  it("does not show rating badge when rating is empty", () => {
    const movies = [
      makeMovie({ stream_id: 1, rating: "" }),
    ];
    render(<RecentlyAddedRow movies={movies} onSelect={onSelect} />);

    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });

  it("does not show rating badge when rating is not provided", () => {
    const movies = [makeMovie({ stream_id: 1, rating: undefined })];
    render(<RecentlyAddedRow movies={movies} onSelect={onSelect} />);

    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });

  // ── Title display ─────────────────────────────────────────────

  it("shows base_name over name", () => {
    const movies = [
      makeMovie({
        stream_id: 1,
        name: "Inception (2010)",
        base_name: "Inception",
      }),
    ];
    render(<RecentlyAddedRow movies={movies} onSelect={onSelect} />);

    expect(screen.getByText("Inception")).toBeInTheDocument();
    expect(screen.queryByText("Inception (2010)")).not.toBeInTheDocument();
  });

  it("falls back to name when base_name is not present", () => {
    const movies = [
      makeMovie({ stream_id: 1, name: "The Matrix", base_name: "" }),
    ];
    render(<RecentlyAddedRow movies={movies} onSelect={onSelect} />);

    expect(screen.getByText("The Matrix")).toBeInTheDocument();
  });

  // ── onSelect interaction ──────────────────────────────────────

  it("calls onSelect with the movie when a card is clicked", () => {
    const movie = makeMovie({ stream_id: 42, name: "Click Me", base_name: "Click Me" });
    render(<RecentlyAddedRow movies={[movie]} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Click Me"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ stream_id: 42 }),
    );
  });
});
