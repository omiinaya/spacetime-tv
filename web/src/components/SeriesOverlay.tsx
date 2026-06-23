import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Clock,
  Calendar,
} from "lucide-react";
import { api, Series, SeriesDetails, Episode, imageUrl } from "@/lib/api";
import MediaOverlay from "@/components/MediaOverlay";

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
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    api.series.details(series.series_id).then((d) => {
      if (cancelled) return;
      const info = (d as any).info;
      const episodes = (d as any).episodes;
      if (info && episodes) {
        setDetails(d);
        const seasonKeys = Object.keys(episodes).map(Number).sort((a, b) => a - b);
        if (seasonKeys.length > 0) setActiveSeason(seasonKeys[0]);
      } else {
        setError("No episode data available");
      }
    }).catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [series.series_id]);

  const info = details?.info;
  const seasons = details?.seasons || [];
  const episodeList: Episode[] = details?.episodes?.[String(activeSeason)] || [];

  const bannerUrl =
    info?.backdrop_path?.[0] ||
    series.cover ||
    seasons.find((s) => s.season_number === activeSeason)?.cover_big ||
    "";
  const posterUrl = series.cover || info?.cover || "";
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

  const activeSeasonData = seasons.find((s) => s.season_number === activeSeason);

  const formatDuration = (secs?: number) => {
    if (!secs) return "";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const playEpisode = (epId: string | number) => {
    // Save series metadata for Continue Watching
    try {
      sessionStorage.setItem(
        `stv_series_meta_${series.series_id}`,
        JSON.stringify({
          name: series.name,
          cover: series.cover,
        })
      );
    } catch {}
    navigate(`/watch/series/${series.series_id}/${epId}`);
    onClose();
  };

  const metaItems: string[] = [];
  if (seasons.length > 0) metaItems.push(`${seasons.length} season${seasons.length > 1 ? "s" : ""}`);

  return (
    <MediaOverlay
      onClose={onClose}
      bannerUrl={bannerUrl || undefined}
      posterUrl={posterUrl || undefined}
      title={info?.name || series.name}
      genres={genres}
      rating={rating ? Number(rating) : undefined}
      year={year || undefined}
      plot={plot || undefined}
      metaItems={metaItems.length ? metaItems : undefined}
      loading={loading}
      error={error}
      playButton={
        <button
          onClick={() => playEpisode(episodeList[0]?.id || 1)}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
        >
          <Play className="h-4 w-4 fill-black text-black" />
          Play {episodeList[0] ? `S${activeSeason} E${episodeList[0].episode_num}` : ""}
        </button>
      }
    >
      {!loading && !error && (
        <>
          {/* Cast & Director */}
          {(cast || director) && (
            <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
              {cast && <div><span className="text-white/30">Cast: </span><span className="text-white/60">{cast}</span></div>}
              {director && <div><span className="text-white/30">Director: </span><span className="text-white/60">{director}</span></div>}
            </div>
          )}

          {/* ── Season Selector ─────────────────────────── */}
          {seasonTabs.length > 1 && (
            <div>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                {seasonTabs.map((s) => {
                  const isActive = activeSeason === s;
                  const se = seasons.find((sn) => sn.season_number === s);
                  return (
                    <button
                      key={s}
                      onClick={() => { setActiveSeason(s); bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        isActive ? "bg-white text-black" : "bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {se?.name || `Season ${s}`}
                    </button>
                  );
                })}
              </div>
              {activeSeasonData && (
                <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                  {activeSeasonData.air_date && (
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{activeSeasonData.air_date}</span>
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
              <h3 className="text-sm font-semibold text-white/80 mb-3">Episodes</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {episodeList.map((ep) => (
                  <button
                    key={ep.id}
                    onClick={() => playEpisode(ep.id)}
                    className="group flex gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left w-full"
                    aria-label={`${ep.title || `Episode ${ep.episode_num}`}${ep.info?.duration_secs ? `, ${formatDuration(ep.info.duration_secs)}` : ""}`}
                  >
                    <div className="w-[140px] sm:w-[160px] shrink-0 aspect-video bg-[#141420] rounded-lg overflow-hidden relative">
                      {ep.info?.movie_image ? (
                        <img src={imageUrl(ep.info.movie_image)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Play className="h-6 w-6 text-white/10" /></div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Play className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                      </div>
                      {ep.info?.duration_secs && (
                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/80 text-[10px] font-medium text-white/90 rounded">
                          {formatDuration(ep.info.duration_secs)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-white/50 tabular-nums">{ep.episode_num}</span>
                        <span className="text-sm font-medium text-white group-hover:text-white/80 line-clamp-1">
                          {ep.title || `Episode ${ep.episode_num}`}
                        </span>
                      </div>
                      {ep.info?.duration_secs && (
                        <span className="flex items-center gap-1 text-[11px] text-white/30"><Clock className="h-2.5 w-2.5" />{formatDuration(ep.info.duration_secs)}</span>
                      )}
                      {ep.info?.plot && (
                        <p className="text-xs text-white/40 line-clamp-2 mt-1.5 leading-relaxed">{ep.info.plot}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Play className="h-8 w-8 text-white/10 mb-3" />
              <p className="text-sm text-white/30">No episodes for Season {activeSeason}</p>
            </div>
          )}
        </>
      )}
    </MediaOverlay>
  );
}
