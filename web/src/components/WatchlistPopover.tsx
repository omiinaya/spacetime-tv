import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Heart, Film, Tv2, Loader2, Star, ExternalLink } from "lucide-react";
import { api, imageUrl } from "@/lib/api";
import {
  getWatchlist,
  getSeriesWatchlist,
  getWatchlistCount,
  getSeriesWatchlistCount,
} from "@/lib/watchlist";

interface WatchlistItem {
  id: number;
  name: string;
  poster: string;
  year: string;
  rating: string;
  type: "movie" | "series";
}

export default function WatchlistPopover({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const movieCount = getWatchlistCount();
  const seriesCount = getSeriesWatchlistCount();
  const total = movieCount + seriesCount;

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const collected: WatchlistItem[] = [];

        // Fetch movies
        const movieIds = getWatchlist();
        if (movieIds.length > 0) {
          const unified = await api.movies.unified(200, 0);
          if (cancelled) return;
          const idSet = new Set(movieIds);
          for (const m of unified.movies) {
            if (collected.length >= 6) break;
            if (idSet.has(m.stream_id)) {
              collected.push({
                id: m.stream_id,
                name: m.base_name || m.name,
                poster: m.stream_icon,
                year: m.added ? m.added.slice(0, 4) : "",
                rating: m.rating,
                type: "movie",
              });
            }
          }
        }

        // Fetch series
        const seriesIds = getSeriesWatchlist();
        if (seriesIds.length > 0) {
          // Fetch series details for first few in parallel
          const limit = Math.min(seriesIds.length, 3);
          const results = await Promise.allSettled(
            seriesIds.slice(0, limit).map(async (id) => {
              const data = await api.series.details(id);
              const info = data.info || data;
              return {
                id,
                name: info.name || "Unknown",
                poster: info.cover || "",
                year: (info.releaseDate || info.release_date || "").slice(0, 4),
                rating: info.rating || "0",
                type: "series" as const,
              };
            }),
          );
          if (cancelled) return;
          for (const r of results) {
            if (r.status === "fulfilled") collected.push(r.value);
          }
        }

        if (!cancelled) setItems(collected.slice(0, 6));
      } catch (e) {
        if (!cancelled) setError((e as Error).message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const goTo = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose],
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Watchlist"
      className="absolute left-full top-0 ml-2 w-72 bg-card border border-border rounded-xl shadow-xl shadow-black/40 z-[60] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Watchlist</span>
        </div>
        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {total} {total === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 text-center py-4 px-4">{error}</p>
        )}

        {!loading && !error && items.length === 0 && total === 0 && (
          <div className="flex flex-col items-center py-8 px-4 text-center">
            <Heart className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground">
              Your watchlist is empty
            </p>
            <button
              onClick={() => goTo("/movies")}
              className="mt-3 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Browse Movies
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && total > 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 px-4">
            Loading items…
          </p>
        )}

        {items.length > 0 && (
          <div className="py-1">
            {items.map((item) => {
              const rating = parseFloat(item.rating);
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => {
                    if (item.type === "movie") {
                      goTo(`/movies?q=${encodeURIComponent(item.name)}`);
                    } else {
                      goTo(`/series?q=${encodeURIComponent(item.name)}`);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors group"
                >
                  {/* Thumbnail */}
                  <div className="shrink-0 w-10 h-14 rounded overflow-hidden bg-muted">
                    {item.poster ? (
                      <img
                        src={imageUrl(item.poster)}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                        {item.type === "movie" ? (
                          <Film className="h-4 w-4 text-muted-foreground/30" />
                        ) : (
                          <Tv2 className="h-4 w-4 text-muted-foreground/30" />
                        )}
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.year && (
                        <span className="text-[10px] text-muted-foreground/60">
                          {item.year}
                        </span>
                      )}
                      {!isNaN(rating) && rating > 0 && (
                        <span className="text-[10px] flex items-center gap-0.5 text-yellow-400">
                          <Star className="h-2.5 w-2.5 fill-yellow-400" />
                          {rating.toFixed(1)}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/40 uppercase">
                        {item.type}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2.5">
        <button
          onClick={() => goTo("/watchlist")}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          View all
        </button>
      </div>
    </div>
  );
}
