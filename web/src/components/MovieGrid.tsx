import { Film, Star, Globe, Heart } from "lucide-react";
import { imageUrl } from "@/lib/api";
import { isInWatchlist } from "@/lib/watchlist";
import type { UnifiedMovie } from "@/lib/types";

interface MovieGridProps {
  movies: UnifiedMovie[];
  focusedIdx: number | null;
  onSelect: (movie: UnifiedMovie) => void;
  onKeyDown: (e: React.KeyboardEvent, idx: number) => void;
  onToggleWatchlist: (streamId: number) => void;
  yearFromName: (name: string) => string | null;
  gridRef: React.RefObject<HTMLDivElement | null>;
}

const yearBadge = (year: string | null) => {
  if (!year) return null;
  return (
    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
      {year}
    </div>
  );
};

const ratingBadge = (rating: string | null | undefined) => {
  if (!rating) return null;
  return (
    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
      <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
      {parseFloat(rating).toFixed(1)}
    </div>
  );
};

const languageBadge = (count: number | undefined) => {
  if (!count || count <= 1) return null;
  return (
    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/60 flex items-center gap-1">
      <Globe className="h-2.5 w-2.5" />
      {count}
    </div>
  );
};

const posterPlaceholder = (icon: string | undefined) => {
  if (!icon) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#141420]">
        <Film className="h-8 w-8 text-white/10" />
      </div>
    );
  }
  return (
    <img
      src={imageUrl(icon)}
      alt=""
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
};

function MovieCard({
  movie,
  idx,
  focusedIdx,
  onSelect,
  onKeyDown,
  onToggleWatchlist,
  yearFromName,
}: {
  movie: UnifiedMovie;
  idx: number;
  focusedIdx: number | null;
  onSelect: (movie: UnifiedMovie) => void;
  onKeyDown: (e: React.KeyboardEvent, idx: number) => void;
  onToggleWatchlist: (streamId: number) => void;
  yearFromName: (name: string) => string | null;
}) {
  const year = yearFromName(movie.name);
  return (
    <div
      key={movie.tmdb || movie.stream_id}
      data-grid-idx={idx}
      onClick={() => onSelect(movie)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(movie);
        }
        onKeyDown(e, idx);
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
        {posterPlaceholder(movie.stream_icon)}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
        {ratingBadge(movie.rating)}
        {yearBadge(year)}
        {/* Watchlist heart */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatchlist(movie.stream_id);
          }}
          className="absolute bottom-2 right-2 p-1 rounded-full bg-black/60 backdrop-blur-sm opacity-70 hover:opacity-100 transition-opacity hover:scale-110"
          aria-label={
            isInWatchlist(movie.stream_id)
              ? "Remove from watchlist"
              : "Add to watchlist"
          }
        >
          <Heart
            className={`h-4 w-4 ${isInWatchlist(movie.stream_id) ? "fill-red-500 text-red-500" : "text-white/70"}`}
          />
        </button>
        {languageBadge(movie.language_count)}
      </div>
      {/* Title */}
      <div className="p-2.5 flex-1">
        <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {movie.base_name || movie.name}
        </p>
      </div>
    </div>
  );
}

export default function MovieGrid({
  movies,
  focusedIdx,
  onSelect,
  onKeyDown,
  onToggleWatchlist,
  yearFromName,
  gridRef,
}: MovieGridProps) {
  return (
    <div
      ref={gridRef}
      className="poster-grid"
    >
      {movies.map((m, idx) => (
        <MovieCard
          key={m.tmdb || m.stream_id}
          movie={m}
          idx={idx}
          focusedIdx={focusedIdx}
          onSelect={onSelect}
          onKeyDown={onKeyDown}
          onToggleWatchlist={onToggleWatchlist}
          yearFromName={yearFromName}
        />
      ))}
    </div>
  );
}
