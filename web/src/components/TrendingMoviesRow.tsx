import { Film, Star } from "lucide-react";
import { tmdbImgProps } from "@/lib/api";
import ContentRow from "@/components/ContentRow";
import type { TmdbMovieResult, UnifiedMovie } from "@/lib/types";

interface TrendingMoviesRowProps {
  trending: TmdbMovieResult[];
  movies: UnifiedMovie[];
  onSelect: (movie: UnifiedMovie) => void;
}

export default function TrendingMoviesRow({
  trending,
  movies,
  onSelect,
}: TrendingMoviesRowProps) {
  if (trending.length === 0) return null;

  const findMatch = (tmdbId: number, title: string): UnifiedMovie | undefined =>
    movies.find(
      (m) =>
        m.tmdb === String(tmdbId) ||
        m.name.toLowerCase().includes(title.toLowerCase().slice(0, 20)),
    );

  return (
    <div>
      <ContentRow title="Trending This Week" itemCount={trending.length}>
        {trending.map((t, idx) => {
          const posterProps = t.poster_path
            ? tmdbImgProps(t.poster_path)
            : null;
          const year = t.release_date ? t.release_date.slice(0, 4) : "";
          return (
            <button
              key={`trending-${t.id}`}
              data-row-idx={idx}
              className="shrink-0 w-[140px] group text-left focus:outline-none"
              onClick={() => {
                const match = findMatch(t.id, t.title);
                if (match) onSelect(match);
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
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
                {t.vote_average > 0 && (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
                    <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                    {t.vote_average.toFixed(1)}
                  </div>
                )}
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
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {year}
                </p>
              )}
            </button>
          );
        })}
      </ContentRow>
    </div>
  );
}
