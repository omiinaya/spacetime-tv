import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Search,
  Loader2,
  Tv,
  Film,
  Tv2,
  Star,
  AlertCircle,
  ArrowUpDown,
  ArrowUpAZ,
  TrendingUp,
  ChevronDown,
  Radio,
} from "lucide-react";
import { api, LiveStream, Movie, Series, imageUrl, TmdbEnrichData, tmdbSrcset, tmdbImageUrl, GuideSearchResult } from "@/lib/api";
import { SearchHistory, addSearchHistory } from "@/components/SearchHistory";
import { useNowPlaying } from "@/hooks/useNowPlaying";

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

/** API search response includes totals alongside results. */
interface SearchResultsWithTotals extends SearchResults {
  totals?: SearchTotals;
}

type LoadingSection = "live" | "movies" | "series" | null;

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(urlQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [enrichData, setEnrichData] = useState<Record<string, TmdbEnrichData> | null>(null);
  const [epgResults, setEpgResults] = useState<GuideSearchResult[] | null>(null);
  const [epgLoading, setEpgLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");

  // ── Pagination state ──────────────────────────────────
  const [totals, setTotals] = useState<SearchTotals | null>(null);
  const [loadingMore, setLoadingMore] = useState<LoadingSection>(null);

  // Tab definitions for the filter bar

  // ── Request cancellation ──────────────────────────────────────
  // Each search gets a unique ID. When a new search starts, we abort
  // the previous request and increment the ID. Responses are ignored
  // unless their ID matches the latest.
  const searchIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const cancelPending = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  // Cancel on unmount
  useEffect(() => () => cancelPending(), [cancelPending]);

  // ── Session-level search cache ─────────────────────────────────
  // Saves results keyed by query so back navigation is instant.
  // Restores cached results first, then refreshes in background.
  const SEARCH_CACHE_PREFIX = "stv_search_";
  const SEARCH_CACHE_TTL = 120000; // 2 minutes

  const getCached = (q: string): SearchResultsWithTotals | null => {
    try {
      const raw = sessionStorage.getItem(SEARCH_CACHE_PREFIX + q);
      if (!raw) return null;
      const { results, ts } = JSON.parse(raw);
      if (Date.now() - ts < SEARCH_CACHE_TTL) return results;
      sessionStorage.removeItem(SEARCH_CACHE_PREFIX + q);
    } catch {}
    return null;
  };
  const setCached = (q: string, r: SearchResultsWithTotals) => {
    try {
      sessionStorage.setItem(SEARCH_CACHE_PREFIX + q, JSON.stringify({ results: r, ts: Date.now() }));
    } catch {}
  };

  // ── Single unified search pipeline ────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setTotals(null);
      setError(null);
      setLoading(false);
      return;
    }

    // Cancel any in-flight request
    cancelPending();

    // Bump generation — stale responses will be ignored
    const myId = ++searchIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const r = await api.search(trimmed, controller.signal);
      // Only apply results if this is still the latest search
      if (searchIdRef.current === myId && !controller.signal.aborted) {
        setCached(trimmed, r);  // cache for instant back-nav
        setResults(r);
        setTotals(r.totals ?? null);
        setLoading(false);
      }
    } catch (e: unknown) {
      // AbortError = cancelled by a newer search — ignore silently
      const err = e as Error;
      if (err.name === "AbortError") return;
      if (searchIdRef.current === myId) {
        setError(err.message || "Search failed");
        setLoading(false);
      }
    }
  }, [cancelPending]);

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
      setEpgResults([]);
    } finally {
      setEpgLoading(false);
    }
  }, []);

  // ── Load more results for a specific section ────────────────
  const loadMore = useCallback(async (section: "live" | "movies" | "series") => {
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
            prev[section].map((item: { stream_id?: number; series_id?: number }) => item.stream_id ?? item.series_id)
          );
          const newItems = r[section].filter(
            (item: { stream_id?: number; series_id?: number }) => !existingIds.has(item.stream_id ?? item.series_id)
          );
          // Build merged result with safe indexed access
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
      // Silently ignore — non-critical
    } finally {
      setLoadingMore(null);
    }
  }, [results, query, loadingMore]);

  // ── Auto-search from URL (Back navigation / direct link) ──────
  // Restore cached results instantly (no loading state), then refresh
  // in background so stale cache gets updated.
  const bgRefreshRef = useRef(false);

  useEffect(() => {
    if (!urlQuery || urlQuery.trim().length < 2) return;
    const trimmed = urlQuery.trim();
    setQuery(trimmed);

    const cached = getCached(trimmed);
    if (cached) {
      // Instant: show cached results (no spinner)
      setResults(cached);
      setTotals(cached.totals ?? null);
      setLoading(false);
      setError(null);
      // Background: refresh from API if not already refreshing
      if (!bgRefreshRef.current) {
        bgRefreshRef.current = true;
        runSearch(trimmed).finally(() => { bgRefreshRef.current = false; });
      }
      // Also trigger EPG search in background
      runEpgSearch(trimmed);
    } else {
      // No cache — full load with spinner
      runSearch(trimmed);
      runEpgSearch(trimmed);
    }
  }, [urlQuery, runSearch, runEpgSearch]);

  // ── TMDB enrichment of search results ──────────────────────────
  // After results arrive, call the batch enrich endpoint to get
  // TMDB genres, ratings, and poster paths for movies/series.
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
    api.searchEnrich(movies, series).then((data) => {
      setEnrichData({ ...data.movies, ...data.series });
    }).catch(() => {
      // Enrichment is non-critical — silently ignore failures
    });
  }, [results]);

  // ── Debounced auto-search as user types ───────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);

    // Debounce: wait 300ms after last keystroke before searching
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        setSearchParams({ q: value }, { replace: true });
        runSearch(value);
      }, 300);
    } else {
      // Short/empty query → clear results immediately
      setSearchParams({}, { replace: true });
      cancelPending();
      setResults(null);
      setTotals(null);
      setError(null);
      setLoading(false);
    }
  }, [setSearchParams, runSearch, cancelPending]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // ── Manual search (Enter key / button click) ──────────────────
  const doSearch = useCallback(() => {
    if (query.trim().length < 2) return;
    // Kill any pending debounce
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    addSearchHistory(query);
    setShowHistory(false);
    setSearchParams({ q: query }, { replace: true });
    runSearch(query);
    runEpgSearch(query);
  }, [query, setSearchParams, runSearch, runEpgSearch]);

  // ── Derived ───────────────────────────────────────────────────
  const total =
    results
      ? results.live.length + results.movies.length + results.series.length
      : 0;
  const liveCount = results?.live.length ?? 0;
  const movieCount = results?.movies.length ?? 0;
  const seriesCount = results?.series.length ?? 0;

  // ── Sort helper ────────────────────────────────────────────────
  const getSortValue = useCallback(
    (item: Movie | Series | LiveStream, section: "movies" | "series"): number => {
      if (sortBy === "rating") {
        // Try TMDB enrichment rating first, fall back to rating_5based
        const id = section === "movies"
          ? (item as Movie).stream_id
          : (item as Series).series_id;
        const enr = enrichData?.[String(id)];
        if (enr?.rating != null) return -enr.rating; // descending: higher = first
        // Fallback: rating_5based (0-5 scale, higher = first)
        const rb = (item as Movie).rating_5based ?? 0;
        return -rb;
      }
      return 0; // relevance: keep original order
    },
    [sortBy, enrichData],
  );

  const sortByName = useCallback((a: { name?: string }, b: { name?: string }) => {
    return (a.name || "").localeCompare(b.name || "");
  }, []);

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

    // Apply sorting
    if (sortBy === "name") {
      filtered = {
        live: [...filtered.live].sort(sortByName),
        movies: [...filtered.movies].sort(sortByName),
        series: [...filtered.series].sort(sortByName),
      };
    } else if (sortBy === "rating") {
      filtered = {
        live: filtered.live, // no rating for live
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

  const filteredTotal =
    filteredResults
      ? filteredResults.live.length + filteredResults.movies.length + filteredResults.series.length
      : 0;

  // ── Now-playing EPG for live search results ──────────────────
  const nowPlayingStreamIds = useMemo(() => {
    return (results?.live ?? []).slice(0, 200).map((s) => s.stream_id);
  }, [results?.live]);
  const { getNowPlaying } = useNowPlaying(nowPlayingStreamIds);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Search className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Search</h1>
          <p className="text-sm text-muted-foreground">
            {results
              ? `${filteredTotal.toLocaleString()} result${filteredTotal !== 1 ? "s" : ""} · ${total.toLocaleString()} total` +
                (filter !== "all" ? ` (${filter})` : "")
              : "Search across all live TV channels, movies, and series"}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          onFocus={() => { if (!query) setShowHistory(true); }}
          placeholder="Search channels, movies, series..."
          aria-label="Search"
          className="w-full h-10 pl-10 pr-20 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <SearchHistory
          show={showHistory}
          onClose={() => setShowHistory(false)}
          onSelect={(q) => {
            setQuery(q);
            if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
            addSearchHistory(q);
            setSearchParams({ q }, { replace: true });
            runSearch(q);
          }}
        />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResults(null);
                setTotals(null);
                setError(null);
                cancelPending();
                if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
                setSearchParams({}, { replace: true });
              }}
              className="px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
          <button
            onClick={doSearch}
            disabled={loading || query.trim().length < 2}
            className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Search"
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Category filter tabs — show only when results exist */}
      {results && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin" style={{ touchAction: "manipulation" }}>
          {[
            { key: "all" as FilterTab, label: "All", count: total },
            { key: "live" as FilterTab, label: "Live", count: liveCount, icon: Tv },
            { key: "movies" as FilterTab, label: "Movies", count: movieCount, icon: Film },
            { key: "series" as FilterTab, label: "Series", count: seriesCount, icon: Tv2 },
            { key: "epg" as FilterTab, label: "EPG", count: epgResults?.length ?? 0, icon: Radio },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === tab.key
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className="text-[10px] opacity-60">{tab.count.toLocaleString()}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Sort controls — show only when results exist */}
      {results && (
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground/60 font-medium flex items-center gap-1">
            <ArrowUpDown className="h-3 w-3" />
            Sort
          </span>
          <div className="flex gap-1">
            {[
              { key: "relevance" as SortBy, label: "Relevance", icon: TrendingUp },
              { key: "name" as SortBy, label: "Name A–Z", icon: ArrowUpAZ },
              { key: "rating" as SortBy, label: "Rating", icon: Star },
            ].map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                    sortBy === opt.key
                      ? "bg-primary/10 text-primary border border-primary/15"
                      : "bg-muted/40 text-muted-foreground hover:text-foreground border border-transparent"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {filter === "epg" ? (
        /* ── EPG Search Results ────────────────────────────── */
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">
              EPG Programmes ({epgResults?.length ?? 0})
            </h2>
            {epgLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          {epgLoading && epgResults === null && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!epgLoading && (!epgResults || epgResults.length === 0) && query.trim().length >= 2 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Radio className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">No EPG programmes found for &quot;{query}&quot;</p>
            </div>
          )}
          {epgResults && epgResults.length > 0 && (
            <div className="space-y-1.5">
              {epgResults.map((prog, i) => {
                const startTime = new Date(prog.start_ts * 1000);
                const stopTime = new Date(prog.stop_ts * 1000);
                const fmtTime = (d: Date) =>
                  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const mins = Math.round(prog.duration / 60);
                return (
                  <div
                    key={`${prog.channel_id}-${prog.start_ts}-${i}`}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
                  >
                    <div className="shrink-0 w-20 text-right">
                      <p className="text-xs font-medium tabular-nums">{fmtTime(startTime)}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">{fmtTime(stopTime)}</p>
                      <p className="text-[9px] text-muted-foreground/50 tabular-nums">{mins}m</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-tight truncate">{prog.title}</p>
                      {prog.subtitle && (
                        <p className="text-[10px] text-muted-foreground italic truncate">{prog.subtitle}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                        {prog.channel_name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : filteredResults && (
        <div className="space-y-8">
          {/* Live */}
          {filteredResults.live.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Tv className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">
                  Live TV ({filteredResults.live.length})
                </h2>
              </div>
              <div className="channel-grid">
                {filteredResults.live.map((s) => (
                  <button
                    key={s.stream_id}
                    onClick={() => navigate(`/watch/live/${s.stream_id}`)}
                    data-watch-link
                    className="channel-card bg-card rounded-lg border border-border p-3 text-left hover:border-primary/30"
                  >
                    {s.stream_icon ? (
                      <img
                        src={`/api/iptv/${s.stream_icon.replace("http://", "").replace("https://", "")}`}
                        alt={s.name ? `${s.name} logo` : ""}
                        className="w-full h-12 object-contain mb-2 rounded opacity-80"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-12 bg-muted rounded mb-2 flex items-center justify-center">
                        <Tv className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    )}
                    <p className="text-xs font-medium leading-tight line-clamp-2">
                      {s.name}
                    </p>
                    {getNowPlaying(s.stream_id) && (
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5 truncate leading-tight">
                        {getNowPlaying(s.stream_id)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              {/* Load more — only show when filter is "all" or "live" */}
              {(filter === "all" || filter === "live") && totals && totals.live > filteredResults.live.length && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => loadMore("live")}
                    disabled={loadingMore === "live"}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {loadingMore === "live" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    Load more live channels ({filteredResults.live.length} of {totals.live})
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Movies */}
          {filteredResults.movies.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Film className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">
                  Movies ({filteredResults.movies.length})
                </h2>
              </div>
              <div className="poster-grid">
                {filteredResults.movies.map((m) => {
                  const enr = enrichData?.[String(m.stream_id)];
                  const posterSrc = enr?.poster
                    ? tmdbImageUrl(enr.poster)
                    : m.stream_icon
                      ? imageUrl(m.stream_icon)
                      : null;
                  const posterSrcset = enr?.poster ? tmdbSrcset(enr.poster) : undefined;
                  const tmdbRating = enr?.rating ? (enr.rating / 2).toFixed(1) : null;
                  return (
                    <button
                      key={m.stream_id}
                      onClick={() => navigate(`/watch/movie/${m.stream_id}`)}
                      data-watch-link
                      className="group bg-card rounded-lg border border-border overflow-hidden hover:border-primary/30 transition-all"
                    >
                      <div className="aspect-[2/3] bg-muted relative overflow-hidden">
                        {posterSrc ? (
                          <img
                            src={posterSrc}
                            srcSet={posterSrcset}
                            sizes={posterSrcset ? "(max-width: 640px) 342px, 500px" : undefined}
                            alt={m.name ? `${m.name} poster` : ""}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                        )}
                        {/* TMDB rating badge */}
                        {tmdbRating && (
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-medium text-yellow-400">
                            <Star className="h-2.5 w-2.5 fill-yellow-400" />
                            {tmdbRating}
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 space-y-1">
                        <p className="text-xs font-medium line-clamp-2 leading-tight">
                          {m.name}
                        </p>
                        {enr?.genres && enr.genres.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {enr.genres.slice(0, 2).map((g) => (
                              <span
                                key={g}
                                className="px-1.5 py-0.5 rounded bg-primary/10 text-[10px] text-primary/80 leading-tight"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Load more — only show when filter is "all" or "movies" */}
              {(filter === "all" || filter === "movies") && totals && totals.movies > filteredResults.movies.length && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => loadMore("movies")}
                    disabled={loadingMore === "movies"}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {loadingMore === "movies" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    Load more movies ({filteredResults.movies.length} of {totals.movies})
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Series */}
          {filteredResults.series.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Tv2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">
                  Series ({filteredResults.series.length})
                </h2>
              </div>
              <div className="poster-grid">
                {filteredResults.series.map((s) => {
                  const enr = enrichData?.[String(s.series_id)];
                  const posterSrc = enr?.poster
                    ? tmdbImageUrl(enr.poster)
                    : s.cover || null;
                  const posterSrcset = enr?.poster ? tmdbSrcset(enr.poster) : undefined;
                  const tmdbRating = enr?.rating ? (enr.rating / 2).toFixed(1) : null;
                  return (
                    <button
                      key={s.series_id}
                      onClick={() => navigate('/series', { state: { openSeries: s } })}
                      className="group bg-card rounded-lg border border-border overflow-hidden hover:border-primary/30 transition-all text-left"
                    >
                      <div className="aspect-[2/3] bg-muted relative">
                        {posterSrc ? (
                          <img
                            src={posterSrc}
                            srcSet={posterSrcset}
                            sizes={posterSrcset ? "(max-width: 640px) 342px, 500px" : undefined}
                            alt={s.name ? `${s.name} poster` : ""}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Tv2 className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                        )}
                        {/* TMDB rating badge */}
                        {tmdbRating && (
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-medium text-yellow-400">
                            <Star className="h-2.5 w-2.5 fill-yellow-400" />
                            {tmdbRating}
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 space-y-1">
                        <p className="text-xs font-medium line-clamp-2 leading-tight">
                          {s.name}
                        </p>
                        {enr?.genres && enr.genres.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {enr.genres.slice(0, 2).map((g) => (
                              <span
                                key={g}
                                className="px-1.5 py-0.5 rounded bg-primary/10 text-[10px] text-primary/80 leading-tight"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Load more — only show when filter is "all" or "series" */}
              {(filter === "all" || filter === "series") && totals && totals.series > filteredResults.series.length && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => loadMore("series")}
                    disabled={loadingMore === "series"}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {loadingMore === "series" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    Load more series ({filteredResults.series.length} of {totals.series})
                  </button>
                </div>
              )}
            </section>
          )}

          {total > 0 && filteredTotal === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No results for &quot;{query}&quot; in this category</p>
            </div>
          )}
        </div>
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
