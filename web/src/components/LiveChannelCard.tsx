import { Star, Tv } from "lucide-react";
import { useNavigate } from "react-router";
import type { LiveStream } from "@/lib/types";

export default function LiveChannelCard({
  stream,
  isFavorite,
  onToggleFavorite,
  getNowPlaying,
}: {
  stream: LiveStream;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
  getNowPlaying: (id: number) => string | null;
}) {
  const navigate = useNavigate();

  return (
    <button
      key={stream.stream_id}
      onClick={() => navigate(`/watch/live/${stream.stream_id}`)}
      data-watch-link
      className="channel-card bg-card rounded-lg border border-border p-3 text-left hover:border-primary/30 relative group/card"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(stream.stream_id);
        }}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover/card:opacity-100 transition-opacity"
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star
          className={`h-3.5 w-3.5 ${isFavorite ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/40"}`}
        />
      </button>
      {stream.num > 0 && (
        <span className="absolute top-2 left-2 z-10 text-[9px] font-mono font-semibold text-muted-foreground/40 bg-black/40 px-1 py-0.5 rounded">
          {stream.num}
        </span>
      )}
      {stream.tv_archive === 1 && (
        <span className="absolute top-2 right-8 z-10 text-[8px] font-semibold text-blue-300 bg-blue-500/20 px-1 py-0.5 rounded uppercase tracking-wider">
          ARCH
        </span>
      )}
      {stream.stream_icon ? (
        <img
          src={`/api/iptv/${stream.stream_icon.replace("http://", "").replace("https://", "")}`}
          alt={stream.name ? `${stream.name} logo` : ""}
          className="w-full h-12 object-contain mb-2 rounded opacity-80"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-full h-12 bg-muted rounded mb-2 flex items-center justify-center">
          <Tv className="h-4 w-4 text-muted-foreground/40" />
        </div>
      )}
      <p className="text-xs font-medium leading-tight line-clamp-2">
        {stream.name}
      </p>
      {getNowPlaying(stream.stream_id) && (
        <p className="text-[9px] text-muted-foreground/50 mt-0.5 truncate leading-tight">
          {getNowPlaying(stream.stream_id)}
        </p>
      )}
    </button>
  );
}
