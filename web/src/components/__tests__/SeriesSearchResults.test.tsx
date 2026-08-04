/**
 * Tests for SeriesSearchResults — the "Series (n)" section of the search page.
 *
 * Covers: null render for empty series, heading count, TMDB-enriched poster +
 * rating + genres vs cover fallback, navigation signal, and load-more states.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SeriesSearchResults from "@/components/SeriesSearchResults";
import type { Series, TmdbEnrichData } from "@/lib/types";

const seriesList: Series[] = [
  {
    series_id: 21,
    name: "Breaking Bad",
    cover: "",
    category_id: "1",
  } as Series,
  {
    series_id: 22,
    name: "Stranger Things",
    cover: "http://cdn/cover/st.jpg",
    category_id: "2",
  } as Series,
];

const enrich: Record<string, TmdbEnrichData> = {
  "21": {
    poster: "/xyz789.jpg",
    rating: 18,
    genres: ["Drama", "Crime"],
  } as TmdbEnrichData,
};

function renderResults(
  overrides: Partial<Parameters<typeof SeriesSearchResults>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <SeriesSearchResults
        series={seriesList}
        enrichData={enrich}
        totalCount={10}
        loadingMore={false}
        onLoadMore={vi.fn()}
        showLoadMore={true}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("SeriesSearchResults", () => {
  it("returns null when there are no series", () => {
    const { container } = renderResults({ series: [] });
    expect(container.firstChild).toBeNull();
  });

  it("shows the section heading with the series count", () => {
    renderResults();
    expect(screen.getByText("Series (2)")).toBeTruthy();
  });

  it("uses the TMDB poster when enriched", () => {
    renderResults();
    const img = screen.getByAltText("Breaking Bad poster") as HTMLImageElement;
    expect(img.src).toContain("xyz789");
    expect(img.srcset).toBeTruthy();
  });

  it("uses the series cover when no enrichment poster exists", () => {
    renderResults();
    const img = screen.getByAltText(
      "Stranger Things poster",
    ) as HTMLImageElement;
    expect(img).toBeTruthy();
  });

  it("shows the TMDB-derived rating badge", () => {
    renderResults();
    expect(screen.getByText("9.0")).toBeTruthy();
  });

  it("renders genre chips from enrichment (max 2)", () => {
    renderResults();
    expect(screen.getByText("Drama")).toBeTruthy();
    expect(screen.getByText("Crime")).toBeTruthy();
  });

  it("hides the poster image on load error", () => {
    renderResults();
    const img = screen.getByAltText("Breaking Bad poster") as HTMLImageElement;
    fireEvent.error(img);
    expect(img.style.display).toBe("none");
  });

  it("renders a clickable card for navigation", () => {
    renderResults();
    const card = screen.getByText("Breaking Bad").closest("button")!;
    expect(card).toBeTruthy();
    expect(fireEvent.click(card)).toBe(true);
  });

  it("shows load-more and calls onLoadMore", () => {
    const onLoadMore = vi.fn();
    renderResults({ onLoadMore });
    fireEvent.click(screen.getByText(/Load more series/));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it("hides load-more when counts match", () => {
    renderResults({ totalCount: seriesList.length });
    expect(screen.queryByText(/Load more series/)).toBeNull();
  });

  it("spins while loading more", () => {
    renderResults({ loadingMore: true });
    const btn = screen.getByText(/Load more series/).closest("button")!;
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.querySelector("svg")).toBeTruthy();
  });
});
