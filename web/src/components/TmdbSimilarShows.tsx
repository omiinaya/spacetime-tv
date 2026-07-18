import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, TmdbTvResult } from "@/lib/api";
import { Tv2, Star } from "lucide-react";

interface TmdbSimilarShowsProps {
  tmdbId: number | null;
}

export default function TmdbSimilarShows({ tmdbId }: TmdbSimilarShowsProps) {
  const navigate = useNavigate();
  const [shows, setShows] = useState<TmdbTvResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tmdbId) {
      setShows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.tmdb.tv
      .similar(tmdbId, 1)
      .then((d) => {
        if (!cancelled) {
          setShows((d.results || []).slice(0, 12));
        }
      })
      .catch(() => {
        if (!cancelled) setShows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tmdbId]);

  if (!tmdbId) return null;
  if (!loading && shows.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-white/50 mb-3">
        {loading ? "TMDB Recommendations…" : "TMDB Recommendations"}
      </h3>
      <div
        className="flex gap-3 overflow-x-auto pb-2"
        style={{ touchAction: "manipulation" }}
      >
        {loading
          ? // Skeleton placeholders
            Array.from({ length: 6 }).map((_, i) => (
              <div key={`skel-${i}`} className="shrink-0 w-[110px]">
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1e1e30] animate-pulse mb-1.5" />
                <div className="h-3 bg-[#1e1e30] rounded animate-pulse w-3/4" />
              </div>
            ))
          : shows.map((s) => {
              const posterUrl = s.poster_path
                ? `https://image.tmdb.org/t/p/w342${s.poster_path}`
                : "";
              const year = s.first_air_date ? s.first_air_date.slice(0, 4) : "";
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    navigate(`/series?q=${encodeURIComponent(s.name)}`)
                  }
                  className="shrink-0 w-[110px] group text-left focus:outline-none"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-0 group-focus:ring-2 group-focus:ring-primary/60 transition-all">
                    {posterUrl ? (
                      <img
                        src={posterUrl}
                        alt={`${s.name} poster`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                        <Tv2 className="h-5 w-5 text-white/10" />
                      </div>
                    )}
                    {s.vote_average > 0 && (
                      <span className="absolute bottom-1.5 left-1.5 text-[10px] font-medium text-white/80 flex items-center gap-0.5">
                        <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                        {s.vote_average.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                    {s.name}
                  </p>
                  {year && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {year}
                    </p>
                  )}
                </button>
              );
            })}
      </div>
    </div>
  );
}
