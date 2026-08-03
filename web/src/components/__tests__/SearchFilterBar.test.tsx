/**
 * Tests for SeriesEmptyStates + SearchFilterBar — search/series UI states
 * and the filter/sort control bar.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  SeriesEmptySearchState,
  SeriesFilterEmptyState,
} from "@/components/SeriesEmptyStates";
import SearchFilterBar from "@/components/SearchFilterBar";

describe("SeriesEmptySearchState", () => {
  it("shows the query and a clear button", () => {
    const onClear = vi.fn();
    render(<SeriesEmptySearchState query="matrix" onClear={onClear} />);
    expect(screen.getByText(/No series matching/)).toBeTruthy();
    fireEvent.click(screen.getByText("Clear search"));
    expect(onClear).toHaveBeenCalled();
  });
});

describe("SeriesFilterEmptyState", () => {
  it("shows the filter-empty message", () => {
    render(<SeriesFilterEmptyState />);
    expect(screen.getByText(/No categories match your filters/)).toBeTruthy();
    expect(
      screen.getByText(/Adjust your language or service settings/),
    ).toBeTruthy();
  });
});

describe("SearchFilterBar", () => {
  const base = {
    filter: "all" as const,
    sortBy: "relevance" as const,
    onFilterChange: vi.fn(),
    onSortChange: vi.fn(),
    total: 100,
    liveCount: 20,
    movieCount: 30,
    seriesCount: 40,
    epgCount: 10,
  };

  it("renders all filter tabs with counts", () => {
    render(<SearchFilterBar {...base} />);
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("Movies")).toBeTruthy();
    expect(screen.getByText("Series")).toBeTruthy();
    expect(screen.getByText("EPG")).toBeTruthy();
  });

  it("marks the active filter with aria-pressed", () => {
    render(<SearchFilterBar {...base} filter="movies" />);
    expect(screen.getByText("Movies").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByText("All").getAttribute("aria-pressed")).toBe("false");
  });

  it("fires onFilterChange on tab click", () => {
    const onFilterChange = vi.fn();
    render(<SearchFilterBar {...base} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText("Series"));
    expect(onFilterChange).toHaveBeenCalledWith("series");
  });

  it("renders all sort options and fires onSortChange", () => {
    const onSortChange = vi.fn();
    render(<SearchFilterBar {...base} onSortChange={onSortChange} />);
    expect(screen.getByText("Relevance")).toBeTruthy();
    expect(screen.getByText("Name A–Z")).toBeTruthy();
    fireEvent.click(screen.getByText("Rating"));
    expect(onSortChange).toHaveBeenCalledWith("rating");
  });
});
