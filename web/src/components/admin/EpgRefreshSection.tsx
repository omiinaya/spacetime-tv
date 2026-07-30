import { useState } from "react";
import { Wifi, RefreshCw, Loader2 } from "lucide-react";

interface EpgRefreshSectionProps {
  headers: Record<string, string>;
  epgAge: number | null;
  onRefresh: () => void;
}

export default function EpgRefreshSection({
  headers,
  epgAge,
  onRefresh,
}: EpgRefreshSectionProps) {
  const [epgMsg, setEpgMsg] = useState<string | null>(null);
  const [epgRefreshing, setEpgRefreshing] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Wifi className="h-4 w-4 text-green-400" />
        <h2 className="text-sm font-semibold">EPG Guide</h2>
      </div>
      <div className="bg-card border border-border rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Last refresh:{" "}
            {epgAge != null ? `${Math.round(epgAge)}s ago` : "Never"}
          </div>
          <button
            onClick={async () => {
              setEpgRefreshing(true);
              setEpgMsg(null);
              try {
                const r = await fetch("/api/admin/epg/refresh", {
                  method: "POST",
                  headers,
                });
                const d = await r.json();
                setEpgMsg(d.message || "EPG refresh triggered");
                setTimeout(() => setEpgMsg(null), 3000);
                onRefresh();
              } catch {
                setEpgMsg("Failed to trigger refresh");
              } finally {
                setEpgRefreshing(false);
              }
            }}
            disabled={epgRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-green-500/20 hover:text-green-400 transition-colors disabled:opacity-50"
          >
            {epgRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh EPG Now
          </button>
        </div>
        {epgMsg && (
          <span className="flex items-center text-xs text-muted-foreground">
            {epgMsg}
          </span>
        )}
      </div>
    </div>
  );
}
