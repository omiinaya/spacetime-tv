import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Tv, Film, Tv2, Clock, Trash2, History } from "lucide-react";
import {
  getRecentChannels,
  clearRecentChannels,
  type RecentChannel,
} from "@/lib/recentChannels";
import {
  getContinueWatching,
  getMovieContinueWatching,
  clearAllProgress,
  type SeriesProgress,
  type MovieProgress,
} from "@/lib/continueWatching";

export default function HistoryPage() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<RecentChannel[]>([]);
  const [seriesCW, setSeriesCW] = useState<SeriesProgress[]>([]);
  const [movieCW, setMovieCW] = useState<MovieProgress[]>([]);

  useEffect(() => {
    setChannels(getRecentChannels());
    setSeriesCW(getContinueWatching());
    setMovieCW(getMovieContinueWatching());
  }, []);

  const handleClear = () => {
    clearRecentChannels();
    clearAllProgress();
    setChannels([]);
    setSeriesCW([]);
    setMovieCW([]);
  };

  const hasAny =
    channels.length > 0 || seriesCW.length > 0 || movieCW.length > 0;

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-icon">
          <History className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">History</h1>
        </div>
        {hasAny && (
          <button
            onClick={handleClear}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </div>

      {!hasAny && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Clock className="h-12 w-12 text-muted-foreground/15 mb-4" />
          <p className="text-sm text-muted-foreground">No watch history yet</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Content you watch will appear here
          </p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => navigate("/live")}
              className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
            >
              Browse Live TV
            </button>
            <button
              onClick={() => navigate("/movies")}
              className="px-4 py-2 rounded-lg bg-card border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse Movies
            </button>
          </div>
        </div>
      )}

      {/* ── Recent Channels ────────────────────────────── */}
      {channels.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
            <Tv className="h-3.5 w-3.5 text-muted-foreground" />
            Live Channels
          </h2>
          <div className="channel-grid">
            {channels.map((ch) => (
              <button
                key={`history-ch-${ch.stream_id}`}
                onClick={() => navigate(`/watch/live/${ch.stream_id}`)}
                data-watch-link
                className="channel-card bg-card rounded-xl border border-border p-4 text-left hover:border-primary/30 card-hover"
              >
                {ch.icon ? (
                  <img
                    src={`/api/iptv/${ch.icon.replace("http://", "").replace("https://", "")}`}
                    alt={`${ch.name} logo`}
                    className="w-full h-10 object-contain mb-2 rounded opacity-80"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-10 bg-muted rounded mb-2 flex items-center justify-center">
                    <Tv className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
                <p className="text-xs font-medium leading-tight line-clamp-1">
                  {ch.name}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Continue Watching — Series ──────────────────── */}
      {seriesCW.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Tv2 className="h-3.5 w-3.5 text-muted-foreground" />
            Series
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {seriesCW.map((s) => (
              <button
                key={`history-s-${s.seriesId}-${s.episodeId}`}
                className="shrink-0 w-[150px] group text-left focus:outline-none"
                onClick={() =>
                  navigate(`/watch/series/${s.seriesId}/${s.episodeId}`)
                }
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-0 group-focus:ring-2 group-focus:ring-primary/60 transition-all">
                  {s.cover ? (
                    <img
                      src={s.cover}
                      alt={`${s.seriesName} poster`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                      <Tv2 className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                  {s.durationSeconds > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${Math.min(100, (s.progressSeconds / s.durationSeconds) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs font-medium leading-tight line-clamp-2">
                  {s.seriesName}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  S{s.seasonNumber} · E{s.episodeNum}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Continue Watching — Movies ──────────────────── */}
      {movieCW.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Film className="h-3.5 w-3.5 text-muted-foreground" />
            Movies
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {movieCW.map((m) => (
              <button
                key={`history-m-${m.movieId}`}
                className="shrink-0 w-[150px] group text-left focus:outline-none"
                onClick={() => navigate(`/watch/movie/${m.movieId}`)}
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-0 group-focus:ring-2 group-focus:ring-primary/60 transition-all">
                  {m.poster ? (
                    <img
                      src={m.poster}
                      alt={`${m.movieName} poster`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                      <Film className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                  {m.durationSeconds > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${Math.min(100, (m.progressSeconds / m.durationSeconds) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs font-medium leading-tight line-clamp-2">
                  {m.movieName}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="h-8" />
    </div>
  );
}
