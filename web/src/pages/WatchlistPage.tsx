import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Loader2, Star, Play, Trash2, Tv2, Bookmark } from "lucide-react";
import { api, UnifiedMovie, Series, imageUrl } from "@/lib/api";
import MovieOverlay from "@/components/MovieOverlay";
import SeriesOverlay from "@/components/SeriesOverlay";
import { PosterCardSkeleton } from "@/components/Skeleton";
import {
  getWatchlist,
  toggleWatchlist,
  isInWatchlist,
  getSeriesWatchlist,
  toggleSeriesWatchlist,
  isSeriesInWatchlist,
} from "@/lib/watchlist";

type Tab = "movies" | "series";

export default function WatchlistPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("movies");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-primary" aria-hidden="true" />
            My Watchlist
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setTab("movies")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "movies"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Heart className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" aria-hidden="true" />
          Movies ({getWatchlist().length})
        </button>
        <button
          onClick={() => setTab("series")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "series"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Tv2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" aria-hidden="true" />
          Series ({getSeriesWatchlist().length})
        </button>
      </div>

      {tab === "movies" ? <MoviesTab /> : <SeriesTab />}
    </div>
  );
}

// ── Movies tab ─────────────────────────────────────────────────────

function MoviesTab() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState<UnifiedMovie[]>([]);
  const [allMovies, setAllMovies] = useState<UnifiedMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlayMovie, setOverlayMovie] = useState<UnifiedMovie | null>(null);
  const [, setRefresh] = useState(0);

  const handleToggle = useCallback((movieId: number) => {
    toggleWatchlist(movieId);
    setRefresh(v => v + 1);
    const ids = getWatchlist();
    setMovies(allMovies.filter(m => ids.includes(m.stream_id)));
  }, [allMovies]);

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

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <PosterCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Heart className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
        <p className="text-muted-foreground text-lg font-medium">No movies saved yet</p>
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
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        {movies.length} {movies.length === 1 ? "movie" : "movies"} saved
      </p>
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
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Play className="h-8 w-8 text-white/80 fill-white/80" aria-hidden="true" />
                </div>
              </div>
              {!isNaN(rating) && (
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5 pointer-events-none">
                  <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                  {rating.toFixed(1)}
                </div>
              )}
              {year && (
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70 pointer-events-none">
                  {year}
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleToggle(m.stream_id); }}
                className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-sm hover:bg-red-500/80 transition-colors z-10"
                aria-label={`Remove ${m.base_name || m.name} from watchlist`}
                title="Remove from watchlist"
              >
                <Trash2 className="h-3.5 w-3.5 text-white" />
              </button>
              <div className="p-2.5 flex-1">
                <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {m.base_name || m.name}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {overlayMovie && (
        <MovieOverlay
          movie={overlayMovie}
          onClose={() => setOverlayMovie(null)}
        />
      )}
    </>
  );
}

// ── Series tab ──────────────────────────────────────────────────────

interface SeriesWithInfo extends Series {
  _year?: string;
}

function SeriesTab() {
  const navigate = useNavigate();
  const [seriesList, setSeriesList] = useState<SeriesWithInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlaySeries, setOverlaySeries] = useState<Series | null>(null);
  const [, setRefresh] = useState(0);

  const handleToggle = useCallback((seriesId: number) => {
    toggleSeriesWatchlist(seriesId);
    setRefresh(v => v + 1);
    setSeriesList(prev => prev.filter(s => s.series_id !== seriesId));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const ids = getSeriesWatchlist();
      if (ids.length === 0) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        // Fetch series details in parallel, tracking original IDs
        const results = await Promise.allSettled(
          ids.map(async (id) => {
            const data = await api.series.details(id);
            return { id, data };
          })
        );
        if (cancelled) return;
        const items: SeriesWithInfo[] = [];
        for (const result of results) {
          if (result.status === "fulfilled") {
            const { id, data } = result.value;
            const info = data.info || data;
            const s: SeriesWithInfo = {
              num: 0,
              series_id: id,
              name: info.name || "Unknown Series",
              cover: info.cover || "",
              plot: info.plot || "",
              cast: info.cast || "",
              director: info.director || "",
              genre: info.genre || "",
              releaseDate: info.releaseDate || info.release_date || "",
              rating: info.rating || "0",
              rating_5based: info.rating_5based || "0",
              tmdb: info.tmdb || "",
              youtube_trailer: info.youtube_trailer || "",
              category_id: info.category_id || "",
            };
            if (s.releaseDate) {
              s._year = s.releaseDate.slice(0, 4);
            }
            items.push(s);
          }
        }
        if (!cancelled) setSeriesList(items);
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message || "Failed to load series");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <PosterCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (seriesList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Tv2 className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
        <p className="text-muted-foreground text-lg font-medium">No series saved yet</p>
        <p className="text-muted-foreground/60 text-sm max-w-md text-center">
          Browse series and tap the heart icon to save your favorites here for quick access.
        </p>
        <button
          onClick={() => navigate("/series")}
          className="px-6 py-2 bg-primary hover:bg-primary/90 rounded-lg text-sm font-medium transition-colors mt-2"
        >
          Browse Series
        </button>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        {seriesList.length} {seriesList.length === 1 ? "series" : "series"} saved
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {seriesList.map((s) => {
          const rating = parseFloat(s.rating);
          return (
            <button
              key={s.series_id}
              onClick={() => setOverlaySeries(s)}
              className="group relative bg-card rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-all duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`${s.name} — series details`}
            >
              <div className="aspect-[2/3] overflow-hidden bg-muted">
                {s.cover ? (
                  <img
                    src={s.cover}
                    alt={s.name ? `${s.name} poster` : ""}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                    <Tv2 className="h-8 w-8 text-white/10" />
                  </div>
                )}
                {/* Bottom gradient */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                {/* Rating */}
                {!isNaN(rating) && (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
                    <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                    {rating.toFixed(1)}
                  </div>
                )}
                {/* Year */}
                {s._year && (
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
                    {s._year}
                  </div>
                )}
                {/* Remove from watchlist */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggle(s.series_id); }}
                  className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-sm hover:bg-red-500/80 transition-colors z-10"
                  aria-label={`Remove ${s.name} from watchlist`}
                  title="Remove from watchlist"
                >
                  <Trash2 className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
              <div className="p-2.5 flex-1">
                <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {s.name}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {overlaySeries && (
        <SeriesOverlay
          series={overlaySeries}
          onClose={() => setOverlaySeries(null)}
        />
      )}
    </>
  );
}
