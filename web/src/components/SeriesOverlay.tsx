import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Clock,
  Calendar,
  ExternalLink,
  Heart,
} from "lucide-react";
import { api, Series, SeriesDetails, Episode, imageUrl } from "@/lib/api";
import MediaOverlay from "@/components/MediaOverlay";
import SimilarSeries from "@/components/SimilarSeries";
import TmdbSimilarShows from "@/components/TmdbSimilarShows";
import { isSeriesInWatchlist, toggleSeriesWatchlist } from "@/lib/watchlist";
import { getSeriesProgress } from "@/lib/continueWatching";

interface SeriesOverlayProps {
  series: Series;
  onClose: () => void;
}

interface TmdbEnrichment {
  overview?: string;
  backdrop_path?: string;
  poster_path?: string;
  vote_average?: number;
  genres?: { id: number; name: string }[];
  networks?: { name: string; logo_path?: string }[];
  created_by?: { name: string }[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  status?: string;
  homepage?: string;
  first_air_date?: string;
  seasons?: {
    season_number: number;
    episode_count: number;
    air_date?: string;
    poster_path?: string;
    overview?: string;
  }[];
}

export default function SeriesOverlay({ series, onClose }: SeriesOverlayProps) {
  const navigate = useNavigate();
  const [details, setDetails] = useState<SeriesDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);

  // ── TMDB enrichment ──────────────────────────────────────────
  const [tmdb, setTmdb] = useState<TmdbEnrichment | null>(null);
  const tmdbId = series.tmdb ? parseInt(series.tmdb, 10) : null;
  const [inWatchlist, setInWatchlist] = useState(() => isSeriesInWatchlist(series.series_id));

  // ── Episode progress (from localStorage) ────────────────────────
  const [episodeProgress] = useState(() => getSeriesProgress(series.series_id));

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);

    // Fetch provider details + TMDB enrichment in parallel
    const providerPromise = api.series.details(series.series_id);
    const tmdbPromise = tmdbId
      ? api.tmdb.tv.details(tmdbId).catch(() => null)
      : Promise.resolve(null);

    Promise.all([providerPromise, tmdbPromise])
      .then(([providerData, tmdbData]) => {
        if (cancelled) return;

        // Process provider data
        const info = (providerData as any).info;
        const episodes = (providerData as any).episodes;
        if (info && episodes) {
          setDetails(providerData);
          const seasonKeys = Object.keys(episodes).map(Number).sort((a, b) => a - b);
          if (seasonKeys.length > 0) setActiveSeason(seasonKeys[0]);
        } else {
          setError("No episode data available");
        }

        // Process TMDB enrichment
        if (tmdbData && (tmdbData as any).enabled && (tmdbData as any).info) {
          const raw = (tmdbData as any).info;
          setTmdb({
            overview: raw.overview || undefined,
            backdrop_path: raw.backdrop_path || undefined,
            poster_path: raw.poster_path || undefined,
            vote_average: raw.vote_average,
            genres: raw.genres || undefined,
            networks: raw.networks || undefined,
            created_by: raw.created_by || undefined,
            number_of_seasons: raw.number_of_seasons,
            number_of_episodes: raw.number_of_episodes,
            episode_run_time: raw.episode_run_time,
            status: raw.status,
            homepage: raw.homepage,
            first_air_date: raw.first_air_date,
            seasons: raw.seasons || undefined,
          });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [series.series_id, tmdbId]);

  const info = details?.info;
  const seasons = details?.seasons || [];
  const episodeList: Episode[] = details?.episodes?.[String(activeSeason)] || [];

  // Use TMDB data to enrich when provider data is thin
  const bannerUrl =
    info?.backdrop_path?.[0] ||
    (tmdb?.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}` : "") ||
    series.cover ||
    seasons.find((s) => s.season_number === activeSeason)?.cover_big ||
    "";
  const posterUrl = series.cover || info?.cover || (tmdb?.poster_path ? `https://image.tmdb.org/t/p/w600${tmdb.poster_path}` : "") || "";
  const rating = series.rating || info?.rating || (tmdb?.vote_average ? tmdb.vote_average.toFixed(1) : "") || "";
  const year = (tmdb?.first_air_date || info?.releaseDate || series.releaseDate || "").slice(0, 4);

  // Merge provider and TMDB genres
  const providerGenres = series.genre || info?.genre || "";
  const providerGenreList = providerGenres ? providerGenres.split(",").map((g) => g.trim()).filter(Boolean) : [];
  const tmdbGenreNames = tmdb?.genres?.map((g) => g.name) || [];
  const genres = tmdbGenreNames.length > 0 ? tmdbGenreNames : providerGenreList;

  // Prefer TMDB plot when provider plot is empty
  const plot = tmdb?.overview || series.plot || info?.plot || "";
  const cast = series.cast || info?.cast || (tmdb?.created_by ? tmdb.created_by.map((c) => c.name).join(", ") : "") || "";
  const director = series.director || info?.director || "";

  // Meta items
  const metaItems: string[] = [];
  if (tmdb?.number_of_seasons) metaItems.push(`${tmdb.number_of_seasons} season${tmdb.number_of_seasons > 1 ? "s" : ""}`);
  if (tmdb?.number_of_episodes) metaItems.push(`${tmdb.number_of_episodes} episodes`);
  if (tmdb?.episode_run_time?.[0]) {
    const mins = tmdb.episode_run_time[0];
    metaItems.push(`${mins}m`);
  }
  if (tmdb?.status) metaItems.push(tmdb.status);
  if (tmdb?.networks?.length) metaItems.push(tmdb.networks.map((n) => n.name).join(", "));
  // Fall back to provider season count if TMDB didn't provide it
  if (metaItems.length === 0 && seasons.length > 0) {
    metaItems.push(`${seasons.length} season${seasons.length > 1 ? "s" : ""}`);
  }

  const seasonTabs =
    seasons.length > 0
      ? seasons.map((s) => s.season_number).sort((a, b) => a - b)
      : episodeList.length > 0
        ? Object.keys(details?.episodes || {}).map(Number).sort((a, b) => a - b)
        : [1];

  const activeSeasonData = seasons.find((s) => s.season_number === activeSeason);

  // ── Season poster fallback ──────────────────────────────
  // Prefer TMDB season poster over provider cover for the episode grid fallback
  const activeTmdbSeason = tmdb?.seasons?.find((s) => s.season_number === activeSeason);
  const seasonPosterUrl =
    activeSeasonData?.cover_big ||
    (activeTmdbSeason?.poster_path
      ? `https://image.tmdb.org/t/p/w342${activeTmdbSeason.poster_path}`
      : "") ||
    "";

  const formatDuration = (secs?: number) => {
    if (!secs) return "";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const playEpisode = (epId: string | number) => {
    // Find the episode to get its metadata
    const ep = episodeList.find((e) => String(e.id) === String(epId));
    const epNum = ep?.episode_num || 0;
    const epTitle = ep?.title || `Episode ${epNum || ''}`;
    // Save rich series + episode metadata for Continue Watching
    try {
      sessionStorage.setItem(
        `stv_series_meta_${series.series_id}`,
        JSON.stringify({
          name: series.name,
          cover: series.cover,
          seasonNumber: activeSeason,
          episodeNum: epNum,
          episodeTitle: epTitle,
          episodeImage: ep?.info?.movie_image || series.cover || '',
          durationSeconds: ep?.info?.duration_secs || 0,
        })
      );
      // Store the full episode list for auto-advance
      sessionStorage.setItem(
        `stv_series_episodes_${series.series_id}_${activeSeason}`,
        JSON.stringify(
          episodeList.map((e) => ({
            id: e.id,
            episode_num: e.episode_num,
            title: e.title,
          }))
        )
      );
      // Track which index we're currently playing
      const currentIdx = episodeList.findIndex((e) => String(e.id) === String(epId));
      sessionStorage.setItem(
        `stv_series_current_idx_${series.series_id}`,
        String(currentIdx >= 0 ? currentIdx : 0)
      );
      sessionStorage.setItem(
        `stv_series_active_season_${series.series_id}`,
        String(activeSeason)
      );
    } catch {}
    navigate(`/watch/series/${series.series_id}/${epId}`);
    onClose();
  };

  return (
    <MediaOverlay
      onClose={onClose}
      bannerUrl={bannerUrl || undefined}
      posterUrl={posterUrl || undefined}
      title={tmdb?.overview ? (info?.name || series.name) : (info?.name || series.name)}
      genres={genres}
      rating={rating ? Number(rating) : undefined}
      year={year || undefined}
      plot={plot || undefined}
      metaItems={metaItems.length ? metaItems : undefined}
      loading={loading}
      error={error}
      playButton={
        <div className="flex items-center gap-2">
          <button
            onClick={() => playEpisode(episodeList[0]?.id || 1)}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            <Play className="h-4 w-4 fill-black text-black" />
            Play {episodeList[0] ? `S${activeSeason} E${episodeList[0].episode_num}` : ""}
          </button>
          <button
            onClick={() => { toggleSeriesWatchlist(series.series_id); setInWatchlist(!inWatchlist); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-xs sm:text-sm text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
            aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
          >
            <Heart className={`h-3.5 w-3.5 ${inWatchlist ? "fill-red-500 text-red-500" : ""}`} />
          </button>
        </div>
      }
    >
      {!loading && !error && (
        <>
          {/* Cast & Director */}
          {(cast || director) && (
            <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
              {cast && (
                <div>
                  <span className="text-white/30">Cast: </span>
                  <span className="text-white/60">
                    {cast.split(",").map((name, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-white/20">, </span>}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/person/${encodeURIComponent(name.trim())}`);
                          }}
                          className="hover:text-primary transition-colors cursor-pointer inline"
                        >
                          {name.trim()}
                        </button>
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {director && <div><span className="text-white/30">Director: </span><span className="text-white/60">{director}</span></div>}
            </div>
          )}

          {/* TMDB Link & extra metadata row */}
          {tmdbId && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/40">
              {tmdb?.first_air_date && (
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{tmdb.first_air_date}</span>
              )}
              {tmdb?.episode_run_time?.[0] && (
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{tmdb.episode_run_time[0]}m</span>
              )}
              <a
                href={`https://www.themoviedb.org/tv/${tmdbId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-white/70 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />TMDB
              </a>
              {tmdb?.homepage && (
                <a
                  href={tmdb.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-white/70 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />Homepage
                </a>
              )}
            </div>
          )}

          {/* ── Season Selector ─────────────────────────── */}
          {seasonTabs.length > 1 && (
            <div>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none" style={{ touchAction: "manipulation" }}>
                {seasonTabs.map((s) => {
                  const isActive = activeSeason === s;
                  const se = seasons.find((sn) => sn.season_number === s);
                  return (
                    <button
                      key={s}
                      onClick={() => { setActiveSeason(s); bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        isActive ? "bg-white text-black" : "bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {(se?.cover_big || (tmdb?.seasons?.find((ts) => ts.season_number === s)?.poster_path ? `https://image.tmdb.org/t/p/w92${tmdb?.seasons?.find((ts) => ts.season_number === s)?.poster_path}` : "")) && (
                        <img
                          src={se?.cover_big || `https://image.tmdb.org/t/p/w92${tmdb?.seasons?.find((ts) => ts.season_number === s)?.poster_path}`}
                          alt=""
                          className="w-8 h-8 rounded object-cover shrink-0"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      {se?.name || `Season ${s}`}
                      {se?.episode_count ? (
                        <span className={`text-[10px] font-medium ${isActive ? "text-black/40" : "text-white/30"}`}>
                          {se.episode_count}ep
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
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{activeSeasonData.air_date}</span>
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
                        <img src={imageUrl(ep.info.movie_image)} alt={ep.title || `Episode ${ep.episode_num}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : seasonPosterUrl ? (
                        <div className="w-full h-full bg-cover bg-center" style={{backgroundImage: `url(${seasonPosterUrl})`}}>
                          <div className="w-full h-full bg-black/40 flex items-center justify-center">
                            <Play className="h-6 w-6 text-white/20" />
                          </div>
                        </div>
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
                      {/* Progress / watched indicator */}
                      {(() => {
                        const key = `${ep.info?.season ?? activeSeason}:${ep.episode_num}`;
                        const prog = episodeProgress.get(key);
                        if (!prog) return null;
                        const pct = prog.durationSeconds > 0
                          ? Math.min(100, (prog.progressSeconds / prog.durationSeconds) * 100)
                          : 0;
                        if (pct >= 90) {
                          return (
                            <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-green-500/80 flex items-center justify-center">
                              <span className="text-white text-[10px] font-bold">✓</span>
                            </div>
                          );
                        }
                        return (
                          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
                            <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                          </div>
                        );
                      })()}
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

          {/* More Like This */}
          <SimilarSeries categoryId={series.category_id} currentId={series.series_id} />
          {/* TMDB Recommendations */}
          <TmdbSimilarShows tmdbId={tmdbId} />
        </>
      )}
    </MediaOverlay>
  );
}
