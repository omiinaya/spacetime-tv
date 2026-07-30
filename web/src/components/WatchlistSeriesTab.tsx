import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Tv2, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Series } from "@/lib/types";
import SeriesOverlay from "@/components/SeriesOverlay";
import { PosterCardSkeleton } from "@/components/Skeleton";
import {
  getSeriesWatchlist,
  toggleSeriesWatchlist,
} from "@/lib/watchlist";

interface SeriesWithInfo extends Series {
  _year?: string;
}

export default function WatchlistSeriesTab() {
  const navigate = useNavigate();
  const [seriesList, setSeriesList] = useState<SeriesWithInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlaySeries, setOverlaySeries] = useState<Series | null>(null);
  const [, setRefresh] = useState(0);

  const handleToggle = useCallback((seriesId: number) => {
    toggleSeriesWatchlist(seriesId);
    setRefresh((v) => v + 1);
    setSeriesList((prev) => prev.filter((s) => s.series_id !== seriesId));
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
        const results = await Promise.allSettled(
          ids.map(async (id) => {
            const data = await api.series.details(id);
            return { id, data };
          }),
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
        if (!cancelled)
          setError((e as Error).message || "Failed to load series");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
        <Tv2
          className="h-12 w-12 text-muted-foreground/30"
          aria-hidden="true"
        />
        <p className="text-muted-foreground text-lg font-medium">
          No series saved yet
        </p>
        <p className="text-muted-foreground/60 text-sm max-w-md text-center">
          Browse series and tap the heart icon to save your favorites here for
          quick access.
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
        {seriesList.length} {seriesList.length === 1 ? "series" : "series"}{" "}
        saved
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {seriesList.map((s) => {
          const rating = parseFloat(s.rating);
          return (
            <div
              key={s.series_id}
              onClick={() => setOverlaySeries(s)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOverlaySeries(s);
                }
              }}
              role="button"
              tabIndex={0}
              className="group relative bg-card rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-all duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
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
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                {!isNaN(rating) && (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
                    <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                    {rating.toFixed(1)}
                  </div>
                )}
                {s._year && (
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
                    {s._year}
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(s.series_id);
                  }}
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
            </div>
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
