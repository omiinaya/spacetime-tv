import { useEffect, useState } from "react";
import { Star, Tv2 } from "lucide-react";
import { api, TmdbTvResult, tmdbImgProps } from "@/lib/api";
import ContentRow from "@/components/ContentRow";

export default function TrendingSeriesRow() {
  const [trending, setTrending] = useState<TmdbTvResult[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingEnabled, setTrendingEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    api.tmdb.tv.trending("week", 1).then((res) => {
      if (cancelled) return;
      setTrending(res.trending || []);
      setTrendingEnabled(res.enabled);
      setTrendingLoading(false);
    }).catch(() => { if (!cancelled) setTrendingLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (trendingLoading || !trendingEnabled || trending.length === 0) return null;

  return (
    <div>
      <ContentRow title="Trending This Week" itemCount={trending.length}>
        {trending.map((t, idx) => {
          const posterProps = t.poster_path ? tmdbImgProps(t.poster_path) : null;
          const year = t.first_air_date ? t.first_air_date.slice(0, 4) : "";
          return (
            <button key={`trending-${t.id}-${idx}`}
              onClick={() => window.location.href = `/search?q=${encodeURIComponent(t.name)}`}
              className="group shrink-0 w-[170px] sm:w-[185px] flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 text-left focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <div className="relative w-full aspect-[2/3] bg-muted overflow-hidden">
                {posterProps ? (
                  <img {...posterProps} alt={`${t.name} poster`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                    <Tv2 className="h-8 w-8 text-white/10" />
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
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">{year}</div>
                )}
              </div>
              <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">{t.name}</p>
              {year && <p className="text-[10px] text-muted-foreground mt-0.5">{year}</p>}
            </button>
          );
        })}
      </ContentRow>
    </div>
  );
}
