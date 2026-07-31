import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import { Play, Heart } from "lucide-react";
import { api } from "@/lib/api";
import { Series, SeriesDetails, Episode } from "@/lib/types";
import MediaOverlay from "@/components/MediaOverlay";
import SimilarSeries from "@/components/SimilarSeries";
import TmdbSimilarShows from "@/components/TmdbSimilarShows";
import SeasonSelector from "@/components/SeasonSelector";
import EpisodeCard from "@/components/EpisodeCard";
import { isSeriesInWatchlist, toggleSeriesWatchlist } from "@/lib/watchlist";
import { getSeriesProgress } from "@/lib/continueWatching";
import { MediaCastSection } from "@/components/media/MediaCastSection";
import { MediaInfoBar } from "@/components/media/MediaInfoBar";

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
  const [inWatchlist, setInWatchlist] = useState(() =>
    isSeriesInWatchlist(series.series_id),
  );

  // ── Episode progress (from localStorage) ────────────────────────
  const [episodeProgress] = useState(() => getSeriesProgress(series.series_id));

  // ── Compute watched count per season for season tab badges ──────
  const seasonWatched = useMemo(() => {
    const counts = new Map<number, number>();
    for (const [key, prog] of episodeProgress) {
      if (
        prog.durationSeconds > 0 &&
        (prog.progressSeconds / prog.durationSeconds) * 100 >= 90
      ) {
        const season = parseInt(key.split(":")[0], 10);
        if (!isNaN(season)) {
          counts.set(season, (counts.get(season) || 0) + 1);
        }
      }
    }
    return counts;
  }, [episodeProgress]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Fetch provider details + TMDB enrichment in parallel
    const providerPromise = api.series.details(series.series_id);
    const tmdbPromise = tmdbId
      ? api.tmdb.tv.details(tmdbId).catch(() => null)
      : Promise.resolve(null);

    Promise.all([providerPromise, tmdbPromise])
      .then(([providerData, tmdbData]) => {
        if (cancelled) return;

        // Process provider data
        const info = providerData.info;
        const episodes = providerData.episodes;
        if (info && episodes) {
          setDetails(providerData);
          const seasonKeys = Object.keys(episodes)
            .map(Number)
            .sort((a, b) => a - b);
          if (seasonKeys.length > 0) setActiveSeason(seasonKeys[0]);
        } else {
          setError("No episode data available");
        }

        // Process TMDB enrichment
        if (tmdbData && tmdbData.enabled && tmdbData.info) {
          const raw = tmdbData.info;
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
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [series.series_id, tmdbId]);

  const info = details?.info;
  const seasons = details?.seasons || [];
  const episodeList: Episode[] =
    details?.episodes?.[String(activeSeason)] || [];

  // Use TMDB data to enrich when provider data is thin
  const bannerUrl =
    info?.backdrop_path?.[0] ||
    (tmdb?.backdrop_path
      ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
      : "") ||
    series.cover ||
    seasons.find((s) => s.season_number === activeSeason)?.cover_big ||
    "";
  const posterUrl =
    series.cover ||
    info?.cover ||
    (tmdb?.poster_path
      ? `https://image.tmdb.org/t/p/w600${tmdb.poster_path}`
      : "") ||
    "";
  const rating =
    series.rating ||
    info?.rating ||
    (tmdb?.vote_average ? tmdb.vote_average.toFixed(1) : "") ||
    "";
  const year = (
    tmdb?.first_air_date ||
    info?.releaseDate ||
    series.releaseDate ||
    ""
  ).slice(0, 4);

  // Merge provider and TMDB genres
  const providerGenres = series.genre || info?.genre || "";
  const providerGenreList = providerGenres
    ? providerGenres
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
    : [];
  const tmdbGenreNames = tmdb?.genres?.map((g) => g.name) || [];
  const genres = tmdbGenreNames.length > 0 ? tmdbGenreNames : providerGenreList;

  // Prefer TMDB plot when provider plot is empty
  const plot = tmdb?.overview || series.plot || info?.plot || "";
  const cast =
    series.cast ||
    info?.cast ||
    (tmdb?.created_by ? tmdb.created_by.map((c) => c.name).join(", ") : "") ||
    "";
  const director = series.director || info?.director || "";

  // Meta items
  const metaItems: string[] = [];
  if (tmdb?.number_of_seasons)
    metaItems.push(
      `${tmdb.number_of_seasons} season${tmdb.number_of_seasons > 1 ? "s" : ""}`,
    );
  if (tmdb?.number_of_episodes)
    metaItems.push(`${tmdb.number_of_episodes} episodes`);
  if (tmdb?.episode_run_time?.[0]) {
    const mins = tmdb.episode_run_time[0];
    metaItems.push(`${mins}m`);
  }
  if (tmdb?.status) metaItems.push(tmdb.status);
  if (tmdb?.networks?.length)
    metaItems.push(tmdb.networks.map((n) => n.name).join(", "));
  // Fall back to provider season count if TMDB didn't provide it
  if (metaItems.length === 0 && seasons.length > 0) {
    metaItems.push(`${seasons.length} season${seasons.length > 1 ? "s" : ""}`);
  }

  const seasonTabs =
    seasons.length > 0
      ? seasons.map((s) => s.season_number).sort((a, b) => a - b)
      : episodeList.length > 0
        ? Object.keys(details?.episodes || {})
            .map(Number)
            .sort((a, b) => a - b)
        : [1];

  const activeSeasonData = seasons.find(
    (s) => s.season_number === activeSeason,
  );

  // ── Season poster fallback ──────────────────────────────
  const activeTmdbSeason = tmdb?.seasons?.find(
    (s) => s.season_number === activeSeason,
  );
  const seasonPosterUrl =
    activeSeasonData?.cover_big ||
    (activeTmdbSeason?.poster_path
      ? `https://image.tmdb.org/t/p/w342${activeTmdbSeason.poster_path}`
      : "") ||
    "";

  const playEpisode = (epId: string | number) => {
    // Find the episode to get its metadata
    const ep = episodeList.find((e) => String(e.id) === String(epId));
    const epNum = ep?.episode_num || 0;
    const epTitle = ep?.title || `Episode ${epNum || ""}`;
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
          episodeImage: ep?.info?.movie_image || series.cover || "",
          durationSeconds: ep?.info?.duration_secs || 0,
        }),
      );
      // Store the full episode list for auto-advance
      sessionStorage.setItem(
        `stv_series_episodes_${series.series_id}_${activeSeason}`,
        JSON.stringify(
          episodeList.map((e) => ({
            id: e.id,
            episode_num: e.episode_num,
            title: e.title,
          })),
        ),
      );
      // Track which index we're currently playing
      const currentIdx = episodeList.findIndex(
        (e) => String(e.id) === String(epId),
      );
      sessionStorage.setItem(
        `stv_series_current_idx_${series.series_id}`,
        String(currentIdx >= 0 ? currentIdx : 0),
      );
      sessionStorage.setItem(
        `stv_series_active_season_${series.series_id}`,
        String(activeSeason),
      );
    } catch {} // DOMException: storage quota
    navigate(`/watch/series/${series.series_id}/${epId}`);
    onClose();
  };

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => playEpisode(episodeList[0]?.id || 1)}
            disabled={loading || episodeList.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
          >
            <Play className="h-4 w-4 fill-black text-black" />
            Play{" "}
            {episodeList[0]
              ? `S${activeSeason} E${episodeList[0].episode_num}`
              : ""}
          </button>
          <button
            onClick={() => {
              toggleSeriesWatchlist(series.series_id);
              setInWatchlist(!inWatchlist);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-xs sm:text-sm text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
            aria-label={
              inWatchlist ? "Remove from watchlist" : "Add to watchlist"
            }
          >
            <Heart
              className={`h-3.5 w-3.5 ${inWatchlist ? "fill-red-500 text-red-500" : ""}`}
            />
          </button>
        </div>
      }
    >
      {!loading && !error && (
        <>
          {/* Cast & Director */}
          <MediaCastSection cast={cast} director={director} />

          {/* TMDB Link & extra metadata row */}
          <MediaInfoBar
            date={tmdb?.first_air_date}
            duration={
              tmdb?.episode_run_time?.[0]
                ? `${tmdb.episode_run_time[0]}m`
                : undefined
            }
            status={undefined}
            tmdbId={tmdbId ?? undefined}
            mediaType="tv"
            homepage={tmdb?.homepage}
          />

          {/* Season Selector */}
          <SeasonSelector
            seasonTabs={seasonTabs}
            activeSeason={activeSeason}
            onSeasonChange={setActiveSeason}
            seasons={seasons}
            tmdb={tmdb}
            seasonWatched={seasonWatched}
            bodyRef={bodyRef}
          />

          {/* Episode Grid */}
          {episodeList.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-white/80 mb-3">
                Episodes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {episodeList.map((ep) => (
                  <EpisodeCard
                    key={ep.id}
                    ep={ep}
                    onPlay={playEpisode}
                    activeSeason={activeSeason}
                    seasonPosterUrl={seasonPosterUrl}
                    episodeProgress={episodeProgress}
                  />
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

          {/* More Like This */}
          <SimilarSeries
            categoryId={series.category_id}
            currentId={series.series_id}
          />
          {/* TMDB Recommendations */}
          <TmdbSimilarShows tmdbId={tmdbId} />
        </>
      )}
    </MediaOverlay>
  );
}
