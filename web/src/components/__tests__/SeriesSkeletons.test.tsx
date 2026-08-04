/**
 * Tests for the series-page skeleton components.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import SeriesRowSkeleton from "@/components/SeriesRowSkeleton";
import SeriesPageSkeleton from "@/components/SeriesPageSkeleton";

describe("SeriesRowSkeleton", () => {
  it("renders a title bar and 7 poster placeholders", () => {
    const { container } = render(<SeriesRowSkeleton />);
    // 7 poster columns + 1 title skeleton line
    expect(
      container.querySelectorAll(".bg-muted").length,
    ).toBeGreaterThanOrEqual(8);
  });
});

describe("SeriesPageSkeleton", () => {
  it("renders a header block and 4 rows of posters", () => {
    const { container } = render(<SeriesPageSkeleton />);
    // 4 rows × 7 posters + header line skeletons
    expect(
      container.querySelectorAll(".bg-muted").length,
    ).toBeGreaterThanOrEqual(28);
  });

  it("renders a page-level container", () => {
    const { container } = render(<SeriesPageSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });
});
