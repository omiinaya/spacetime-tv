import { Star, Tv2, Heart, ArrowLeft } from "lucide-react";
import { isSeriesInWatchlist } from "@/lib/watchlist";
import type { Series } from "@/lib/api";
import { Pagination } from "@/components/Pagination";
import { PosterCardSkeleton } from "@/components/Skeleton";

interface SeriesGridNavProps {
  catId: string | null;
  catName: string;
  series: Series[];
  total: number;
  page: number;
  loading: boolean;
  pageSize: number;
  onBack: () => void;
  onPageChange: (page: number) => void;
  onSelectSeries: (s: Series) => void;
  onToggleWatchlist: (seriesId: number) => void;
}

export default function SeriesGridNav({
  catId,
  catName,
  series,
  total,
  page,
  loading,
  pageSize,
  onBack,
  onPageChange,
  onSelectSeries,
  onToggleWatchlist,
}: SeriesGridNavProps) {
  if (!catId) return null;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to categories
      </button>

      {/* Category header */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Tv2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{catName}</h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading..."
              : `${total.toLocaleString()} series`}
          </p>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 18 }).map((_, i) => (
            <PosterCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && series.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv2 className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No series in this category</p>
        </div>
      )}

      {/* Series grid */}
      {!loading && series.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {series.map((s) => (
            <div
              key={s.series_id}
              onClick={() => onSelectSeries(s)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectSeries(s);
                }
              }}
              role="button"
              tabIndex={0}
              className="group flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 text-left focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              {/* Poster */}
              <div className="relative w-full aspect-[2/3] bg-muted overflow-hidden">
                {s.cover ? (
                  <img
                    src={s.cover}
                    alt={s.name ? `${s.name} poster` : ""}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
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
                {/* Bottom gradient for title readability */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                {/* Rating badge */}
                {s.rating && (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
                    <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                    {parseFloat(s.rating).toFixed(1)}
                  </div>
                )}
                {/* Year badge */}
                {s.releaseDate && (
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
                    {s.releaseDate.slice(0, 4)}
                  </div>
                )}
                {/* Watchlist heart */}
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleWatchlist(s.series_id); }}
                  className="absolute bottom-2 right-2 p-1 rounded-full bg-black/60 backdrop-blur-sm opacity-70 hover:opacity-100 transition-opacity hover:scale-110"
                  aria-label={isSeriesInWatchlist(s.series_id) ? "Remove from watchlist" : "Add to watchlist"}
                >
                  <Heart
                    className={`h-4 w-4 ${isSeriesInWatchlist(s.series_id) ? "fill-red-500 text-red-500" : "text-white/70"}`}
                  />
                </button>
              </div>
              {/* Title */}
              <div className="p-2.5 flex-1">
                <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {s.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > 0 && (
        <Pagination
          currentPage={page}
          totalPages={Math.max(1, Math.ceil(total / pageSize))}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
