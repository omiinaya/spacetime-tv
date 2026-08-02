import { describe, it, expect } from "vitest";
import { filterAndSortResults, countResults } from "@/lib/searchFiltering";
import type { SearchResults, TmdbEnrichData } from "@/lib/types";

function makeResults(overrides?: Partial<SearchResults>): SearchResults {
  return {
    live: [
      { stream_id: 1, name: "Alpha News", stream_icon: "", category_id: "1" },
      { stream_id: 2, name: "Bravo TV", stream_icon: "", category_id: "1" },
    ],
    movies: [
      { stream_id: 10, name: "Zebra Movie", rating_5based: 2 },
      { stream_id: 11, name: "Apple Movie", rating_5based: 4 },
    ],
    series: [
      { series_id: 20, name: "Mango Show", rating_5based: 3 },
      { series_id: 21, name: "Banana Show", rating_5based: 5 },
    ],
    ...overrides,
  };
}

describe("countResults", () => {
  it("returns 0 for null", () => {
    expect(countResults(null)).toBe(0);
  });

  it("sums all three sections", () => {
    expect(countResults(makeResults())).toBe(6);
  });
});

describe("filterAndSortResults — filter tab", () => {
  const r = makeResults();

  it("keeps everything on 'all'", () => {
    const out = filterAndSortResults(r, "all", "relevance", null);
    expect(out.live.length).toBe(2);
    expect(out.movies.length).toBe(2);
    expect(out.series.length).toBe(2);
  });

  it("keeps only live on 'live'", () => {
    const out = filterAndSortResults(r, "live", "relevance", null);
    expect(out.live.length).toBe(2);
    expect(out.movies).toHaveLength(0);
    expect(out.series).toHaveLength(0);
  });

  it("keeps only movies on 'movies'", () => {
    const out = filterAndSortResults(r, "movies", "relevance", null);
    expect(out.live).toHaveLength(0);
    expect(out.movies.length).toBe(2);
    expect(out.series).toHaveLength(0);
  });

  it("keeps only series on 'series'", () => {
    const out = filterAndSortResults(r, "series", "relevance", null);
    expect(out.live).toHaveLength(0);
    expect(out.movies).toHaveLength(0);
    expect(out.series.length).toBe(2);
  });

  it("does not mutate the input results", () => {
    const input = makeResults();
    filterAndSortResults(input, "movies", "name", null);
    expect(input.live.length).toBe(2);
    expect(input.movies.length).toBe(2);
  });
});

describe("filterAndSortResults — sort by name", () => {
  it("sorts all sections alphabetically", () => {
    const out = filterAndSortResults(makeResults(), "all", "name", null);
    expect(out.live.map((s) => s.name)).toEqual(["Alpha News", "Bravo TV"]);
    expect(out.movies.map((m) => m.name)).toEqual([
      "Apple Movie",
      "Zebra Movie",
    ]);
    expect(out.series.map((s) => s.name)).toEqual([
      "Banana Show",
      "Mango Show",
    ]);
  });
});

describe("filterAndSortResults — sort by rating", () => {
  it("sorts movies/series by rating_5based descending, leaves live untouched", () => {
    const out = filterAndSortResults(makeResults(), "all", "rating", null);
    expect(out.live.map((s) => s.name)).toEqual(["Alpha News", "Bravo TV"]);
    expect(out.movies.map((m) => m.name)).toEqual([
      "Apple Movie",
      "Zebra Movie",
    ]);
    expect(out.series.map((s) => s.name)).toEqual([
      "Banana Show",
      "Mango Show",
    ]);
  });

  it("prefers TMDB enrich rating when present", () => {
    const enrich: Record<string, TmdbEnrichData> = {
      "10": { rating: 1, poster: null, overview: null },
      "11": { rating: 9, poster: null, overview: null },
    };
    const out = filterAndSortResults(makeResults(), "all", "rating", enrich);
    // stream 11 has TMDB 9 → first; stream 10 has TMDB 1 → last
    expect(out.movies.map((m) => m.stream_id)).toEqual([11, 10]);
  });
});
