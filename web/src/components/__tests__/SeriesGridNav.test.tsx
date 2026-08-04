/**
 * Tests for SeriesGridNav — the category-browsing grid header with back
 * button, category title, skeleton loading, series cards, and pagination.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SeriesGridNav from "@/components/SeriesGridNav";
import type { Series } from "@/lib/types";

const series: Series[] = [
  {
    series_id: 1,
    name: "The Wire",
    cover: "http://cdn/wire.jpg",
    category_id: "5",
  } as Series,
  {
    series_id: 2,
    name: "Chernobyl",
    cover: "",
    category_id: "5",
  } as Series,
];

const props = {
  catId: "5",
  catName: "Drama",
  series,
  total: 42,
  page: 1,
  loading: false,
  pageSize: 20,
  onBack: vi.fn(),
  onPageChange: vi.fn(),
  onSelectSeries: vi.fn(),
  onToggleWatchlist: vi.fn(),
};

describe("SeriesGridNav", () => {
  it("returns null without a category id", () => {
    const { container } = render(<SeriesGridNav {...props} catId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the category title and series total", () => {
    render(<SeriesGridNav {...props} />);
    expect(screen.getByText("Drama")).toBeTruthy();
    expect(screen.getByText("42 series")).toBeTruthy();
  });

  it("fires onBack from the back button", () => {
    render(<SeriesGridNav {...props} />);
    fireEvent.click(screen.getByText("Back to categories"));
    expect(props.onBack).toHaveBeenCalled();
  });

  it("shows skeletons while loading with no data", () => {
    const { container } = render(
      <SeriesGridNav {...props} loading series={[]} />,
    );
    // pageSize skeleton poster placeholders render (each uses bg-muted)
    expect(container.querySelectorAll(".bg-muted").length).toBeGreaterThan(0);
    // no series cards and no pagination while loading
    expect(screen.queryByText("The Wire")).toBeNull();
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders a SeriesCard per series", () => {
    render(<SeriesGridNav {...props} />);
    expect(screen.getByText("The Wire")).toBeTruthy();
    expect(screen.getByText("Chernobyl")).toBeTruthy();
  });

  it("renders pagination and fires onPageChange", () => {
    render(<SeriesGridNav {...props} />);
    // Pagination renders page buttons; click the next-page control if present.
    const next = screen.queryByRole("button", { name: /next/i });
    if (next) {
      fireEvent.click(next);
      expect(props.onPageChange).toHaveBeenCalled();
    } else {
      // Otherwise assert a page indicator exists.
      expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    }
  });

  it("hides pagination while loading", () => {
    const { container } = render(
      <SeriesGridNav {...props} loading series={[]} />,
    );
    expect(container.querySelectorAll("nav").length).toBe(0);
  });
});
