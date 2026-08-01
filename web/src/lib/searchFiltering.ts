import type {
  LiveStream,
  Movie,
  Series,
  TmdbEnrichData,
  SearchResults,
  FilterTab,
  SortBy,
} from "@/lib/types";

/**
 * Pure search-result filtering/sorting helpers.
 *
 * Extracted from useSearchPage so the filter/sort pipeline is unit-testable
 * without React state. All functions are side-effect free.
 */

const sortByName = (a: { name?: string }, b: { name?: string }) => {
  return (a.name || "").localeCompare(b.name || "");
};

function getSortValue(
  item: Movie | Series | LiveStream,
  section: "movies" | "series",
  sortBy: SortBy,
  enrichData: Record<string, TmdbEnrichData> | null,
): number {
  if (sortBy === "rating") {
    const id =
      section === "movies"
        ? (item as Movie).stream_id
        : (item as Series).series_id;
    const enr = enrichData?.[String(id)];
    if (enr?.rating != null) return -enr.rating;
    const rb = (item as Movie).rating_5based ?? 0;
    return -rb;
  }
  return 0;
}

/**
 * Apply the active filter tab + sort to raw search results.
 * Returns a new SearchResults object (never mutates the input).
 */
export function filterAndSortResults(
  results: SearchResults,
  filter: FilterTab,
  sortBy: SortBy,
  enrichData: Record<string, TmdbEnrichData> | null,
): SearchResults {
  let filtered: SearchResults;
  switch (filter) {
    case "live":
      filtered = { ...results, movies: [], series: [] };
      break;
    case "movies":
      filtered = { ...results, live: [], series: [] };
      break;
    case "series":
      filtered = { ...results, live: [], movies: [] };
      break;
    default:
      filtered = { ...results };
  }

  if (sortBy === "name") {
    filtered = {
      live: [...filtered.live].sort(sortByName),
      movies: [...filtered.movies].sort(sortByName),
      series: [...filtered.series].sort(sortByName),
    };
  } else if (sortBy === "rating") {
    filtered = {
      live: filtered.live,
      movies: [...filtered.movies].sort(
        (a, b) =>
          getSortValue(a, "movies", sortBy, enrichData) -
          getSortValue(b, "movies", sortBy, enrichData),
      ),
      series: [...filtered.series].sort(
        (a, b) =>
          getSortValue(a, "series", sortBy, enrichData) -
          getSortValue(b, "series", sortBy, enrichData),
      ),
    };
  }

  return filtered;
}

export function countResults(results: SearchResults | null): number {
  return results
    ? results.live.length + results.movies.length + results.series.length
    : 0;
}
