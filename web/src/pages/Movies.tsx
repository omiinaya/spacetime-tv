import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router";
import {
  Film,
  Loader2,
  Star,
  Search,
  X,
  Globe,
  Heart,
} from "lucide-react";
import { api, UnifiedMovie, TmdbMovieResult, imageUrl, tmdbImgProps } from "@/lib/api";
import MovieOverlay from "@/components/MovieOverlay";
import ContentRow from "@/components/ContentRow";
import { PosterCardSkeleton } from "@/components/Skeleton";
import { getMovieContinueWatching, loadServerProgress, removeMovieProgress, type MovieProgress } from "@/lib/continueWatching";
import { isInWatchlist, toggleWatchlist as toggleWl } from "@/lib/watchlist";
import { useGridKeyboardNav } from "@/hooks/useGridKeyboardNav";
import { SearchHistory, addSearchHistory } from "@/components/SearchHistory";
import { Pagination } from "@/components/Pagination";

const PAGE_SIZE = 50;

function useWatchlistToggle() {
  const [, setV] = useState(0);
  return useCallback((movieId: number) => {
    toggleWl(movieId);
    setV(v => v + 1);
  }, []);
}

export default function Movies() {
  // ── Search (URL-persisted, debounced) ──────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") || "";
  const [inputValue, setInputValue] = useState(urlQuery);
  const [searchQuery, setSearchQueryState] = useState(urlQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQueryState(value);
      if (value) setSearchParams({ q: value }, { replace: true });
      else setSearchParams({}, { replace: true });
    }, 300);
  }, [setSearchParams]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // ── State ───────────────────────────────────────────────────────
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
  const [showHistory, setShowHistory] = useState(false);

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

  // ── Trending (TMDB) ───────────────────────────────────────────
  const [trending, setTrending] = useState<TmdbMovieResult[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingEnabled, setTrendingEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    api.tmdb.trending("week", 1).then((res) => {
      if (cancelled) return;
      setTrending(res.trending || []);
      setTrendingEnabled(res.enabled);
      setTrendingLoading(false);
    }).catch(() => {
      if (!cancelled) setTrendingLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Fetch ───────────────────────────────────────────────────────
  const fetchPage = useCallback(
    async (offset: number, replace: boolean, query: string) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      const sid = ++searchIdRef.current;

      if (replace) setLoading(true);
      else setLoadingMore(true);

      try {
        const d = await api.movies.unified(PAGE_SIZE, offset, query || undefined);
        if (sid !== searchIdRef.current) return;
        if (replace) {
          setMovies(d.movies);
        } else {
          setMovies((prev) => [...prev, ...d.movies]);
        }
        setTotal(d.total);
        if (replace) setCurrentPage(Math.floor(offset / PAGE_SIZE) + 1);
      } catch {
        // silent — errors handled by empty state
      } finally {
        if (sid === searchIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
        fetchingRef.current = false;
      }
    },
    []
  );

  // Initial load + reload on search change
  useEffect(() => {
    fetchPage(0, true, searchQuery);
  }, [searchQuery, fetchPage]);

  // ── Infinite scroll ─────────────────────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || movies.length >= total || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !fetchingRef.current) {
          fetchPage(movies.length, false, searchQuery);
        }
      },
      { rootMargin: "400px" }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [movies.length, total, loading, loadingMore, searchQuery, fetchPage]);

  // ── Helpers ─────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = useCallback((page: number) => {
    const offset = (page - 1) * PAGE_SIZE;
    setCurrentPage(page);
    fetchPage(offset, true, searchQuery);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [searchQuery, fetchPage]);

  const yearFromName = (name: string) => {
    const m = /\((\d{4})\)/.exec(name);
    return m ? m[1] : null;
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Film className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Movies</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString()} movies across all languages`
              : loading
              ? "Loading..."
              : ""}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (!inputValue) setShowHistory(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && inputValue.trim().length >= 2) {
              addSearchHistory(inputValue);
              setShowHistory(false);
            }
          }}
          placeholder="Search movies..."
          className="w-full h-9 pl-9 pr-8 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <SearchHistory
          show={showHistory}
          onClose={() => setShowHistory(false)}
          onSelect={(q) => {
            handleInputChange(q);
            addSearchHistory(q);
          }}
        />
        {inputValue && (
          <button
            onClick={() => handleInputChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Continue Watching — in-progress only */}
      {!loading && continueWatching.length > 0 && (() => {
        const cwMovies = continueWatching.filter(cw => movies.some(m => m.stream_id === cw.movieId));
        const inProgress = cwMovies.filter(cw => cw.durationSeconds <= 0 || (cw.progressSeconds / cw.durationSeconds) < 0.9);
        if (inProgress.length === 0) return null;
        return (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Continue Watching</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 pr-4 md:pr-0" style={{ touchAction: "manipulation" }}>
              {inProgress.slice(0, 10).map((cw) => {
                const movie = movies.find(m => m.stream_id === cw.movieId);
                if (!movie) return null;
                const pct = cw.durationSeconds > 0 ? Math.min(100, (cw.progressSeconds / cw.durationSeconds) * 100) : 0;
                return (
                  <div key={cw.movieId} className="shrink-0 w-[120px] group relative">
                    <button onClick={() => setOverlayMovie(movie)} className="w-full text-left">
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5">
                        {movie.stream_icon ? (
                          <img src={imageUrl(movie.stream_icon)} alt={movie.name ? `${movie.name} poster` : ''} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                            <Film className="h-6 w-6 text-white/10" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <p className="text-[11px] leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                        {movie.base_name || movie.name}
                      </p>
                    </button>
                    {/* Dismiss button */}
                    <button
                      onClick={() => removeMovieProgress(cw.movieId)}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 backdrop-blur-sm text-white/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] z-10"
                      aria-label="Remove from continue watching"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Recently Completed */}
      {!loading && continueWatching.length > 0 && (() => {
        const cwMovies = continueWatching.filter(cw => movies.some(m => m.stream_id === cw.movieId));
        const completed = cwMovies.filter(cw => cw.durationSeconds > 0 && (cw.progressSeconds / cw.durationSeconds) >= 0.9);
        if (completed.length === 0) return null;
        return (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
              <span className="text-green-400">✓</span>
              Recently Completed
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 pr-4 md:pr-0" style={{ touchAction: "manipulation" }}>
              {completed.slice(0, 8).map((cw) => {
                const movie = movies.find(m => m.stream_id === cw.movieId);
                if (!movie) return null;
                return (
                  <div key={cw.movieId} className="shrink-0 w-[120px] group relative">
                    <button onClick={() => setOverlayMovie(movie)} className="w-full text-left">
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-1 ring-green-500/20 group-hover:ring-green-500/40 transition-all">
                        {movie.stream_icon ? (
                          <img src={imageUrl(movie.stream_icon)} alt={movie.name ? `${movie.name} poster` : ''} className="w-full h-full object-cover opacity-70" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                            <Film className="h-6 w-6 text-white/10" />
                          </div>
                        )}
                        {/* Completed check */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="p-1.5 rounded-full bg-green-500/20 backdrop-blur-sm">
                            <span className="text-green-400 text-sm">✓</span>
                          </div>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-green-500" />
                      </div>
                      <p className="text-[11px] leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                        {movie.base_name || movie.name}
                      </p>
                    </button>
                    {/* Dismiss button */}
                    <button
                      onClick={() => removeMovieProgress(cw.movieId)}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 backdrop-blur-sm text-white/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] z-10"
                      aria-label="Remove from recently completed"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Recently Added */}
      {!loading && movies.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Recently Added</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 pr-4 md:pr-0" style={{ touchAction: "manipulation" }}>
            {[...movies]
              .filter((m): m is typeof m & { added: string } => !!m.added)
              .sort((a, b) => parseInt(b.added) - parseInt(a.added))
              .slice(0, 12)
              .map((m) => (
                <button
                  key={`recent-${m.stream_id}`}
                  onClick={() => setOverlayMovie(m)}
                  className="shrink-0 w-[120px] group"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5">
                    {m.stream_icon ? (
                      <img src={imageUrl(m.stream_icon)} alt={m.name ? `${m.name} poster` : ''} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                        <Film className="h-6 w-6 text-white/10" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
                    <span className="absolute bottom-1.5 left-1.5 text-[10px] font-medium text-white/80">
                      {m.rating && `★${parseFloat(m.rating).toFixed(1)}`}
                    </span>
                  </div>
                  <p className="text-[11px] leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                    {m.base_name || m.name}
                  </p>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Trending (TMDB proxy) */}
      {!trendingLoading && trendingEnabled && trending.length > 0 && (
        <div>
          <ContentRow title="Trending This Week" itemCount={trending.length}>
            {trending.map((t, idx) => {
              const posterProps = t.poster_path ? tmdbImgProps(t.poster_path) : null;
              const year = t.release_date ? t.release_date.slice(0, 4) : "";
              return (
                <button
                  key={`trending-${t.id}`}
                  data-row-idx={idx}
                  className="shrink-0 w-[140px] group text-left focus:outline-none"
                  onClick={() => {
                    // Open the first matching unified movie, or just log
                    const match = movies.find((m) => {
                      // Match by TMDB ID stored in the movie's `tmdb` field
                      return m.tmdb === String(t.id) || m.name.toLowerCase().includes(t.title.toLowerCase().slice(0, 20));
                    });
                    if (match) setOverlayMovie(match);
                  }}
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-0 group-focus:ring-2 group-focus:ring-primary/60 group-focus:ring-offset-2 group-focus:ring-offset-background transition-all">
                    {posterProps ? (
                      <img
                        {...posterProps}
                        alt={`${t.title} poster`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                        <Film className="h-8 w-8 text-white/10" />
                      </div>
                    )}
                    {/* Bottom gradient */}
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
                    {/* Rating badge */}
                    {t.vote_average > 0 && (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
                        <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                        {t.vote_average.toFixed(1)}
                      </div>
                    )}
                    {/* Year badge */}
                    {year && (
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
                        {year}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {t.title}
                  </p>
                  {year && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{year}</p>
                  )}
                </button>
              );
            })}
          </ContentRow>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
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
              onClick={() => handleInputChange("")}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      {/* Movie grid */}
      {!loading && movies.length > 0 && (
        <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {movies.map((m, idx) => {
            const year = yearFromName(m.name);
            return (
              <div
                key={m.tmdb || m.stream_id}
                data-grid-idx={idx}
                onClick={() => setOverlayMovie(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOverlayMovie(m); }
                  handleGridKeyDown(e, idx);
                }}
                role="button"
                tabIndex={0}
                className={`group flex flex-col rounded-xl overflow-hidden bg-card border transition-all duration-200 text-left focus:outline-none cursor-pointer ${
                  focusedIdx === idx
                    ? "border-primary ring-2 ring-primary/40 shadow-lg shadow-primary/10"
                    : "border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                }`}
              >
                {/* Poster */}
                <div className="relative w-full aspect-[2/3] bg-muted overflow-hidden">
                  {m.stream_icon ? (
                    <img
                      src={imageUrl(m.stream_icon)}
                      alt={(m.base_name || m.name) ? `${m.base_name || m.name} poster` : ""}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                      <Film className="h-8 w-8 text-white/10" />
                    </div>
                  )}
                  {/* Bottom gradient */}
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                  {/* Rating badge */}
                  {m.rating && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
                      <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                      {parseFloat(m.rating).toFixed(1)}
                    </div>
                  )}
                  {/* Year badge */}
                  {year && (
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
                      {year}
                    </div>
                  )}
                  {/* Watchlist heart — always visible on mobile, brighter on hover */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleWatchlist(m.stream_id); }}
                    className="absolute bottom-2 right-2 p-1 rounded-full bg-black/60 backdrop-blur-sm opacity-70 hover:opacity-100 transition-opacity hover:scale-110"
                    aria-label={isInWatchlist(m.stream_id) ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    <Heart
                      className={`h-4 w-4 ${isInWatchlist(m.stream_id) ? "fill-red-500 text-red-500" : "text-white/70"}`}
                    />
                  </button>
                  {/* Language count badge */}
                  {m.language_count > 1 && (
                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/60 flex items-center gap-1">
                      <Globe className="h-2.5 w-2.5" />
                      {m.language_count}
                    </div>
                  )}
                </div>
                {/* Title */}
                <div className="p-2.5 flex-1">
                  <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {m.base_name || m.name}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
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
