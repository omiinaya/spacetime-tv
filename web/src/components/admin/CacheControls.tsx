import { useState } from "react";
import { Database, Trash2, RefreshCw, RotateCcw, Loader2 } from "lucide-react";

interface CacheControlsProps {
  headers: Record<string, string>;
  onRefresh: () => void;
}

export default function CacheControls({ headers, onRefresh }: CacheControlsProps) {
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);

  const post = async (url: string, doneMsg: string) => {
    setCacheMsg("Working…");
    try {
      const r = await fetch(url, { method: "POST", headers });
      const d = await r.json();
      setCacheMsg(d.message || doneMsg);
      setTimeout(() => setCacheMsg(null), 3000);
      onRefresh();
    } catch {
      setCacheMsg("Failed");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Database className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Cache Controls</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => post("/api/admin/cache/clear", "Cache cleared")}
          disabled={!!cacheMsg}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-destructive/20 hover:text-destructive transition-colors disabled:opacity-50"
        >
          {cacheMsg === "Working…" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Clear Cache
        </button>
        <button
          onClick={() => post("/api/admin/cache/warm", "Warming started")}
          disabled={!!cacheMsg}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50"
        >
          {cacheMsg === "Working…" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Warm Cache
        </button>
        <button
          onClick={() => post("/api/admin/cache/warm-full", "Full re-warm started")}
          disabled={!!cacheMsg}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-amber-500/20 hover:text-amber-400 transition-colors disabled:opacity-50"
        >
          {cacheMsg === "Working…" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Full Rewarm
        </button>
        {cacheMsg && (
          <span className="flex items-center text-xs text-muted-foreground ml-2">
            {cacheMsg}
          </span>
        )}
      </div>
    </div>
  );
}
