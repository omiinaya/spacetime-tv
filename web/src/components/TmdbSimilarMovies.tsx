import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, TmdbMovieResult, imageUrl, tmdbImgProps } from "@/lib/api";
import { Film, Star } from "lucide-react";

interface TmdbSimilarMoviesProps {
  tmdbId: number | null;
}

export default function TmdbSimilarMovies({ tmdbId }: TmdbSimilarMoviesProps) {
  const navigate = useNavigate();
  const [movies, setMovies] = useState<TmdbMovieResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tmdbId) {
      setMovies([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.tmdb.similar(tmdbId, 1).then((d) => {
      if (!cancelled) {
        setMovies((d.results || []).slice(0, 12));
      }
    }).catch(() => {
      if (!cancelled) setMovies([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tmdbId]);

  if (!tmdbId) return null;
  if (!loading && movies.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-white/50 mb-3">
        {loading ? "TMDB Recommendations…" : "TMDB Recommendations"}
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ touchAction: "manipulation" }}>
        {loading ? (
          // Skeleton placeholders
          Array.from({ length: 6 }).map((_, i) => (
            <div key={`skel-${i}`} className="shrink-0 w-[110px]">
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1e1e30] animate-pulse mb-1.5" />
              <div className="h-3 bg-[#1e1e30] rounded animate-pulse w-3/4" />
            </div>
          ))
        ) : (
          movies.map((m) => {
            const posterProps = m.poster_path ? tmdbImgProps(m.poster_path, "w185", "(max-width: 640px) 185px, 342px") : null;
            const year = m.release_date ? m.release_date.slice(0, 4) : "";
            return (
              <button
                key={m.id}
                onClick={() => navigate(`/movies?q=${encodeURIComponent(m.title)}`)}
                className="shrink-0 w-[110px] group text-left focus:outline-none"
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-0 group-focus:ring-2 group-focus:ring-primary/60 transition-all">
                  {posterProps ? (
                    <img
                      {...posterProps}
                      alt={`${m.title} poster`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                      <Film className="h-5 w-5 text-white/10" />
                    </div>
                  )}
                  {m.vote_average > 0 && (
                    <span className="absolute bottom-1.5 left-1.5 text-[10px] font-medium text-white/80 flex items-center gap-0.5">
                      <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                      {m.vote_average.toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                  {m.title}
                </p>
                {year && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{year}</p>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
