import { useNavigate } from "react-router-dom";
import { Tv, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { ChannelRow } from "@/components/ChannelRow";
import { useSettings } from "@/context/SettingsContext";
import { useGuideData, formatTime } from "@/hooks/useGuideData";

export default function Guide() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const {
    filteredChannels, allData, totalChannels, loading, loadingMore,
    error, sentinelRef, timeSlots, now, nowPct, loadPage,
  } = useGuideData();

  const showEmpty = !loading && filteredChannels.length === 0 && allData.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      {loading ? (
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="w-28 h-5" />
            <Skeleton className="w-44 h-3.5" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Tv className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">TV Guide</h1>
            <p className="text-sm text-muted-foreground">
              {totalChannels.toLocaleString()} channels · showing {filteredChannels.length.toLocaleString()}
              {settings.languages.length > 0 && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {settings.languages.join(", ")}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
          <button
            onClick={() => loadPage(0)}
            className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Timeline Header */}
      {!loading && (
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-2 -mx-0">
          <div className="flex items-end h-8 pl-[200px] pr-4 relative">
            {timeSlots.map((slot, i) => (
              <div key={i} className="flex-1 text-[10px] text-muted-foreground/60 font-medium whitespace-nowrap">
                {formatTime(slot)}
              </div>
            ))}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
              style={{ left: `calc(200px + (100% - 200px) * ${nowPct / 100})` }}
            >
              <div className="absolute -top-1 -left-[11px] bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                LIVE
              </div>
            </div>
          </div>
          <div className="h-px bg-border/50 mx-4" />
        </div>
      )}

      {/* Channel Rows */}
      {loading ? (
        <div className="space-y-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3 px-4 border-b border-border/30">
              <Skeleton className="w-[184px] h-10 rounded-lg shrink-0" />
              <div className="flex gap-2 flex-1 overflow-hidden">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="w-40 h-16 rounded-lg shrink-0" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No channels match your settings</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            {allData.length.toLocaleString()} channels available — adjust filters to see them
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/30 -mx-0">
          {filteredChannels.map((group) => (
            <ChannelRow
              key={group.channel_id}
              group={group}
              now={now}
              onPlay={() => {
                if (group.stream_id) {
                  navigate(`/watch/live/${group.stream_id}`);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Loading more */}
      <div ref={sentinelRef} className="h-1" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && filteredChannels.length === 0 && allData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No EPG data available</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Guide data is loaded from the IPTV provider&apos;s XMLTV feed
          </p>
        </div>
      )}
    </div>
  );
}
