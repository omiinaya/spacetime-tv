import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Film,
  Loader2,
  Star,
  Play,
  Search,
  X,
  Globe,
} from "lucide-react";
import { api, UnifiedMovie } from "@/lib/api";
import MovieOverlay from "@/components/MovieOverlay";

const PAGE_SIZE = 50;

export default function Movies() {
  // ── Search (URL-persisted) ──────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";
  const setSearchQuery = useCallback(
    (q: string) => {
      if (q) setSearchParams({ q });
      else setSearchParams({});
    },
    [setSearchParams]
  );

  // ── State ───────────────────────────────────────────────────────
  const [movies, setMovies] = useState<UnifiedMovie[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);
  const searchIdRef = useRef(0);

  // Overlay
  const [overlayMovie, setOverlayMovie] = useState<UnifiedMovie | null>(null);

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
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search movies..."
          className="w-full h-9 pl-9 pr-8 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] rounded-xl bg-card animate-pulse"
            />
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
              onClick={() => setSearchQuery("")}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      {/* Movie grid */}
      {!loading && movies.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {movies.map((m) => {
            const year = yearFromName(m.name);
            return (
              <button
                key={m.tmdb || m.stream_id}
                onClick={() => setOverlayMovie(m)}
                className="group flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 text-left"
              >
                {/* Poster */}
                <div className="relative w-full aspect-[2/3] bg-muted overflow-hidden">
                  {m.stream_icon ? (
                    <img
                      src={m.stream_icon}
                      alt=""
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
                  {/* Play button on hover */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                    <div className="p-3 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                      <Play className="h-5 w-5 fill-white" />
                    </div>
                  </div>
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
              </button>
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
