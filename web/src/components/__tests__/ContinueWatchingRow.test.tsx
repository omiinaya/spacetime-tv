/**
 * Tests for ContinueWatchingRow — the home-page in-progress series row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import type { SeriesProgress } from "@/lib/continueWatching";

const KEY = "stv_continue_watching";

function seed(items: SeriesProgress[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

const inProgressItem: SeriesProgress = {
  seriesId: 42,
  seriesName: "Breaking Bad",
  seasonNumber: 1,
  episodeNum: 3,
  episodeId: "9001",
  episodeTitle: "…And the Bag's in the River",
  progressSeconds: 1200,
  durationSeconds: 3600,
  cover: "",
  updatedAt: Date.now(),
};

const finishedItem: SeriesProgress = {
  ...inProgressItem,
  episodeId: 9002,
  episodeTitle: "Finished Ep",
  progressSeconds: 3500,
  durationSeconds: 3600, // > 90% — filtered out
};

describe("ContinueWatchingRow", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("renders nothing when no items exist", () => {
    const { container } = render(<ContinueWatchingRow navigate={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when all items are >90% complete", () => {
    seed([finishedItem]);
    const { container } = render(<ContinueWatchingRow navigate={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows in-progress series with progress time", () => {
    seed([inProgressItem]);
    render(<ContinueWatchingRow navigate={vi.fn()} />);
    expect(screen.getByText("Continue Watching")).toBeTruthy();
    expect(screen.getByText("Breaking Bad")).toBeTruthy();
    expect(screen.getByText(/S1E3/)).toBeTruthy();
    expect(screen.getByText(/20:00 remaining/)).toBeTruthy();
  });

  it("navigates to the watch page on click", () => {
    seed([inProgressItem]);
    const navigate = vi.fn();
    render(<ContinueWatchingRow navigate={navigate} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Continue Breaking Bad/ }),
    );
    expect(navigate).toHaveBeenCalledWith("/watch/series/42/9001");
  });

  it("removes an item via the dismiss button", () => {
    seed([inProgressItem]);
    render(<ContinueWatchingRow navigate={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Remove from continue watching"));
    // The row re-renders without the dismissed item -> empty container
    expect(screen.queryByText("Breaking Bad")).toBeNull();
  });

  it("enriches item with sessionStorage metadata", () => {
    seed([{ ...inProgressItem, seriesName: "", cover: "" }]);
    sessionStorage.setItem(
      "stv_series_meta_42",
      JSON.stringify({ name: "Cached Name", cover: "/covers/x.jpg" }),
    );
    render(<ContinueWatchingRow navigate={vi.fn()} />);
    expect(screen.getByText("Cached Name")).toBeTruthy();
  });

  it("falls back to Series {id} when no name is available", () => {
    seed([{ ...inProgressItem, seriesName: "" }]);
    render(<ContinueWatchingRow navigate={vi.fn()} />);
    expect(screen.getByText("Series 42")).toBeTruthy();
  });
});
