import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router";
import { Film, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { UnifiedMovie, TmdbMovieResult } from "@/lib/types";
import MovieOverlay from "@/components/MovieOverlay";
import { PosterCardSkeleton } from "@/components/Skeleton";
import MovieSearchBar from "@/components/MovieSearchBar";
import RecentlyAddedRow from "@/components/RecentlyAddedRow";
import TrendingMoviesRow from "@/components/TrendingMoviesRow";
import MovieGrid from "@/components/MovieGrid";
import {
  getMovieContinueWatching,
  loadServerProgress,
  type MovieProgress,
} from "@/lib/continueWatching";
import { toggleWatchlist as toggleWl } from "@/lib/watchlist";
import { useGridKeyboardNav } from "@/hooks/useGridKeyboardNav";
import { addSearchHistory } from "@/components/SearchHistory";
import { Pagination } from "@/components/Pagination";
import { MovieContinueWatchingRow } from "@/components/MovieContinueWatchingRow";
import { MovieRecentlyCompletedRow } from "@/components/MovieRecentlyCompletedRow";

const PAGE_SIZE = 50;

function useWatchlistToggle() {
  const [, setV] = useState(0);
  return useCallback((movieId: number) => {
    toggleWl(movieId);
    setV((v) => v + 1);
  }, []);
}

function yearFromName(name: string) {
  const m = /\((\d{4})\)/.exec(name);
  return m ? m[1] : null;
}

export default function Movies() {
  // ── Search (URL-persisted, debounced via MovieSearchBar) ──
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") || "";
  const [searchQuery, setSearchQueryState] = useState(urlQuery);
  const [searchInput, setSearchInput] = useState(urlQuery);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQueryState(value);
      setSearchInput(value);
      if (value) setSearchParams({ q: value }, { replace: true });
      else setSearchParams({}, { replace: true });
    },
    [setSearchParams],
  );

  // ── State ──
  const toggleWatchlist = useWatchlistToggle();
  const [movies, setMovies] = useState<UnifiedMovie[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);
  const searchIdRef = useRef(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Overlay
  const [overlayMovie, setOverlayMovie] = useState<UnifiedMovie | null>(null);

  // Keyboard navigation
  const [focusedIdx, handleGridKeyDown] = useGridKeyboardNav(
    movies.length,
    (idx) => setOverlayMovie(movies[idx]),
    gridRef,
    !overlayMovie,
  );

  // Continue watching
  const [continueWatching, setContinueWatching] = useState<MovieProgress[]>([]);
  useEffect(() => {
    setContinueWatching(getMovieContinueWatching());
    loadServerProgress().then((merged) => {
      setContinueWatching(merged.movies);
    });
  }, []);

  // ── Trending (TMDB) ──
  const [trending, setTrending] = useState<TmdbMovieResult[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingEnabled, setTrendingEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    api.tmdb
      .trending("week", 1)
      .then((res) => {
        if (cancelled) return;
        setTrending(res.trending || []);
        setTrendingEnabled(res.enabled);
        setTrendingLoading(false);
      })
      .catch(() => {
        if (!cancelled) setTrendingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch ──
  const fetchPage = useCallback(
    async (offset: number, replace: boolean, query: string) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      const sid = ++searchIdRef.current;

      if (replace) setLoading(true);
      else setLoadingMore(true);

      try {
        const d = await api.movies.unified(
          PAGE_SIZE,
          offset,
          query || undefined,
        );
        if (sid !== searchIdRef.current) return;
        if (replace) {
          setMovies(d.movies);
        } else {
          setMovies((prev) => [...prev, ...d.movies]);
        }
        setTotal(d.total);
        if (replace) setCurrentPage(Math.floor(offset / PAGE_SIZE) + 1);
      } catch {
        // SyntaxError or network error — silently degrade
      } finally {
        if (sid === searchIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
        fetchingRef.current = false;
      }
    },
    [],
  );

  // Initial load + reload on search change
  useEffect(() => {
    fetchPage(0, true, searchQuery);
  }, [searchQuery, fetchPage]);

  // ── Cache-warm retry ──
  // movies/unified reads ONLY the in-memory cache. After a service restart
  // or a provider edit (which clears + re-warms the cache), the first fetch
  // can legitimately return 0 movies while the warmer repopulates (~20-25s).
  // Instead of showing a permanent "No movies available", retry a few times
  // with a delay so the page fills in once the warm completes.
  const warmRetriesRef = useRef(0);
  const warmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading || searchQuery) return;
    if (movies.length > 0) {
      warmRetriesRef.current = 0;
      return;
    }
    if (warmRetriesRef.current >= 8) return; // ~40s of retries, then give up
    warmRetriesRef.current += 1;
    warmTimerRef.current = setTimeout(() => {
      fetchPage(0, true, "");
    }, 5000);
    return () => {
      if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
    };
  }, [movies.length, total, loading, searchQuery, fetchPage]);

  // ── Infinite scroll ──
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || movies.length >= total || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !fetchingRef.current) {
          fetchPage(movies.length, false, searchQuery);
        }
      },
      { rootMargin: "400px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [movies.length, total, loading, loadingMore, searchQuery, fetchPage]);

  // ── Helpers ──
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = useCallback(
    (page: number) => {
      const offset = (page - 1) * PAGE_SIZE;
      setCurrentPage(page);
      fetchPage(offset, true, searchQuery);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [searchQuery, fetchPage],
  );

  // ── Render ──
  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Film className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">Movies</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString()} movies across all languages`
              : loading
                ? "Loading..."
                : ""}
          </p>
        </div>
      </div>

      {/* Search */}
      <MovieSearchBar
        value={searchInput}
        onChange={setSearchInput}
        onSearch={handleSearch}
        onAddHistory={addSearchHistory}
      />

      {/* Continue Watching — in-progress only */}
      {!loading && continueWatching.length > 0 && (
        <MovieContinueWatchingRow
          movies={movies}
          continueWatching={continueWatching}
          onSelectMovie={(m) => setOverlayMovie(m)}
        />
      )}

      {/* Recently Completed */}
      {!loading && continueWatching.length > 0 && (
        <MovieRecentlyCompletedRow
          movies={movies}
          continueWatching={continueWatching}
          onSelectMovie={(m) => setOverlayMovie(m)}
        />
      )}

      {/* Recently Added */}
      {!loading && (
        <RecentlyAddedRow movies={movies} onSelect={setOverlayMovie} />
      )}

      {/* Trending (TMDB proxy) */}
      {!trendingLoading && trendingEnabled && (
        <TrendingMoviesRow
          trending={trending}
          movies={movies}
          onSelect={setOverlayMovie}
        />
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="poster-grid">
          {Array.from({ length: 18 }).map((_, i) => (
            <PosterCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && movies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Film className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? `No movies matching "${searchQuery}"`
              : "No movies available"}
          </p>
          {searchQuery && (
            <button
              onClick={() => handleSearch("")}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      {/* Movie grid */}
      {!loading && movies.length > 0 && (
        <MovieGrid
          movies={movies}
          focusedIdx={focusedIdx}
          onSelect={setOverlayMovie}
          onKeyDown={handleGridKeyDown}
          onToggleWatchlist={toggleWatchlist}
          yearFromName={yearFromName}
          gridRef={gridRef}
        />
      )}

      {/* Loading more */}
      {loadingMore && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
        />
      )}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />

      {/* Movie overlay */}
      {overlayMovie && (
        <MovieOverlay
          movie={overlayMovie}
          onClose={() => setOverlayMovie(null)}
        />
      )}
    </div>
  );
}
