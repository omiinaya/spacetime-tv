import { Radio, Loader2 } from "lucide-react";
import type { GuideSearchResult } from "@/lib/types";

interface EpgSearchResultsProps {
  results: GuideSearchResult[] | null;
  loading: boolean;
  query: string;
}

export default function EpgSearchResults({
  results,
  loading,
  query,
}: EpgSearchResultsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">
          EPG Programmes ({results?.length ?? 0})
        </h2>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      {loading && results === null && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loading &&
        (!results || results.length === 0) &&
        query.trim().length >= 2 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Radio className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">
              No EPG programmes found for &quot;{query}&quot;
            </p>
          </div>
        )}
      {results && results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((prog, i) => {
            const startTime = new Date(prog.start_ts * 1000);
            const stopTime = new Date(prog.stop_ts * 1000);
            const fmtTime = (d: Date) =>
              d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const mins = Math.round(prog.duration / 60);
            return (
              <div
                key={`${prog.channel_id}-${prog.start_ts}-${i}`}
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
              >
                <div className="shrink-0 w-20 text-right">
                  <p className="text-xs font-medium tabular-nums">
                    {fmtTime(startTime)}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {fmtTime(stopTime)}
                  </p>
                  <p className="text-[9px] text-muted-foreground/50 tabular-nums">
                    {mins}m
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-tight truncate">
                    {prog.title}
                  </p>
                  {prog.subtitle && (
                    <p className="text-[10px] text-muted-foreground italic truncate">
                      {prog.subtitle}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                    {prog.channel_name}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
