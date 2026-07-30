import { Play, Clock } from "lucide-react";
import { imageUrl } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import type { Episode } from "@/lib/types";

interface EpisodeCardProps {
  ep: Episode;
  onPlay: (epId: string | number) => void;
  activeSeason: number;
  seasonPosterUrl?: string;
  episodeProgress: Map<
    string,
    { progressSeconds: number; durationSeconds: number }
  >;
}

export default function EpisodeCard({
  ep,
  onPlay,
  activeSeason,
  seasonPosterUrl,
  episodeProgress,
}: EpisodeCardProps) {
  const progressKey = `${ep.info?.season ?? activeSeason}:${ep.episode_num}`;
  const prog = episodeProgress.get(progressKey);
  const pct =
    prog && prog.durationSeconds > 0
      ? Math.min(100, (prog.progressSeconds / prog.durationSeconds) * 100)
      : 0;

  return (
    <button
      key={ep.id}
      onClick={() => onPlay(ep.id)}
      className="group flex gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left w-full"
      aria-label={`${ep.title || `Episode ${ep.episode_num}`}${ep.info?.duration_secs ? `, ${formatDuration(ep.info.duration_secs)}` : ""}`}
    >
      <div className="w-[140px] sm:w-[160px] shrink-0 aspect-video bg-[#141420] rounded-lg overflow-hidden relative">
        {ep.info?.movie_image ? (
          <img
            src={imageUrl(ep.info.movie_image)}
            alt={ep.title || `Episode ${ep.episode_num}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : seasonPosterUrl ? (
          <div
            className="w-full h-full bg-cover bg-center"
            style={{ backgroundImage: `url(${seasonPosterUrl})` }}
          >
            <div className="w-full h-full bg-black/40 flex items-center justify-center">
              <Play className="h-6 w-6 text-white/20" />
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="h-6 w-6 text-white/10" />
          </div>
        )}
        {/* Episode number badge */}
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 text-[10px] font-bold text-white/90 rounded">
          E{String(ep.episode_num).padStart(2, "0")}
        </span>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <Play className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
        {ep.info?.duration_secs && (
          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/80 text-[10px] font-medium text-white/90 rounded">
            {formatDuration(ep.info.duration_secs)}
          </span>
        )}
        {/* Progress / watched indicator */}
        {prog && pct >= 90 ? (
          <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-green-500/80 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">✓</span>
          </div>
        ) : prog ? (
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
            <div
              className="h-full bg-primary/70"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>
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
  );
}
