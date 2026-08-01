import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router";
import { api } from "@/lib/api";
import type {
  LiveStream,
  Movie,
  Series,
  TmdbEnrichData,
  GuideSearchResult,
  SearchResults,
  SearchTotals,
  FilterTab,
  SortBy,
} from "@/lib/types";
import { addSearchHistory } from "@/components/SearchHistory";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { filterAndSortResults, countResults } from "@/lib/searchFiltering";

type LoadingSection = "live" | "movies" | "series" | null;

interface UseSearchPageReturn {
  query: string;
  loading: boolean;
  error: string | null;
  results: SearchResults | null;
  totals: SearchTotals | null;
  enrichData: Record<string, TmdbEnrichData> | null;
  epgResults: GuideSearchResult[] | null;
  epgLoading: boolean;
  showHistory: boolean;
  filter: FilterTab;
  sortBy: SortBy;
  loadingMore: LoadingSection;
  total: number;
  liveCount: number;
  movieCount: number;
  seriesCount: number;
  filteredResults: SearchResults | null;
  filteredTotal: number;
  getNowPlaying: (streamId: number) => string | null;
  handleQueryChange: (value: string) => void;
  doSearch: () => void;
  doClear: () => void;
  handleHistorySelect: (q: string) => void;
  setShowHistory: (v: boolean) => void;
  setFilter: (v: FilterTab) => void;
  setSortBy: (v: SortBy) => void;
  loadMore: (section: "live" | "movies" | "series") => Promise<void>;
}

const SEARCH_CACHE_PREFIX = "stv_search_";
const SEARCH_CACHE_TTL = 120000;

function getCached(q: string): SearchResults | null {
  try {
    const raw = sessionStorage.getItem(SEARCH_CACHE_PREFIX + q);
    if (!raw) return null;
    const { results, ts } = JSON.parse(raw);
    if (Date.now() - ts < SEARCH_CACHE_TTL) return results;
    sessionStorage.removeItem(SEARCH_CACHE_PREFIX + q);
  } catch {
    /* DOMException: storage quota or disabled */
  }
  return null;
}

function setCached(q: string, r: SearchResults) {
  try {
    sessionStorage.setItem(
      SEARCH_CACHE_PREFIX + q,
      JSON.stringify({ results: r, ts: Date.now() }),
    );
  } catch {
    /* DOMException: storage quota or disabled */
  }
}

export default function useSearchPage(): UseSearchPageReturn {
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
  const [totals, setTotals] = useState<SearchTotals | null>(null);
  const [loadingMore, setLoadingMore] = useState<LoadingSection>(null);

  const searchIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgRefreshRef = useRef(false);

  const cancelPending = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelPending(), [cancelPending]);

  // ── Single unified search pipeline ──
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

  // ── EPG search ──
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
      setEpgResults([]);
    } finally {
      setEpgLoading(false);
    }
  }, []);

  // ── Load more ──
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
        // silently ignore — non-critical
      } finally {
        setLoadingMore(null);
      }
    },
    [results, query, loadingMore],
  );

  // ── Debounced auto-search ──
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

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Manual search ──
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

  // ── Auto-search from URL ──
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

  // ── TMDB enrichment ──
  useEffect(() => {
    if (!results) {
      setEnrichData(null);
      return;
    }
    const movies = results.movies
      .filter((m) => m.tmdb)
      .map((m) => ({ stream_id: m.stream_id, tmdb_id: m.tmdb! }));
    const seriesResults = results.series
      .filter((s) => s.tmdb)
      .map((s) => ({ series_id: s.series_id, tmdb_id: s.tmdb }));
    if (movies.length === 0 && seriesResults.length === 0) {
      setEnrichData({});
      return;
    }
    api
      .searchEnrich(movies, seriesResults)
      .then((data) => {
        setEnrichData({ ...data.movies, ...data.series });
      })
      .catch(() => {});
  }, [results]);

  // ── Clear ──
  const doClear = useCallback(() => {
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

  // ── History select ──
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

  // ── Derived ──
  const total = countResults(results);
  const liveCount = results?.live.length ?? 0;
  const movieCount = results?.movies.length ?? 0;
  const seriesCount = results?.series.length ?? 0;

  const filteredResults = useMemo(
    () =>
      results
        ? filterAndSortResults(results, filter, sortBy, enrichData)
        : null,
    [results, filter, sortBy, enrichData],
  );

  const filteredTotal = countResults(filteredResults);

  // ── Now-playing EPG ──
  const nowPlayingStreamIds = useMemo(() => {
    return (results?.live ?? []).slice(0, 200).map((s) => s.stream_id);
  }, [results?.live]);
  const { getNowPlaying } = useNowPlaying(nowPlayingStreamIds);

  return {
    query,
    loading,
    error,
    results,
    totals,
    enrichData,
    epgResults,
    epgLoading,
    showHistory,
    filter,
    sortBy,
    loadingMore,
    total,
    liveCount,
    movieCount,
    seriesCount,
    filteredResults,
    filteredTotal,
    getNowPlaying: getNowPlaying as (streamId: number) => string | null,
    handleQueryChange,
    doSearch,
    doClear,
    handleHistorySelect,
    setShowHistory,
    setFilter,
    setSortBy,
    loadMore,
  };
}
