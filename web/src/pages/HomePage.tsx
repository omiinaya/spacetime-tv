import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Tv, Film, Tv2, Heart, Star } from "lucide-react";
import ContentRow from "@/components/ContentRow";
import { Skeleton } from "@/components/Skeleton";
import { api, TmdbMovieResult, TmdbTvResult, tmdbImgProps } from "@/lib/api";

export default function HomePage() {
  const navigate = useNavigate();

  // ── TMDB Trending ──────────────────────────────────────────
  const [trendingMovies, setTrendingMovies] = useState<TmdbMovieResult[]>([]);
  const [trendingSeries, setTrendingSeries] = useState<TmdbTvResult[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.tmdb.trending("week", 1),
      api.tmdb.tv.trending("week", 1),
    ]).then(([movies, series]) => {
      if (movies.status === "fulfilled") {
        setTrendingMovies(movies.value.trending || []);
      }
      if (series.status === "fulfilled") {
        setTrendingSeries(series.value.trending || []);
      }
      setTrendingLoading(false);
    });
  }, []);

  const hasTrending = trendingMovies.length > 0 || trendingSeries.length > 0;

  return (
    <div className="space-y-6 md:space-y-10">
      {/* ── Hero section ─────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Welcome</h1>
        <p className="text-sm text-muted-foreground">
          Browse live TV, movies, series, and more
        </p>
      </div>

      {/* ── Quick Links ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Live TV",
            icon: Tv,
            path: "/live",
            color: "from-blue-500 to-blue-600",
          },
          {
            label: "Movies",
            icon: Film,
            path: "/movies",
            color: "from-purple-500 to-purple-600",
          },
          {
            label: "Series",
            icon: Tv2,
            path: "/series",
            color: "from-emerald-500 to-emerald-600",
          },
          {
            label: "Watchlist",
            icon: Heart,
            path: "/watchlist",
            color: "from-rose-500 to-rose-600",
          },
        ].map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex items-center gap-3 p-4 md:p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-all hover:translate-y-[-1px] min-h-[56px] md:min-h-0"
          >
            <div
              className={`w-10 h-10 md:w-9 md:h-9 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}
            >
              <item.icon className="h-5 w-5 md:h-4 md:w-4 text-white" />
            </div>
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        ))}
      </div>

      {/* ── Loading state (always show for trending rows) ──────── */}
      {trendingLoading && (
        <div className="space-y-10">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="w-40 h-5" />
              <div className="flex gap-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <Skeleton
                    key={j}
                    className="shrink-0 w-[140px] aspect-[2/3] rounded-lg"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Trending Movies ──────────────────────────────────── */}
      {!trendingLoading && trendingMovies.length > 0 && (
        <section>
          <ContentRow
            title="Trending Movies This Week"
            itemCount={trendingMovies.length}
            action={{ label: "View all →", onClick: () => navigate("/movies") }}
          >
            {trendingMovies.map((t, idx) => {
              const posterProps = t.poster_path
                ? tmdbImgProps(t.poster_path)
                : null;
              const year = t.release_date ? t.release_date.slice(0, 4) : "";
              return (
                <button
                  key={`trending-m-${t.id}`}
                  data-row-idx={idx}
                  className="shrink-0 w-[140px] group text-left focus:outline-none"
                  onClick={() =>
                    navigate(`/movies?q=${encodeURIComponent(t.title)}`)
                  }
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-0 group-focus:ring-2 group-focus:ring-primary/60 transition-all">
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
                        <Film className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                    )}
                    {/* Rating badge */}
                    {t.vote_average > 0 && (
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1 py-0.5 rounded bg-black/60 text-[10px] font-medium">
                        <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />
                        {t.vote_average.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium leading-tight line-clamp-2">
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
        </section>
      )}

      {/* ── Trending Series ──────────────────────────────────── */}
      {!trendingLoading && trendingSeries.length > 0 && (
        <section>
          <ContentRow
            title="Trending Series This Week"
            itemCount={trendingSeries.length}
            action={{ label: "View all →", onClick: () => navigate("/series") }}
          >
            {trendingSeries.map((t, idx) => {
              const posterProps = t.poster_path
                ? tmdbImgProps(t.poster_path)
                : null;
              const year = t.first_air_date ? t.first_air_date.slice(0, 4) : "";
              return (
                <button
                  key={`trending-tv-${t.id}`}
                  data-row-idx={idx}
                  className="shrink-0 w-[140px] group text-left focus:outline-none"
                  onClick={() =>
                    navigate(`/series?q=${encodeURIComponent(t.name)}`)
                  }
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-0 group-focus:ring-2 group-focus:ring-primary/60 transition-all">
                    {posterProps ? (
                      <img
                        {...posterProps}
                        alt={`${t.name} poster`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                        <Tv2 className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                    )}
                    {t.vote_average > 0 && (
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1 py-0.5 rounded bg-black/60 text-[10px] font-medium">
                        <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />
                        {t.vote_average.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium leading-tight line-clamp-2">
                    {t.name}
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
        </section>
      )}

      {/* ── Empty state (no data at all) ─────────────────────── */}
      {!trendingLoading && !hasTrending && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="h-12 w-12 text-muted-foreground/15 mb-4" />
          <p className="text-sm text-muted-foreground">
            Welcome to Spacetime-TV
          </p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Start watching from Live TV, Movies, or Series
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-6 w-full sm:w-auto px-4 sm:px-0">
            <button
              onClick={() => navigate("/live")}
              className="w-full sm:w-auto px-5 py-3 sm:px-4 sm:py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors text-center"
            >
              Browse Live TV
            </button>
            <button
              onClick={() => navigate("/movies")}
              className="w-full sm:w-auto px-5 py-3 sm:px-4 sm:py-2 rounded-lg bg-card border border-border text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              Browse Movies
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom padding for scroll comfort ────────────────── */}
      <div className="h-8" />
    </div>
  );
}
