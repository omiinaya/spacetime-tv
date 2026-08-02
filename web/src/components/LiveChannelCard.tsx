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
    <div
      key={stream.stream_id}
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/watch/live/${stream.stream_id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/watch/live/${stream.stream_id}`);
        }
      }}
      data-watch-link
      aria-label={`Watch ${stream.name}`}
      className="channel-card bg-card rounded-xl border border-border p-5 text-left hover:border-primary/30 relative group/card transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 cursor-pointer"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(stream.stream_id);
        }}
        className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 transition-all duration-200 p-1 rounded-md hover:bg-black/30"
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star
          className={`h-4 w-4 ${isFavorite ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/40"}`}
        />
      </button>
      {stream.num > 0 && (
        <span className="absolute top-2.5 left-2.5 z-10 text-[9px] font-mono font-semibold text-muted-foreground/40 bg-black/40 px-1.5 py-0.5 rounded-md">
          {stream.num}
        </span>
      )}
      {stream.tv_archive === 1 && (
        <span className="absolute top-2.5 right-9 z-10 text-[8px] font-semibold text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
          ARCH
        </span>
      )}
      {stream.stream_icon ? (
        <img
          src={`/api/iptv/${stream.stream_icon.replace("http://", "").replace("https://", "")}`}
          alt={stream.name ? `${stream.name} logo` : ""}
          className="w-full h-14 object-contain mb-3 rounded opacity-80 group-hover/card:opacity-100 transition-opacity"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-full h-14 bg-muted rounded-xl mb-3 flex items-center justify-center">
          <Tv className="h-5 w-5 text-muted-foreground/30" />
        </div>
      )}
      <p className="text-xs font-medium leading-tight line-clamp-2 group-hover/card:text-primary transition-colors">
        {stream.name}
      </p>
      {(() => {
        // Call once per render — previously called twice, and each call
        // traversed the programmes Map with a fresh closure.
        const nowPlaying = getNowPlaying(stream.stream_id);
        return nowPlaying ? (
          <p className="text-[10px] text-muted-foreground/50 mt-1.5 truncate leading-tight">
            {nowPlaying}
          </p>
        ) : null;
      })()}
    </div>
  );
}
