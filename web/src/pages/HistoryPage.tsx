import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tv, Clock, Trash2, History } from "lucide-react";
import { getRecentChannels, clearRecentChannels, type RecentChannel } from "@/lib/recentChannels";
import { timeAgo } from "@/lib/utils";

export default function HistoryPage() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<RecentChannel[]>([]);

  useEffect(() => {
    setChannels(getRecentChannels());
  }, []);

  const handleClear = () => {
    clearRecentChannels();
    setChannels([]);
  };

  const hasChannels = channels.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">History</h1>
        </div>
        {hasChannels && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </div>

      {!hasChannels && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Clock className="h-12 w-12 text-muted-foreground/15 mb-4" />
          <p className="text-sm text-muted-foreground">No watch history yet</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Channels you watch will appear here
          </p>
          <button
            onClick={() => navigate("/live")}
            className="mt-6 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            Browse Live TV
          </button>
        </div>
      )}

      {hasChannels && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {channels.map((ch) => (
            <button
              key={`history-${ch.stream_id}`}
              onClick={() => navigate(`/watch/live/${ch.stream_id}`)}
              data-watch-link
              className="bg-card rounded-lg border border-border p-3 text-left hover:border-primary/30 transition-all hover:translate-y-[-1px]"
            >
              {ch.icon ? (
                <img
                  src={`/api/iptv/${ch.icon.replace("http://", "").replace("https://", "")}`}
                  alt={`${ch.name} logo`}
                  className="w-full h-10 object-contain mb-2 rounded opacity-80"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-full h-10 bg-muted rounded mb-2 flex items-center justify-center">
                  <Tv className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
              <p className="text-xs font-medium leading-tight line-clamp-1">{ch.name}</p>
              {ch.watchedAt && (
                <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(ch.watchedAt)}</p>
              )}
              </button>
          ))}
        </div>
      )}

      <div className="h-8" />
    </div>
  );
}
