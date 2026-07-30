import { Film } from "lucide-react";
import { imageUrl } from "@/lib/api";
import { removeMovieProgress, type MovieProgress } from "@/lib/continueWatching";
import type { UnifiedMovie } from "@/lib/api";

interface MovieContinueWatchingRowProps {
  movies: UnifiedMovie[];
  continueWatching: MovieProgress[];
  onSelectMovie: (movie: UnifiedMovie) => void;
}

export function MovieContinueWatchingRow({
  movies,
  continueWatching,
  onSelectMovie,
}: MovieContinueWatchingRowProps) {
  const cwMovies = continueWatching.filter((cw) =>
    movies.some((m) => m.stream_id === cw.movieId),
  );
  const inProgress = cwMovies.filter(
    (cw) =>
      cw.durationSeconds <= 0 ||
      cw.progressSeconds / cw.durationSeconds < 0.9,
  );

  if (inProgress.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground mb-3">
        Continue Watching
      </h2>
      <div
        className="flex gap-3 overflow-x-auto pb-2 pr-4 md:pr-0"
        style={{ touchAction: "manipulation" }}
      >
        {inProgress.slice(0, 10).map((cw) => {
          const movie = movies.find((m) => m.stream_id === cw.movieId);
          if (!movie) return null;
          const pct =
            cw.durationSeconds > 0
              ? Math.min(
                  100,
                  (cw.progressSeconds / cw.durationSeconds) * 100,
                )
              : 0;
          return (
            <div
              key={cw.movieId}
              className="shrink-0 w-[120px] group relative"
            >
              <button
                onClick={() => onSelectMovie(movie)}
                className="w-full text-left"
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5">
                  {movie.stream_icon ? (
                    <img
                      src={imageUrl(movie.stream_icon)}
                      alt={movie.name ? `${movie.name} poster` : ""}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                      <Film className="h-6 w-6 text-white/10" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
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
}
