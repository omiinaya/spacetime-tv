import { Calendar } from "lucide-react";

interface SeasonData {
  season_number: number;
  episode_count?: string | number;
  name?: string;
  cover_big?: string;
  air_date?: string;
  overview?: string;
}

interface TmdbSeason {
  season_number: number;
  episode_count: number;
  air_date?: string;
  poster_path?: string;
  overview?: string;
}

interface TmdbEnrichment {
  seasons?: TmdbSeason[];
}

interface SeasonSelectorProps {
  seasonTabs: number[];
  activeSeason: number;
  onSeasonChange: (season: number) => void;
  seasons: SeasonData[];
  tmdb: TmdbEnrichment | null;
  seasonWatched: Map<number, number>;
  /** Ref to scroll back to top when season changes */
  bodyRef: React.RefObject<HTMLDivElement | null>;
}

export default function SeasonSelector({
  seasonTabs,
  activeSeason,
  onSeasonChange,
  seasons,
  tmdb,
  seasonWatched,
  bodyRef,
}: SeasonSelectorProps) {
  if (seasonTabs.length <= 1) return null;

  const activeSeasonData = seasons.find(
    (s) => s.season_number === activeSeason,
  );
  const activeTmdbSeason = tmdb?.seasons?.find(
    (s) => s.season_number === activeSeason,
  );

  return (
    <div>
      <div
        className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none"
        style={{ touchAction: "manipulation" }}
      >
        {seasonTabs.map((s) => {
          const isActive = activeSeason === s;
          const se = seasons.find((sn) => sn.season_number === s);
          const tmdbSeason = tmdb?.seasons?.find(
            (ts) => ts.season_number === s,
          );
          const posterImg =
            se?.cover_big ||
            (tmdbSeason?.poster_path
              ? `https://image.tmdb.org/t/p/w92${tmdbSeason.poster_path}`
              : "");

          return (
            <button
              key={s}
              onClick={() => {
                onSeasonChange(s);
                bodyRef.current?.scrollTo({
                  top: 0,
                  behavior: "smooth",
                });
              }}
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-white text-black"
                  : "bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10"
              }`}
            >
              {posterImg && (
                <img
                  src={posterImg}
                  alt=""
                  className="w-8 h-8 rounded object-cover shrink-0"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              {se?.name || `Season ${s}`}
              {se?.episode_count ? (
                <span
                  className={`text-[10px] font-medium ${isActive ? "text-black/40" : "text-white/30"}`}
                >
                  {se.episode_count}ep
                  {(seasonWatched.get(s) || 0) > 0 && (
                    <span className="ml-1 text-green-500/70">
                      ✓{seasonWatched.get(s)}
                    </span>
                  )}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {activeSeasonData && (
        <div className="text-xs text-white/40 space-y-2 mt-2">
          <div className="flex items-center gap-4">
            {activeSeasonData.air_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {activeSeasonData.air_date}
              </span>
            )}
            {activeSeasonData.episode_count && (
              <span>{activeSeasonData.episode_count} episodes</span>
            )}
          </div>
          {activeTmdbSeason?.overview && (
            <p className="text-xs text-white/40 leading-relaxed max-w-2xl line-clamp-3">
              {activeTmdbSeason.overview}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
