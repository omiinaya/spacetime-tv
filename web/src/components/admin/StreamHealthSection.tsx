import { useEffect, useState, useCallback } from "react";
import { Loader2, Code2, Monitor, Tv } from "lucide-react";

interface StreamHealthData {
  enabled: boolean;
  total_probed: number;
  stale_count: number;
  by_codec: Record<string, number>;
  by_resolution: Record<string, number>;
  by_type: Record<string, number>;
  recent: {
    key: string;
    age_s: number;
    codec: string;
    width: number;
    height: number;
    error: string | null;
  }[];
}

export default function StreamHealthSection({
  headers,
}: {
  headers: Record<string, string>;
}) {
  const [health, setHealth] = useState<StreamHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/stream-health", { headers });
      if (r.ok) setHealth(await r.json());
    } catch {
      /* SyntaxError or network error — silently ignore */
    }
    setLoading(false);
  }, [headers]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  if (!health || !health.enabled) return null;

  const codecColors: Record<string, string> = {
    h264: "text-green-400",
    hevc: "text-blue-400",
    h265: "text-blue-400",
    unknown: "text-yellow-400",
    unavailable: "text-red-400",
    vp9: "text-purple-400",
    av1: "text-cyan-400",
    mpeg2video: "text-orange-400",
  };
  const resColors: Record<string, string> = {
    "4K": "text-yellow-400",
    "1080p": "text-green-400",
    "720p": "text-blue-400",
    "480p": "text-orange-400",
    unknown: "text-muted-foreground",
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Monitor className="h-4 w-4 text-purple-400" />
        <h2 className="text-sm font-semibold">
          Stream Health ({health.total_probed} probed)
        </h2>
        <button
          onClick={fetchHealth}
          className="ml-auto px-2 py-1 rounded bg-muted text-[10px] hover:bg-muted/80 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {/* Codec distribution */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              By Codec
            </span>
          </div>
          <div className="space-y-1">
            {Object.entries(health.by_codec).map(([codec, count]) => (
              <div
                key={codec}
                className="flex items-center justify-between text-xs"
              >
                <span className={codecColors[codec] || "text-muted-foreground"}>
                  {codec}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {count}
                </span>
              </div>
            ))}
            {Object.keys(health.by_codec).length === 0 && (
              <p className="text-xs text-muted-foreground">No data</p>
            )}
          </div>
        </div>

        {/* Resolution distribution */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              By Resolution
            </span>
          </div>
          <div className="space-y-1">
            {Object.entries(health.by_resolution).map(([res, count]) => (
              <div
                key={res}
                className="flex items-center justify-between text-xs"
              >
                <span className={resColors[res] || "text-muted-foreground"}>
                  {res}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {count}
                </span>
              </div>
            ))}
            {Object.keys(health.by_resolution).length === 0 && (
              <p className="text-xs text-muted-foreground">No data</p>
            )}
          </div>
        </div>

        {/* Type distribution */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Tv className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              By Type
            </span>
          </div>
          <div className="space-y-1">
            {Object.entries(health.by_type).map(([type, count]) => (
              <div
                key={type}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground capitalize">
                  {type === "live"
                    ? "Live"
                    : type === "movie"
                      ? "Movies"
                      : type === "series"
                        ? "Series"
                        : type}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {count}
                </span>
              </div>
            ))}
            {Object.keys(health.by_type).length === 0 && (
              <p className="text-xs text-muted-foreground">No data</p>
            )}
          </div>
        </div>
      </div>

      {/* Stale notice */}
      {health.stale_count > 0 && (
        <p className="text-[10px] text-amber-400/70 mb-3">
          {health.stale_count} stale probes (&gt;1h old)
        </p>
      )}

      {/* Recent probes */}
      {health.recent.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] text-muted-foreground uppercase tracking-wider">
                <th className="px-3 py-1.5">Key</th>
                <th className="px-3 py-1.5">Codec</th>
                <th className="px-3 py-1.5">Res</th>
                <th className="px-3 py-1.5">Age</th>
                <th className="px-3 py-1.5">Error</th>
              </tr>
            </thead>
            <tbody>
              {health.recent.map((p) => (
                <tr
                  key={p.key}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                >
                  <td className="px-3 py-1.5 font-mono text-[10px] max-w-[180px] truncate">
                    {p.key}
                  </td>
                  <td className={`px-3 py-1.5 ${codecColors[p.codec] || ""}`}>
                    {p.codec}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {p.width > 0 ? `${p.width}x${p.height}` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {p.age_s < 60
                      ? `${Math.round(p.age_s)}s`
                      : `${Math.round(p.age_s / 60)}m`}
                  </td>
                  <td className="px-3 py-1.5 text-red-400/70 max-w-[160px] truncate">
                    {p.error || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
