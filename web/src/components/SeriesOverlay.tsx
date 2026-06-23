import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Play,
  Loader2,
  Star,
  AlertCircle,
  Clock,
  Calendar,
  ChevronDown,
  Plus,
} from "lucide-react";
import { api, Series, SeriesDetails, Episode, imageUrl } from "@/lib/api";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

interface SeriesOverlayProps {
  series: Series;
  onClose: () => void;
}

export default function SeriesOverlay({ series, onClose }: SeriesOverlayProps) {
  const navigate = useNavigate();
  const [details, setDetails] = useState<SeriesDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState(1);
  const [showFullPlot, setShowFullPlot] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Fetch series details
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.series
      .details(series.series_id)
      .then((d) => {
        if (cancelled) return;
        const info = (d as any).info;
        const episodes = (d as any).episodes;
        if (info && episodes) {
          setDetails(d);
          const seasonKeys = Object.keys(episodes)
            .map(Number)
            .sort((a, b) => a - b);
          if (seasonKeys.length > 0) setActiveSeason(seasonKeys[0]);
        } else {
          setError("No episode data available");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [series.series_id]);

  // Lock body scroll + Escape to close
  useLockBodyScroll(onClose);

  // ── Derived ───────────────────────────────────────────────────
  const info = details?.info;
  const seasons = details?.seasons || [];
  const episodeList: Episode[] =
    details?.episodes?.[String(activeSeason)] || [];

  const bannerUrl =
    info?.backdrop_path?.[0] ||
    series.cover ||
    seasons.find((s) => s.season_number === activeSeason)?.cover_big ||
    "";

  const coverUrl = series.cover || info?.cover || "";
  const rating = series.rating || info?.rating || "";
  const year = (info?.releaseDate || series.releaseDate || "").slice(0, 4);
  const genre = series.genre || info?.genre || "";
  const plot = series.plot || info?.plot || "";
  const cast = series.cast || info?.cast || "";
  const director = series.director || info?.director || "";
  const genres = genre ? genre.split(",").map((g) => g.trim()).filter(Boolean) : [];

  const seasonTabs =
    seasons.length > 0
      ? seasons.map((s) => s.season_number).sort((a, b) => a - b)
      : episodeList.length > 0
        ? Object.keys(details?.episodes || {}).map(Number).sort((a, b) => a - b)
        : [1];

  const activeSeasonData = seasons.find(
    (s) => s.season_number === activeSeason
  );

  const formatDuration = (secs?: number) => {
    if (!secs) return "";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const playEpisode = (epId: string | number) => {
    navigate(`/watch/series/${series.series_id}/${epId}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md animate-in fade-in duration-300"
      />

      {/* Modal */}
      <div className="relative w-full sm:max-w-[960px] sm:max-h-[92vh] sm:rounded-2xl bg-[#0a0a0f] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 zoom-in-95 duration-300">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ── Hero Banner ─────────────────────────────────────── */}
        <div className="relative shrink-0 h-[260px] sm:h-[380px] bg-[#141420] overflow-hidden">
          {bannerUrl ? (
            <>
              <img
                src={imageUrl(bannerUrl)}
                alt=""
                className="w-full h-full object-cover opacity-70"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              {/* Gradient overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f]/90 via-transparent to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] to-[#0a0a0f]" />
          )}

          {/* Hero content */}
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10 flex gap-5 items-end">
            {/* Poster */}
            <div className="hidden sm:block w-[150px] shrink-0 rounded-lg overflow-hidden ring-1 ring-white/10 shadow-2xl -mb-2">
              {coverUrl ? (
                <img
                  src={imageUrl(coverUrl)}
                  alt=""
                  className="w-full aspect-[2/3] object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-[#1a1a2e] flex items-center justify-center">
                  <Play className="h-8 w-8 text-white/10" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              {/* Genre tags */}
              {genres.length > 0 && (
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {genres.slice(0, 3).map((g) => (
                    <span
                      key={g}
                      className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-white/10 text-white/80"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-2">
                {info?.name || series.name}
              </h2>

              <div className="flex items-center gap-3 flex-wrap text-sm text-white/70">
                {rating && (
                  <span className="inline-flex items-center gap-1 font-semibold text-yellow-400">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    {rating}
                  </span>
                )}
                {year && <span>{year}</span>}
                {seasons.length > 0 && (
                  <span>
                    {seasons.length} season{seasons.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Play button */}
              <button
                onClick={() => playEpisode(episodeList[0]?.id || 1)}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                <Play className="h-4 w-4 fill-black text-black" />
                Play {episodeList[0] ? `S${activeSeason} E${episodeList[0].episode_num}` : ""}
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto">
          <div className="p-6 sm:px-10 sm:py-6 space-y-5">
            {/* Loading / Error */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-white/30" />
              </div>
            )}
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {!loading && !error && (
              <>
                {/* Plot */}
                {plot && (
                  <div>
                    <p
                      className={`text-sm text-white/60 leading-relaxed ${
                        !showFullPlot && plot.length > 200 ? "line-clamp-2" : ""
                      }`}
                    >
                      {plot}
                    </p>
                    {plot.length > 200 && (
                      <button
                        onClick={() => setShowFullPlot(!showFullPlot)}
                        className="mt-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                      >
                        {showFullPlot ? "Show less" : "Read more"}
                      </button>
                    )}
                  </div>
                )}

                {/* Cast & Director */}
                <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
                  {cast && (
                    <div>
                      <span className="text-white/30">Cast: </span>
                      <span className="text-white/60">{cast}</span>
                    </div>
                  )}
                  {director && (
                    <div>
                      <span className="text-white/30">Director: </span>
                      <span className="text-white/60">{director}</span>
                    </div>
                  )}
                </div>

                {/* ── Season Selector ─────────────────────────── */}
                {seasonTabs.length > 1 && (
                  <div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                      {seasonTabs.map((s) => {
                        const isActive = activeSeason === s;
                        const se = seasons.find(
                          (se) => se.season_number === s
                        );
                        return (
                          <button
                            key={s}
                            onClick={() => {
                              setActiveSeason(s);
                              bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              isActive
                                ? "bg-white text-black"
                                : "bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10"
                            }`}
                          >
                            {se?.name || `Season ${s}`}
                          </button>
                        );
                      })}
                    </div>

                    {/* Season info */}
                    {activeSeasonData && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
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
                    )}
                  </div>
                )}

                {/* ── Episode Grid ────────────────────────────── */}
                {episodeList.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-white/80 mb-3">
                      Episodes
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {episodeList.map((ep) => (
                        <button
                          key={ep.id}
                          onClick={() => playEpisode(ep.id)}
                          className="group flex gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left w-full"
                        >
                          {/* Thumbnail */}
                          <div className="w-[140px] sm:w-[160px] shrink-0 aspect-video bg-[#141420] rounded-lg overflow-hidden relative">
                            {ep.info?.movie_image ? (
                              <img
                                src={imageUrl(ep.info.movie_image)}
                                alt=""
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Play className="h-6 w-6 text-white/10" />
                              </div>
                            )}
                            {/* Hover play overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <Play className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                            </div>
                            {/* Duration */}
                            {ep.info?.duration_secs && (
                              <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/80 text-[10px] font-medium text-white/90 rounded">
                                {formatDuration(ep.info.duration_secs)}
                              </span>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0 py-0.5">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-white/50 tabular-nums">
                                {ep.episode_num}
                              </span>
                              <span className="text-sm font-medium text-white group-hover:text-white/80 line-clamp-1">
                                {ep.title || `Episode ${ep.episode_num}`}
                              </span>
                            </div>
                            {ep.info?.duration_secs && (
                              <span className="flex items-center gap-1 text-[11px] text-white/30">
                                <Clock className="h-2.5 w-2.5" />
                                {formatDuration(ep.info.duration_secs)}
                              </span>
                            )}
                            {ep.info?.plot && (
                              <p className="text-xs text-white/40 line-clamp-2 mt-1.5 leading-relaxed">
                                {ep.info.plot}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Play className="h-8 w-8 text-white/10 mb-3" />
                    <p className="text-sm text-white/30">
                      No episodes for Season {activeSeason}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
