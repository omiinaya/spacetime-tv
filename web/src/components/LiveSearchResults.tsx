import { useNavigate } from "react-router";
import { Tv, Loader2, ChevronDown } from "lucide-react";
import type { LiveStream } from "@/lib/types";
import { channelIconUrl } from "@/lib/api";

interface LiveSearchResultsProps {
  streams: LiveStream[];
  totalCount: number;
  loadingMore: boolean;
  onLoadMore: () => void;
  showLoadMore: boolean;
  getNowPlaying?: (streamId: number) => string | null;
}

export default function LiveSearchResults({
  streams,
  totalCount,
  loadingMore,
  onLoadMore,
  showLoadMore,
  getNowPlaying,
}: LiveSearchResultsProps) {
  const navigate = useNavigate();

  if (streams.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Tv className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Live TV ({streams.length})</h2>
      </div>
      <div className="channel-grid">
        {streams.map((s) => (
          <button
            key={s.stream_id}
            onClick={() => navigate(`/watch/live/${s.stream_id}`)}
            data-watch-link
            className="channel-card bg-card rounded-lg border border-border p-3 text-left hover:border-primary/30"
          >
            {s.stream_icon ? (
              <img
                src={channelIconUrl(s.stream_icon)}
                alt={s.name ? `${s.name} logo` : ""}
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
              {s.name}
            </p>
            {getNowPlaying?.(s.stream_id) && (
              <p className="text-[9px] text-muted-foreground/50 mt-0.5 truncate leading-tight">
                {getNowPlaying(s.stream_id)}
              </p>
            )}
          </button>
        ))}
      </div>
      {/* Load more */}
      {showLoadMore && totalCount > streams.length && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Load more live channels ({streams.length} of {totalCount})
          </button>
        </div>
      )}
    </section>
  );
}
