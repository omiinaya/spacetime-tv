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
} from "lucide-react";
import { api, Series, SeriesDetails, Episode } from "@/lib/api";

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
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch series details
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.series
      .details(series.series_id)
      .then((d) => {
        if (cancelled) return;
        // Normalize: if info is wrapped in an array, extract it; or in some responses
        // info could be the inner object while seasons/episodes are at top level
        const info = (d as any).info;
        const episodes = (d as any).episodes;
        const seasons = (d as any).seasons;
        if (info && episodes) {
          setDetails(d);
          // Default to first season with episodes
          const seasonKeys = Object.keys(episodes).map(Number).sort((a, b) => a - b);
          if (seasonKeys.length > 0) setActiveSeason(seasonKeys[0]);
        } else if (Array.isArray(d)) {
          setError("No episode data available");
        } else {
          setError("No episode data available");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [series.series_id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    // Lock body scroll
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Click outside to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

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

  const seasonTabs = seasons.length > 0
    ? seasons.map((s) => s.season_number).sort((a, b) => a - b)
    : episodeList.length > 0
      ? Object.keys(details?.episodes || {}).map(Number).sort((a, b) => a - b)
      : [1];

  const formatDuration = (secs?: number) => {
    if (!secs) return "";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      {/* Overlay panel */}
      <div className="relative w-full max-w-[900px] max-h-[90vh] bg-card rounded-xl border border-border overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Banner */}
        <div className="relative shrink-0 h-[220px] sm:h-[320px] bg-muted overflow-hidden">
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-card/90 via-transparent to-transparent" />

          {/* Series info on banner */}
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 flex gap-5 items-end">
            {/* Cover poster */}
            <div className="hidden sm:block w-[140px] shrink-0 rounded-md overflow-hidden border border-border shadow-lg">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt=""
                  className="w-full aspect-[2/3] object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
                  <Play className="h-8 w-8 text-muted-foreground/30" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight line-clamp-2 mb-2">
                {info?.name || series.name}
              </h2>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {rating && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {rating}
                  </span>
                )}
                {year && (
                  <span className="text-xs text-white/60">{year}</span>
                )}
                {genre && (
                  <span className="text-xs text-white/60 truncate max-w-[200px]">
                    {genre}
                  </span>
                )}
                {seasons.length > 0 && (
                  <span className="text-xs text-white/50">
                    {seasons.length} season{seasons.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {plot && (
                <p className="text-sm text-white/80 line-clamp-2 hidden sm:block">
                  {plot}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 sm:p-8 pt-4"
        >
          {/* Plot on mobile */}
          {plot && (
            <p className="text-sm text-muted-foreground mb-4 sm:hidden">
              {plot}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-5 text-xs text-muted-foreground">
            {cast && (
              <div>
                <span className="text-muted-foreground/50">Cast: </span>
                {cast}
              </div>
            )}
            {director && (
              <div>
                <span className="text-muted-foreground/50">Director: </span>
                {director}
              </div>
            )}
          </div>

          {/* Loading / Error states */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Seasons + Episodes */}
          {!loading && !error && (
            <>
              {/* Season tabs */}
              {seasonTabs.length > 1 && (
                <div className="flex items-center gap-1 mb-4 overflow-x-auto scrollbar-none">
                  {seasonTabs.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setActiveSeason(s);
                        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        activeSeason === s
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                      }`}
                    >
                      {seasons.find((se) => se.season_number === s)?.name || `Season ${s}`}
                    </button>
                  ))}
                </div>
              )}

              {/* Active season info */}
              {(() => {
                const active = seasons.find((se) => se.season_number === activeSeason);
                if (!active) return null;
                return (
                  <div className="mb-4 text-xs text-muted-foreground flex items-center gap-3">
                    {active.air_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {active.air_date}
                      </span>
                    )}
                    {active.episode_count && (
                      <span>{active.episode_count} episodes</span>
                    )}
                  </div>
                );
              })()}

              {/* Episode list */}
              {episodeList.length > 0 ? (
                <div className="space-y-1">
                  {episodeList.map((ep) => (
                    <button
                      key={ep.id}
                      onClick={() => {
                        navigate(`/watch/series/${series.series_id}/${ep.id}`);
                        onClose();
                      }}
                      className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-muted/60 transition-colors text-left group/ep"
                    >
                      {/* Episode thumbnail */}
                      <div className="w-[140px] sm:w-[180px] shrink-0 aspect-video bg-muted rounded overflow-hidden relative">
                        {ep.info?.movie_image ? (
                          <img
                            src={ep.info.movie_image}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play className="h-6 w-6 text-muted-foreground/30" />
                          </div>
                        )}
                        {/* Play icon overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover/ep:bg-black/20 transition-colors flex items-center justify-center">
                          <Play className="h-8 w-8 text-white opacity-0 group-hover/ep:opacity-100 transition-opacity drop-shadow" />
                        </div>
                        {/* Duration badge */}
                        {ep.info?.duration_secs && (
                          <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/70 text-[10px] text-white rounded">
                            {formatDuration(ep.info.duration_secs)}
                          </span>
                        )}
                      </div>

                      {/* Episode info */}
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-foreground">
                            {ep.episode_num}
                          </span>
                          <span className="text-sm text-foreground line-clamp-1 font-medium group-hover/ep:text-primary transition-colors">
                            {ep.title || `Episode ${ep.episode_num}`}
                          </span>
                        </div>
                        {ep.info?.duration_secs && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                            <Clock className="h-2.5 w-2.5" />
                            {formatDuration(ep.info.duration_secs)}
                          </span>
                        )}
                        {ep.info?.plot && (
                          <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-1">
                            {ep.info.plot}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Play className="h-8 w-8 text-muted-foreground/20 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No episodes for Season {activeSeason}
                  </p>
                  <button
                    onClick={() => {
                      navigate(`/watch/series/${series.series_id}/1`);
                      onClose();
                    }}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Play from beginning
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
