/**
 * Tests for the WatchlistPopover component.
 *
 * WatchlistPopover shows the user's saved movies/series in a popover sidebar.
 * Covers: loading, empty, error, items, outside click, Escape, navigation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WatchlistPopover from "../WatchlistPopover";

// ── Router mock ──────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Watchlist lib mock ───────────────────────────────────────
const mockGetWatchlist = vi.fn(() => []);
const mockGetSeriesWatchlist = vi.fn(() => []);
const mockGetWatchlistCount = vi.fn(() => 0);
const mockGetSeriesWatchlistCount = vi.fn(() => 0);
vi.mock("@/lib/watchlist", () => ({
  getWatchlist: (...args: unknown[]) =>
    (mockGetWatchlist as (...a: unknown[]) => number[])(...args),
  getSeriesWatchlist: (...args: unknown[]) =>
    (mockGetSeriesWatchlist as (...a: unknown[]) => number[])(...args),
  getWatchlistCount: (...args: unknown[]) =>
    (mockGetWatchlistCount as (...a: unknown[]) => number)(...args),
  getSeriesWatchlistCount: (...args: unknown[]) =>
    (mockGetSeriesWatchlistCount as (...a: unknown[]) => number)(...args),
}));

// ── API mock ─────────────────────────────────────────────────
const mockUnified = vi.fn();
const mockSeriesDetails = vi.fn();
const mockImageUrl = vi.fn((url: string) => url);
vi.mock("@/lib/api", () => ({
  api: {
    movies: {
      unified: (...args: unknown[]) =>
        (mockUnified as (...a: unknown[]) => Promise<{ movies: unknown[] }>)(
          ...args,
        ),
    },
    series: {
      details: (...args: unknown[]) =>
        (
          mockSeriesDetails as (
            ...a: unknown[]
          ) => Promise<{ info?: Record<string, unknown> }>
        )(...args),
    },
  },
  imageUrl: (...args: unknown[]) =>
    (mockImageUrl as (...a: unknown[]) => string)(...args),
}));

// ── Helpers ──────────────────────────────────────────────────
function onClose() {}

const BASE_MOVIE = {
  stream_id: 1,
  name: "Test Movie",
  stream_icon: "/img.jpg",
  rating: "8.5",
  added: "2026-01-01",
};
const BASE_SERIES = {
  info: {
    name: "Test Series",
    cover: "/series.jpg",
    releaseDate: "2025",
    rating: "9.0",
  },
};

function resetMocks() {
  vi.clearAllMocks();
  mockGetWatchlist.mockReturnValue([]);
  mockGetSeriesWatchlist.mockReturnValue([]);
  mockGetWatchlistCount.mockReturnValue(0);
  mockGetSeriesWatchlistCount.mockReturnValue(0);
  mockUnified.mockResolvedValue({ movies: [] });
  mockSeriesDetails.mockResolvedValue({});
  mockImageUrl.mockImplementation((url: string) => url);
}

// ═════════════════════════════════════════════════════════════
describe("WatchlistPopover", () => {
  beforeEach(() => {
    resetMocks();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows loading state initially", () => {
    mockGetWatchlist.mockReturnValue([1]);
    mockGetWatchlistCount.mockReturnValue(5);
    mockGetSeriesWatchlistCount.mockReturnValue(3);
    // Return a never-resolving promise so the IIFE stays in loading state
    mockUnified.mockReturnValue(new Promise(() => {}));
    render(<WatchlistPopover onClose={onClose} />);
    expect(screen.getByText("Watchlist")).toBeInTheDocument();
    expect(screen.getByText("8 items")).toBeInTheDocument();
  });

  it("shows empty state when nothing in watchlist", async () => {
    render(<WatchlistPopover onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("Your watchlist is empty")).toBeInTheDocument();
    });
    expect(screen.getByText("Browse Movies")).toBeInTheDocument();
  });

  it("renders watchlist items with correct info", async () => {
    mockGetWatchlist.mockReturnValue([1]);
    mockGetWatchlistCount.mockReturnValue(1);
    mockUnified.mockResolvedValue({
      movies: [BASE_MOVIE],
    });
    render(<WatchlistPopover onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("Test Movie")).toBeInTheDocument();
    });
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("8.5")).toBeInTheDocument();
    expect(screen.getByText("movie")).toBeInTheDocument();
  });

  it("renders series items when in series watchlist", async () => {
    mockGetSeriesWatchlist.mockReturnValue([1]);
    mockGetSeriesWatchlistCount.mockReturnValue(1);
    mockSeriesDetails.mockResolvedValue(BASE_SERIES);
    render(<WatchlistPopover onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("Test Series")).toBeInTheDocument();
    });
    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(screen.getByText("9.0")).toBeInTheDocument();
    expect(screen.getByText("series")).toBeInTheDocument();
  });

  it("limits displayed items to 6", async () => {
    mockGetWatchlist.mockReturnValue([1, 2, 3, 4, 5, 6, 7]);
    mockGetWatchlistCount.mockReturnValue(7);
    mockUnified.mockResolvedValue({
      movies: Array.from({ length: 7 }, (_, i) => ({
        stream_id: i + 1,
        name: `Movie ${i + 1}`,
        stream_icon: "",
        rating: "5.0",
        added: "2026-01-01",
      })),
    });
    render(<WatchlistPopover onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("Movie 6")).toBeInTheDocument();
    });
    expect(screen.queryByText("Movie 7")).not.toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    mockGetWatchlist.mockReturnValue([1]);
    mockGetWatchlistCount.mockReturnValue(1);
    mockUnified.mockRejectedValue(new Error("Network error"));
    render(<WatchlistPopover onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("calls onClose on outside click", async () => {
    const close = vi.fn();
    render(<WatchlistPopover onClose={close} />);
    // Click outside the popover
    fireEvent.mouseDown(document.body);
    expect(close).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const close = vi.fn();
    render(<WatchlistPopover onClose={close} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalled();
  });

  it("navigates to movie on item click", async () => {
    mockGetWatchlist.mockReturnValue([1]);
    mockGetWatchlistCount.mockReturnValue(1);
    mockUnified.mockResolvedValue({
      movies: [BASE_MOVIE],
    });
    const close = vi.fn();
    render(<WatchlistPopover onClose={close} />);
    await waitFor(() => {
      expect(screen.getByText("Test Movie")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Test Movie"));
    expect(mockNavigate).toHaveBeenCalledWith("/movies?q=Test%20Movie");
    expect(close).toHaveBeenCalled();
  });

  it("navigates to series on series item click", async () => {
    mockGetSeriesWatchlist.mockReturnValue([1]);
    mockGetSeriesWatchlistCount.mockReturnValue(1);
    mockSeriesDetails.mockResolvedValue(BASE_SERIES);
    const close = vi.fn();
    render(<WatchlistPopover onClose={close} />);
    await waitFor(() => {
      expect(screen.getByText("Test Series")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Test Series"));
    expect(mockNavigate).toHaveBeenCalledWith("/series?q=Test%20Series");
    expect(close).toHaveBeenCalled();
  });

  it("View all navigates to /watchlist", async () => {
    mockGetWatchlist.mockReturnValue([1]);
    mockGetWatchlistCount.mockReturnValue(1);
    mockUnified.mockResolvedValue({ movies: [BASE_MOVIE] });
    render(<WatchlistPopover onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("View all")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("View all"));
    expect(mockNavigate).toHaveBeenCalledWith("/watchlist");
  });

  it("Browse Movies navigates to /movies", async () => {
    render(<WatchlistPopover onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("Browse Movies")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Browse Movies"));
    expect(mockNavigate).toHaveBeenCalledWith("/movies");
  });

  it("shows poster image when available", async () => {
    mockGetWatchlist.mockReturnValue([1]);
    mockGetWatchlistCount.mockReturnValue(1);
    mockUnified.mockResolvedValue({
      movies: [BASE_MOVIE],
    });
    render(<WatchlistPopover onClose={onClose} />);
    await waitFor(() => {
      const img = document.querySelector("img");
      expect(img).toBeInTheDocument();
      expect(img?.getAttribute("src")).toBe("/img.jpg");
    });
  });

  it("shows film icon placeholder when no poster for movie", async () => {
    mockGetWatchlist.mockReturnValue([1]);
    mockGetWatchlistCount.mockReturnValue(1);
    mockUnified.mockResolvedValue({
      movies: [{ ...BASE_MOVIE, stream_icon: "" }],
    });
    render(<WatchlistPopover onClose={onClose} />);
    await waitFor(() => {
      // Film icon from lucide renders an inline SVG
      expect(document.querySelector("svg")).toBeInTheDocument();
    });
  });

  it("shows total count in header", () => {
    mockGetWatchlistCount.mockReturnValue(5);
    mockGetSeriesWatchlistCount.mockReturnValue(3);
    render(<WatchlistPopover onClose={onClose} />);
    expect(screen.getByText("8 items")).toBeInTheDocument();
  });

  it("shows singular 'item' when count is 1", () => {
    mockGetWatchlistCount.mockReturnValue(1);
    mockGetSeriesWatchlistCount.mockReturnValue(0);
    render(<WatchlistPopover onClose={onClose} />);
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });
});
