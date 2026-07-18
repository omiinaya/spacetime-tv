import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router";
import { Search, AlertCircle } from "lucide-react";
import {
  api,
  type LiveStream,
  type Movie,
  type Series,
  type TmdbEnrichData,
  type GuideSearchResult,
} from "@/lib/api";
import { addSearchHistory } from "@/components/SearchHistory";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import SearchHeader from "@/components/SearchHeader";
import SearchFilterBar from "@/components/SearchFilterBar";
import LiveSearchResults from "@/components/LiveSearchResults";
import MovieSearchResults from "@/components/MovieSearchResults";
import SeriesSearchResults from "@/components/SeriesSearchResults";
import EpgSearchResults from "@/components/EpgSearchResults";

type FilterTab = "all" | "live" | "movies" | "series" | "epg";
type SortBy = "relevance" | "name" | "rating";

interface SearchResults {
  live: LiveStream[];
  movies: Movie[];
  series: Series[];
}

interface SearchTotals {
  live: number;
  movies: number;
  series: number;
}

interface SearchResultsWithTotals extends SearchResults {
  totals?: SearchTotals;
}

type LoadingSection = "live" | "movies" | "series" | null;

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(urlQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [enrichData, setEnrichData] = useState<Record<
    string,
    TmdbEnrichData
  > | null>(null);
  const [epgResults, setEpgResults] = useState<GuideSearchResult[] | null>(
    null,
  );
  const [epgLoading, setEpgLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");

  // ── Pagination state ──────────────────────────────────
  const [totals, setTotals] = useState<SearchTotals | null>(null);
  const [loadingMore, setLoadingMore] = useState<LoadingSection>(null);

  // ── Request cancellation ──────────────────────────────────────
  const searchIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const cancelPending = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelPending(), [cancelPending]);

  // ── Session-level search cache ─────────────────────────────────
  const SEARCH_CACHE_PREFIX = "stv_search_";
  const SEARCH_CACHE_TTL = 120000;

  const getCached = (q: string): SearchResultsWithTotals | null => {
    try {
      const raw = sessionStorage.getItem(SEARCH_CACHE_PREFIX + q);
      if (!raw) return null;
      const { results, ts } = JSON.parse(raw);
      if (Date.now() - ts < SEARCH_CACHE_TTL) return results;
      sessionStorage.removeItem(SEARCH_CACHE_PREFIX + q);
    } catch {} // DOMException: storage quota or disabled
    return null;
  };
  const setCached = (q: string, r: SearchResultsWithTotals) => {
    try {
      sessionStorage.setItem(
        SEARCH_CACHE_PREFIX + q,
        JSON.stringify({ results: r, ts: Date.now() }),
      );
    } catch {} // DOMException: storage quota or disabled
  };

  // ── Single unified search pipeline ────────────────────────────
  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResults(null);
        setTotals(null);
        setError(null);
        setLoading(false);
        return;
      }

      cancelPending();

      const myId = ++searchIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const r = await api.search(trimmed, controller.signal);
        if (searchIdRef.current === myId && !controller.signal.aborted) {
          setCached(trimmed, r);
          setResults(r);
          setTotals(r.totals ?? null);
          setLoading(false);
        }
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name === "AbortError") return;
        if (searchIdRef.current === myId) {
          setError(err.message || "Search failed");
          setLoading(false);
        }
      }
    },
    [cancelPending],
  );

  // ── EPG search ────────────────────────────────────────────────
  const runEpgSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setEpgResults(null);
      return;
    }
    setEpgLoading(true);
    try {
      const r = await api.guide.search(trimmed);
      setEpgResults(r.results ?? []);
    } catch {
      // SyntaxError or network error — EPG search is non-critical
      setEpgResults([]);
    } finally {
      setEpgLoading(false);
    }
  }, []);

  // ── Load more results for a specific section ────────────────
  const loadMore = useCallback(
    async (section: "live" | "movies" | "series") => {
      if (!results || loadingMore) return;
      const trimmed = query.trim();
      if (trimmed.length < 2) return;

      setLoadingMore(section);

      try {
        const offset = results[section].length;
        const r = await api.search(trimmed, undefined, 20, offset, section);
        if (r && r[section]) {
          setResults((prev) => {
            if (!prev) return prev;
            const existingIds = new Set(
              prev[section].map(
                (item: { stream_id?: number; series_id?: number }) =>
                  item.stream_id ?? item.series_id,
              ),
            );
            const newItems = r[section].filter(
              (item: { stream_id?: number; series_id?: number }) =>
                !existingIds.has(item.stream_id ?? item.series_id),
            );
            const merged: SearchResults = {
              live: prev.live,
              movies: prev.movies,
              series: prev.series,
            };
            if (section === "live") {
              merged.live = [...prev.live, ...(newItems as LiveStream[])];
            } else if (section === "movies") {
              merged.movies = [...prev.movies, ...(newItems as Movie[])];
            } else if (section === "series") {
              merged.series = [...prev.series, ...(newItems as Series[])];
            }
            return merged;
          });
          setTotals(r.totals ?? null);
        }
      } catch {
        // SyntaxError or network error — silently ignore, non-critical
      } finally {
        setLoadingMore(null);
      }
    },
    [results, query, loadingMore],
  );

  // ── Auto-search from URL (Back navigation / direct link) ──────
  const bgRefreshRef = useRef(false);

  useEffect(() => {
    if (!urlQuery || urlQuery.trim().length < 2) return;
    const trimmed = urlQuery.trim();
    setQuery(trimmed);

    const cached = getCached(trimmed);
    if (cached) {
      setResults(cached);
      setTotals(cached.totals ?? null);
      setLoading(false);
      setError(null);
      if (!bgRefreshRef.current) {
        bgRefreshRef.current = true;
        runSearch(trimmed).finally(() => {
          bgRefreshRef.current = false;
        });
      }
      runEpgSearch(trimmed);
    } else {
      runSearch(trimmed);
      runEpgSearch(trimmed);
    }
  }, [urlQuery, runSearch, runEpgSearch]);

  // ── TMDB enrichment of search results ──────────────────────────
  useEffect(() => {
    if (!results) {
      setEnrichData(null);
      return;
    }
    const movies = results.movies
      .filter((m) => m.tmdb)
      .map((m) => ({ stream_id: m.stream_id, tmdb_id: m.tmdb! }));
    const series = results.series
      .filter((s) => s.tmdb)
      .map((s) => ({ series_id: s.series_id, tmdb_id: s.tmdb }));
    if (movies.length === 0 && series.length === 0) {
      setEnrichData({});
      return;
    }
    api
      .searchEnrich(movies, series)
      .then((data) => {
        setEnrichData({ ...data.movies, ...data.series });
      })
      .catch(() => {});
  }, [results]);

  // ── Debounced auto-search as user types ───────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length >= 2) {
        debounceRef.current = setTimeout(() => {
          setSearchParams({ q: value }, { replace: true });
          runSearch(value);
        }, 300);
      } else {
        setSearchParams({}, { replace: true });
        cancelPending();
        setResults(null);
        setTotals(null);
        setError(null);
        setLoading(false);
      }
    },
    [setSearchParams, runSearch, cancelPending],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Manual search (Enter key / button click) ──────────────────
  const doSearch = useCallback(() => {
    if (query.trim().length < 2) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    addSearchHistory(query);
    setShowHistory(false);
    setSearchParams({ q: query }, { replace: true });
    runSearch(query);
    runEpgSearch(query);
  }, [query, setSearchParams, runSearch, runEpgSearch]);

  // ── Derived ───────────────────────────────────────────────────
  const total = results
    ? results.live.length + results.movies.length + results.series.length
    : 0;
  const liveCount = results?.live.length ?? 0;
  const movieCount = results?.movies.length ?? 0;
  const seriesCount = results?.series.length ?? 0;

  // ── Sort helper ────────────────────────────────────────────────
  const getSortValue = useCallback(
    (
      item: Movie | Series | LiveStream,
      section: "movies" | "series",
    ): number => {
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
    },
    [sortBy, enrichData],
  );

  const sortByName = useCallback(
    (a: { name?: string }, b: { name?: string }) => {
      return (a.name || "").localeCompare(b.name || "");
    },
    [],
  );

  const filteredResults = useMemo(() => {
    if (!results) return null;
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
          (a, b) => getSortValue(a, "movies") - getSortValue(b, "movies"),
        ),
        series: [...filtered.series].sort(
          (a, b) => getSortValue(a, "series") - getSortValue(b, "series"),
        ),
      };
    }

    return filtered;
  }, [results, filter, sortBy, sortByName, getSortValue]);

  const filteredTotal = filteredResults
    ? filteredResults.live.length +
      filteredResults.movies.length +
      filteredResults.series.length
    : 0;

  // ── Now-playing EPG for live search results ──────────────────
  const nowPlayingStreamIds = useMemo(() => {
    return (results?.live ?? []).slice(0, 200).map((s) => s.stream_id);
  }, [results?.live]);
  const { getNowPlaying } = useNowPlaying(nowPlayingStreamIds);

  // ── Handlers for child components ──────────────────────────────
  const handleClear = useCallback(() => {
    setQuery("");
    setResults(null);
    setTotals(null);
    setError(null);
    cancelPending();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setSearchParams({}, { replace: true });
  }, [setSearchParams, cancelPending]);

  const handleHistorySelect = useCallback(
    (q: string) => {
      setQuery(q);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      addSearchHistory(q);
      setSearchParams({ q }, { replace: true });
      runSearch(q);
    },
    [setSearchParams, runSearch],
  );

  return (
    <div className="space-y-6">
      <SearchHeader
        query={query}
        loading={loading}
        showHistory={showHistory}
        onQueryChange={handleQueryChange}
        onSearch={doSearch}
        onClear={handleClear}
        onFocus={() => {
          if (!query) setShowHistory(true);
        }}
        onHistorySelect={handleHistorySelect}
        onHistoryClose={() => setShowHistory(false)}
        resultCount={filteredTotal > 0 ? filteredTotal : undefined}
        totalCount={total > 0 ? total : undefined}
        activeFilter={filter !== "all" ? filter : undefined}
      />

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {results && (
        <SearchFilterBar
          filter={filter}
          sortBy={sortBy}
          onFilterChange={setFilter}
          onSortChange={setSortBy}
          total={total}
          liveCount={liveCount}
          movieCount={movieCount}
          seriesCount={seriesCount}
          epgCount={epgResults?.length ?? 0}
        />
      )}

      {filter === "epg" ? (
        <EpgSearchResults
          results={epgResults}
          loading={epgLoading}
          query={query}
        />
      ) : (
        filteredResults && (
          <div className="space-y-8">
            <LiveSearchResults
              streams={filteredResults.live}
              totalCount={totals?.live ?? 0}
              loadingMore={loadingMore === "live"}
              onLoadMore={() => loadMore("live")}
              showLoadMore={filter === "all" || filter === "live"}
              getNowPlaying={getNowPlaying}
            />

            <MovieSearchResults
              movies={filteredResults.movies}
              enrichData={enrichData}
              totalCount={totals?.movies ?? 0}
              loadingMore={loadingMore === "movies"}
              onLoadMore={() => loadMore("movies")}
              showLoadMore={filter === "all" || filter === "movies"}
            />

            <SeriesSearchResults
              series={filteredResults.series}
              enrichData={enrichData}
              totalCount={totals?.series ?? 0}
              loadingMore={loadingMore === "series"}
              onLoadMore={() => loadMore("series")}
              showLoadMore={filter === "all" || filter === "series"}
            />

            {total > 0 && filteredTotal === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No results for &quot;{query}&quot; in this category
                </p>
              </div>
            )}
          </div>
        )
      )}

      {/* Empty state */}
      {!results && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            Search across all live TV channels, movies, and series
          </p>
        </div>
      )}
    </div>
  );
}
