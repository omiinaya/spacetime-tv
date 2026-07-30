import { Star, Heart, Tv2 } from "lucide-react";
import { isSeriesInWatchlist } from "@/lib/watchlist";
import type { Series } from "@/lib/types";

interface SeriesCardProps {
  series: Series;
  onSelect: (s: Series) => void;
  onToggleWatchlist: (seriesId: number) => void;
}

export default function SeriesCard({
  series: s,
  onSelect,
  onToggleWatchlist,
}: SeriesCardProps) {
  return (
    <div
      onClick={() => onSelect(s)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(s);
        }
      }}
      role="button"
      tabIndex={0}
      className="group shrink-0 w-[170px] sm:w-[185px] flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 text-left focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 cursor-pointer"
    >
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
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
        {s.rating && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
            <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
            {parseFloat(s.rating).toFixed(1)}
          </div>
        )}
        {s.releaseDate && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
            {s.releaseDate.slice(0, 4)}
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatchlist(s.series_id);
          }}
          className="absolute bottom-2 right-2 p-1 rounded-full bg-black/60 backdrop-blur-sm opacity-70 hover:opacity-100 transition-opacity hover:scale-110"
          aria-label={
            isSeriesInWatchlist(s.series_id)
              ? "Remove from watchlist"
              : "Add to watchlist"
          }
        >
          <Heart
            className={`h-4 w-4 ${isSeriesInWatchlist(s.series_id) ? "fill-red-500 text-red-500" : "text-white/70"}`}
          />
        </button>
      </div>
      <div className="p-2.5 flex-1">
        <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {s.name}
        </p>
      </div>
    </div>
  );
}