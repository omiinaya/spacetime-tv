import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Database,
  Tv,
  AlertTriangle,
  Radio,
  Clock,
  BarChart3,
  Trash2,
  RefreshCw,
  RotateCcw,
  Loader2,
  Wifi,
  Search,
} from "lucide-react";
import ProviderManagementSection from "@/components/admin/ProviderManagementSection";
import StreamHealthSection from "@/components/admin/StreamHealthSection";

interface AdminStats {
  uptime: number;
  cache: {
    total_entries: number;
    hits: number;
    misses: number;
    hit_rate: number;
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

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function AdminKeyPrompt({
  pendingKey,
  setPendingKey,
  submitKey,
}: {
  pendingKey: string;
  setPendingKey: (k: string) => void;
  submitKey: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
        <span className="text-2xl">🔐</span>
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-base font-semibold">Admin Key Required</h2>
        <p className="text-xs text-muted-foreground">
          Enter the admin key configured in the server's .env file
        </p>
      </div>
      <div className="flex gap-2 w-full max-w-xs">
        <input
          type="password"
          value={pendingKey}
          onChange={(e) => setPendingKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitKey()}
          placeholder="Admin key…"
          autoFocus
          className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-sm outline-none focus:border-amber-500/50 transition-colors"
        />
        <button
          onClick={submitKey}
          disabled={!pendingKey}
          className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50"
        >
          Unlock
        </button>
      </div>
    </div>
  );
}

function CacheControls({
  headers,
  onRefresh,
}: {
  headers: Record<string, string>;
  onRefresh: () => void;
}) {
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);

  return (
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
              const r = await fetch("/api/admin/cache/clear", {
                method: "POST",
                headers,
              });
              const d = await r.json();
              setCacheMsg(d.message || "Cache cleared");
              onRefresh();
            } catch {
              setCacheMsg("Failed");
            }
          }}
          disabled={!!cacheMsg}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-destructive/20 hover:text-destructive transition-colors disabled:opacity-50"
        >
          {cacheMsg === "Clearing…" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Clear Cache
        </button>
        <button
          onClick={async () => {
            setCacheMsg("Warming…");
            try {
              const r = await fetch("/api/admin/cache/warm", {
                method: "POST",
                headers,
              });
              const d = await r.json();
              setCacheMsg(d.message || "Warming started");
              setTimeout(() => setCacheMsg(null), 3000);
              onRefresh();
            } catch {
              setCacheMsg("Failed");
            }
          }}
          disabled={!!cacheMsg}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50"
        >
          {cacheMsg === "Warming…" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Warm Cache
        </button>
        <button
          onClick={async () => {
            setCacheMsg("Full re-warm…");
            try {
              const r = await fetch("/api/admin/cache/warm-full", {
                method: "POST",
                headers,
              });
              const d = await r.json();
              setCacheMsg(d.message || "Full re-warm started");
              setTimeout(() => setCacheMsg(null), 3000);
              onRefresh();
            } catch {
              setCacheMsg("Failed");
            }
          }}
          disabled={!!cacheMsg}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-amber-500/20 hover:text-amber-400 transition-colors disabled:opacity-50"
        >
          {cacheMsg === "Full re-warm…" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Full Rewarm
        </button>
        {cacheMsg && !cacheMsg.endsWith("…") && (
          <span className="flex items-center text-xs text-muted-foreground ml-2">
            {cacheMsg}
          </span>
        )}
      </div>
    </div>
  );
}

function EpgRefreshSection({
  headers,
  epgAge,
  onRefresh,
}: {
  headers: Record<string, string>;
  epgAge: number | null;
  onRefresh: () => void;
}) {
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

function PopularContentTable({
  popular,
}: {
  popular: { stream: string; hits: number }[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Popular Content</h2>
      </div>
      {popular.length === 0 ? (
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
              {popular.map((s, i) => (
                <tr key={s.stream} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                  <td className="px-4 py-2 font-mono text-xs">{s.stream}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {s.hits.toLocaleString()}
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

function ErrorLogSection({
  errors,
  total,
}: {
  errors: { ts: number; message: string; path: string }[];
  total: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <h2 className="text-sm font-semibold">Recent Errors ({total} total)</h2>
      </div>
      {errors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No errors recorded.</p>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
          {errors.map((e, i) => (
            <div
              key={i}
              className="px-4 py-2 border-b border-border/30 last:border-0 text-xs"
            >
              <span className="text-muted-foreground">{fmtTime(e.ts)}</span>
              {" — "}
              <span className="text-red-400">{e.message}</span>
              {e.path && (
                <span className="text-muted-foreground/50 ml-2">{e.path}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentSearchesSection({
  searches,
}: {
  searches: { total: number; recent: { ts: number; query: string }[] };
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Search className="h-4 w-4 text-blue-400" />
        <h2 className="text-sm font-semibold">
          Recent Searches ({searches.total} total)
        </h2>
      </div>
      {searches.recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No search queries yet.</p>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
          {searches.recent.map((s, i) => (
            <div
              key={i}
              className="px-4 py-2 border-b border-border/30 last:border-0 text-xs flex items-center gap-2"
            >
              <span className="text-muted-foreground shrink-0 w-16">
                {fmtTime(s.ts)}
              </span>
              <span className="font-mono">"{s.query}"</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState(
    () => sessionStorage.getItem("adminKey") || "",
  );
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [pendingKey, setPendingKey] = useState("");

  const headers: Record<string, string> = adminKey
    ? { "X-Admin-Key": adminKey }
    : {};

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/stats", { headers });
      if (r.status === 403) {
        setShowKeyPrompt(true);
        throw new Error("Admin key required");
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStats(await r.json());
    } catch (e) {
      if ((e as Error).message !== "Admin key required") {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  const submitKey = () => {
    sessionStorage.setItem("adminKey", pendingKey);
    setAdminKey(pendingKey);
    setShowKeyPrompt(false);
    setPendingKey("");
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh every 30s
  useEffect(() => {
    const i = setInterval(refresh, 30000);
    return () => clearInterval(i);
  }, [refresh]);

  if (showKeyPrompt) {
    return (
      <AdminKeyPrompt
        pendingKey={pendingKey}
        setPendingKey={setPendingKey}
        submitKey={submitKey}
      />
    );
  }

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
        <button
          onClick={refresh}
          className="px-3 py-1 rounded bg-muted text-sm hover:bg-muted/80"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

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
              Uptime: {fmtUptime(stats.uptime)} · SSE clients:{" "}
              {stats.sse_clients}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-muted/80 transition-colors"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <StatCard
          icon={Database}
          label="Cache Entries"
          value={stats.cache.total_entries}
          sub={`${stats.cache.vod_categories} VOD · ${stats.cache.series_categories} series`}
        />
        <StatCard
          icon={Tv}
          label="Stream Hits"
          value={stats.streams.total_hits.toLocaleString()}
          sub={`${stats.streams.unique_streams} unique streams`}
        />
        <StatCard
          icon={Activity}
          label="Cache Hit Rate"
          value={stats.cache.hit_rate >= 0 ? `${stats.cache.hit_rate}%` : "—"}
          sub={`${stats.cache.hits} hits · ${stats.cache.misses} misses`}
        />
        <StatCard
          icon={Clock}
          label="EPG Age"
          value={
            stats.cache.epg_age != null
              ? `${Math.round(stats.cache.epg_age)}s`
              : "N/A"
          }
        />
        <StatCard icon={Radio} label="SSE Clients" value={stats.sse_clients} />
      </div>

      {/* Cache Controls */}
      <CacheControls headers={headers} onRefresh={refresh} />

      {/* EPG Refresh */}
      <EpgRefreshSection
        headers={headers}
        epgAge={stats.cache.epg_age}
        onRefresh={refresh}
      />

      {/* Popular content */}
      <PopularContentTable popular={stats.streams.popular} />

      {/* Error log */}
      <ErrorLogSection
        errors={stats.errors.recent}
        total={stats.errors.total}
      />

      {/* Search queries */}
      <RecentSearchesSection searches={stats.searches} />

      {/* Provider Management */}
      <ProviderManagementSection headers={headers} />

      {/* Stream Health */}
      <StreamHealthSection headers={headers} />
    </div>
  );
}
