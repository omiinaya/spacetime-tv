import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Loader2, Star, Play, Trash2 } from "lucide-react";
import { api, UnifiedMovie, imageUrl } from "@/lib/api";
import MovieOverlay from "@/components/MovieOverlay";
import { PosterCardSkeleton } from "@/components/Skeleton";
import { getWatchlist, toggleWatchlist, isInWatchlist } from "@/lib/watchlist";

export default function WatchlistPage() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState<UnifiedMovie[]>([]);
  const [allMovies, setAllMovies] = useState<UnifiedMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlayMovie, setOverlayMovie] = useState<UnifiedMovie | null>(null);
  const [, setRefresh] = useState(0);

  // Toggle watchlist and re-filter
  const handleToggle = useCallback((movieId: number) => {
    toggleWatchlist(movieId);
    setRefresh(v => v + 1);
    // Re-filter from the full dataset
    const ids = getWatchlist();
    setMovies(allMovies.filter(m => ids.includes(m.stream_id)));
  }, [allMovies]);

  // Fetch all movies, then filter by watchlist IDs
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await api.movies.unified(200, 0);
        if (cancelled) return;
        setAllMovies(d.movies);
        const ids = getWatchlist();
        setMovies(d.movies.filter(m => ids.includes(m.stream_id)));
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message || "Failed to load watchlist");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500 fill-red-500" aria-hidden="true" />
            My Watchlist
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {movies.length} {movies.length === 1 ? "movie" : "movies"} saved
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <PosterCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && movies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Heart className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
          <p className="text-muted-foreground text-lg font-medium">Your watchlist is empty</p>
          <p className="text-muted-foreground/60 text-sm max-w-md text-center">
            Browse movies and tap the heart icon to save your favorites here for quick access.
          </p>
          <button
            onClick={() => navigate("/movies")}
            className="px-6 py-2 bg-primary hover:bg-primary/90 rounded-lg text-sm font-medium transition-colors mt-2"
          >
            Browse Movies
          </button>
        </div>
      )}

      {/* Movie grid */}
      {!loading && !error && movies.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {movies.map((m) => {
            const year = m.added ? m.added.slice(0, 4) : "";
            const rating = parseFloat(m.rating);
            return (
              <button
                key={m.stream_id}
                data-watch-link
                onClick={() => setOverlayMovie(m)}
                className="group relative bg-card rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-all duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`${m.base_name || m.name} — movie details`}
              >
                {/* Poster */}
                <div className="aspect-[2/3] overflow-hidden bg-muted">
                  <img
                    src={imageUrl(m.stream_icon)}
                    alt={m.base_name || m.name ? `${m.base_name || m.name} poster` : ""}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "";
                      (e.target as HTMLImageElement).classList.add("opacity-0");
                    }}
                  />
                </div>

                {/* Overlay badges */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Play className="h-8 w-8 text-white/80 fill-white/80" aria-hidden="true" />
                  </div>
                </div>

                {/* Rating badge */}
                {!isNaN(rating) && (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5 pointer-events-none">
                    <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                    {rating.toFixed(1)}
                  </div>
                )}

                {/* Year badge */}
                {year && (
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70 pointer-events-none">
                    {year}
                  </div>
                )}

                {/* Remove from watchlist */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggle(m.stream_id); }}
                  className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-sm hover:bg-red-500/80 transition-colors z-10"
                  aria-label={`Remove ${m.base_name || m.name} from watchlist`}
                  title="Remove from watchlist"
                >
                  <Trash2 className="h-3.5 w-3.5 text-white" />
                </button>

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

      {/* Overlay */}
      {overlayMovie && (
        <MovieOverlay
          movie={overlayMovie}
          onClose={() => setOverlayMovie(null)}
        />
      )}
    </div>
  );
}
