import { useEffect, useState, useCallback } from "react";
import {
  Activity, Database, Tv, AlertTriangle, Radio, Clock, BarChart3,
  Trash2, RefreshCw, RotateCcw, Loader2, Search,
} from "lucide-react";

interface AdminStats {
  uptime: number;
  cache: {
    total_entries: number;
    vod_categories: number;
    series_categories: number;
    epg_age: number | null;
  };
  streams: {
    total_hits: number;
    unique_streams: number;
    popular: { stream: string; hits: number }[];
  };
  errors: {
    total: number;
    recent: { ts: number; message: string; path: string }[];
  };
  searches: {
    total: number;
    recent: { ts: number; query: string }[];
  };
  sse_clients: number;
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString();
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/stats");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStats(await r.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh every 30s
  useEffect(() => {
    const i = setInterval(refresh, 30000);
    return () => clearInterval(i);
  }, [refresh]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={refresh} className="px-3 py-1 rounded bg-muted text-sm hover:bg-muted/80">Retry</button>
      </div>
    );
  }

  if (!stats) return null;

  const StatCard = ({ icon: Icon, label, value, sub }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string; value: string | number; sub?: string;
  }) => (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Uptime: {fmtUptime(stats.uptime)} · SSE clients: {stats.sse_clients}
            </p>
          </div>
        </div>
        <button onClick={refresh} className="px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-muted/80 transition-colors">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Database} label="Cache Entries" value={stats.cache.total_entries}
          sub={`${stats.cache.vod_categories} VOD · ${stats.cache.series_categories} series`} />
        <StatCard icon={Tv} label="Stream Hits" value={stats.streams.total_hits.toLocaleString()}
          sub={`${stats.streams.unique_streams} unique streams`} />
        <StatCard icon={Clock} label="EPG Age" value={stats.cache.epg_age != null ? `${Math.round(stats.cache.epg_age)}s` : "N/A"} />
        <StatCard icon={Radio} label="SSE Clients" value={stats.sse_clients} />
      </div>

      {/* Cache Controls */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Cache Controls</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => {
              setCacheMsg("Clearing…");
              try {
                const r = await fetch("/api/admin/cache/clear", { method: "POST" });
                const d = await r.json();
                setCacheMsg(d.message || "Cache cleared");
                refresh();
              } catch { setCacheMsg("Failed"); }
            }}
            disabled={!!cacheMsg}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-destructive/20 hover:text-destructive transition-colors disabled:opacity-50"
          >
            {cacheMsg === "Clearing…" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Clear Cache
          </button>
          <button
            onClick={async () => {
              setCacheMsg("Warming…");
              try {
                const r = await fetch("/api/admin/cache/warm", { method: "POST" });
                const d = await r.json();
                setCacheMsg(d.message || "Warming started");
                setTimeout(() => { setCacheMsg(null); }, 3000);
                refresh();
              } catch { setCacheMsg("Failed"); }
            }}
            disabled={!!cacheMsg}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50"
          >
            {cacheMsg === "Warming…" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Warm Cache
          </button>
          <button
            onClick={async () => {
              setCacheMsg("Full re-warm…");
              try {
                const r = await fetch("/api/admin/cache/warm-full", { method: "POST" });
                const d = await r.json();
                setCacheMsg(d.message || "Full re-warm started");
                setTimeout(() => { setCacheMsg(null); }, 3000);
                refresh();
              } catch { setCacheMsg("Failed"); }
            }}
            disabled={!!cacheMsg}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-amber-500/20 hover:text-amber-400 transition-colors disabled:opacity-50"
          >
            {cacheMsg === "Full re-warm…" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Full Rewarm
          </button>
          {cacheMsg && !cacheMsg.endsWith("…") && (
            <span className="flex items-center text-xs text-muted-foreground ml-2">{cacheMsg}</span>
          )}
        </div>
      </div>

      {/* Popular content */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Popular Content</h2>
        </div>
        {stats.streams.popular.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stream data yet.</p>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-2">Stream</th>
                  <th className="px-4 py-2 text-right">Hits</th>
                </tr>
              </thead>
              <tbody>
                {stats.streams.popular.map((s, i) => (
                  <tr key={s.stream} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                    <td className="px-4 py-2 font-mono text-xs">{s.stream}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.hits.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Error log */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold">
            Recent Errors ({stats.errors.total} total)
          </h2>
        </div>
        {stats.errors.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No errors recorded.</p>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            {stats.errors.recent.map((e, i) => (
              <div key={i} className="px-4 py-2 border-b border-border/30 last:border-0 text-xs">
                <span className="text-muted-foreground">{fmtTime(e.ts)}</span>
                {" — "}
                <span className="text-red-400">{e.message}</span>
                {e.path && <span className="text-muted-foreground/50 ml-2">{e.path}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search queries */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Search className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-semibold">
            Recent Searches ({stats.searches.total} total)
          </h2>
        </div>
        {stats.searches.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No search queries yet.</p>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            {stats.searches.recent.map((s, i) => (
              <div key={i} className="px-4 py-2 border-b border-border/30 last:border-0 text-xs flex items-center gap-2">
                <span className="text-muted-foreground shrink-0 w-16">{fmtTime(s.ts)}</span>
                <span className="font-mono">"{s.query}"</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
