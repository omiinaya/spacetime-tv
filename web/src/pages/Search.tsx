import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  Loader2,
  Tv,
  Film,
  Tv2,
  Star,
  AlertCircle,
  Tags,
  List,
} from "lucide-react";
import { api, LiveStream, Movie, Series, imageUrl, TmdbEnrichData } from "@/lib/api";
import { SearchHistory, addSearchHistory } from "@/components/SearchHistory";

type FilterTab = "all" | "live" | "movies" | "series";

interface SearchResults {
  live: LiveStream[];
  movies: Movie[];
  series: Series[];
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(urlQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [enrichData, setEnrichData] = useState<Record<string, TmdbEnrichData> | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");

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

  const getCached = (q: string): SearchResults | null => {
    try {
      const raw = sessionStorage.getItem(SEARCH_CACHE_PREFIX + q);
      if (!raw) return null;
      const { results, ts } = JSON.parse(raw);
      if (Date.now() - ts < SEARCH_CACHE_TTL) return results;
      sessionStorage.removeItem(SEARCH_CACHE_PREFIX + q);
    } catch {}
    return null;
  };
  const setCached = (q: string, r: SearchResults) => {
    try {
      sessionStorage.setItem(SEARCH_CACHE_PREFIX + q, JSON.stringify({ results: r, ts: Date.now() }));
    } catch {}
  };

  // ── Single unified search pipeline ────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults(null);
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
      setLoading(false);
      setError(null);
      // Background: refresh from API if not already refreshing
      if (!bgRefreshRef.current) {
        bgRefreshRef.current = true;
        runSearch(trimmed).finally(() => { bgRefreshRef.current = false; });
      }
    } else {
      // No cache — full load with spinner
      runSearch(trimmed);
    }
  }, [urlQuery, runSearch]);

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
  }, [query, setSearchParams, runSearch]);

  // ── Derived ───────────────────────────────────────────────────
  const total =
    results
      ? results.live.length + results.movies.length + results.series.length
      : 0;
  const liveCount = results?.live.length ?? 0;
  const movieCount = results?.movies.length ?? 0;
  const seriesCount = results?.series.length ?? 0;

  const filteredResults = useMemo(() => {
    if (!results) return null;
    switch (filter) {
      case "live":
        return { ...results, movies: [], series: [] };
      case "movies":
        return { ...results, live: [], series: [] };
      case "series":
        return { ...results, live: [], movies: [] };
      default:
        return results;
    }
  }, [results, filter]);

  const filteredTotal =
    filteredResults
      ? filteredResults.live.length + filteredResults.movies.length + filteredResults.series.length
      : 0;

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
                {tab.count > 0 && (
                  <span className="text-[10px] opacity-60">{tab.count.toLocaleString()}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Results */}
      {filteredResults && (
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
                  </button>
                ))}
              </div>
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
                    ? TMDB_IMAGE_BASE + enr.poster
                    : m.stream_icon
                      ? imageUrl(m.stream_icon)
                      : null;
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
                    ? TMDB_IMAGE_BASE + enr.poster
                    : s.cover || null;
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
