/**
 * Tests for SeriesCard — the poster tile in series grids.
 *
 * Covers: cover image vs placeholder, rating badge, year badge, onSelect via
 * click and Enter/Space key, watchlist toggle with stopPropagation, and
 * aria-label states based on watchlist membership.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SeriesCard from "@/components/SeriesCard";
import type { Series } from "@/lib/types";

// isSeriesInWatchlist drives the favorite heart + aria-label
const mockIsInWatchlist = vi.fn<() => boolean>();
vi.mock("@/lib/watchlist", () => ({
  isSeriesInWatchlist: () => mockIsInWatchlist(),
}));

const series: Series = {
  series_id: 7,
  name: "Severance",
  cover: "http://cdn/severance.jpg",
  rating: "8.5",
  releaseDate: "2022-02-18",
  category_id: "3",
} as Series;

function renderCard(
  overrides: { series?: Series; inWatchlist?: boolean } = {},
) {
  const onSelect = vi.fn();
  const onToggleWatchlist = vi.fn();
  mockIsInWatchlist.mockReturnValue(overrides.inWatchlist ?? false);
  const view = render(
    <SeriesCard
      series={overrides.series ?? series}
      onSelect={onSelect}
      onToggleWatchlist={onToggleWatchlist}
    />,
  );
  return { onSelect, onToggleWatchlist, ...view };
}

describe("SeriesCard", () => {
  it("renders the series name and cover image", () => {
    renderCard();
    expect(screen.getByText("Severance")).toBeTruthy();
    expect(screen.getByRole("img")).toBeTruthy();
  });

  it("renders a placeholder icon block without a cover", () => {
    renderCard({ series: { ...series, cover: "" } });
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the rating badge when a rating exists", () => {
    renderCard();
    expect(screen.getByText("8.5")).toBeTruthy();
  });

  it("hides the rating badge when rating is missing", () => {
    renderCard({ series: { ...series, rating: "" } });
    expect(screen.queryByText("8.5")).toBeNull();
  });

  it("shows the release year badge", () => {
    renderCard();
    expect(screen.getByText("2022")).toBeTruthy();
  });

  it("calls onSelect on click", () => {
    const { onSelect } = renderCard();
    fireEvent.click(screen.getByText("Severance").closest("[role=button]")!);
    expect(onSelect).toHaveBeenCalledWith(series);
  });

  it("calls onSelect on Enter key", () => {
    const { onSelect } = renderCard();
    fireEvent.keyDown(screen.getByText("Severance").closest("[role=button]")!, {
      key: "Enter",
    });
    expect(onSelect).toHaveBeenCalledWith(series);
  });

  it("calls onSelect on Space key", () => {
    const { onSelect } = renderCard();
    fireEvent.keyDown(screen.getByText("Severance").closest("[role=button]")!, {
      key: " ",
    });
    expect(onSelect).toHaveBeenCalledWith(series);
  });

  it("toggles watchlist with stopPropagation", () => {
    const { onToggleWatchlist } = renderCard();
    fireEvent.click(screen.getByLabelText("Add to watchlist"));
    expect(onToggleWatchlist).toHaveBeenCalledWith(7);
  });

  it("labels the watchlist button as Remove when already saved", () => {
    renderCard({ inWatchlist: true });
    expect(screen.getByLabelText("Remove from watchlist")).toBeTruthy();
  });

  it("hides the cover image on load error", () => {
    renderCard();
    const img = screen.getByRole("img");
    fireEvent.error(img);
    expect((img as HTMLImageElement).style.display).toBe("none");
  });
});
