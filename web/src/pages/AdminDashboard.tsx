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
  Search,
  Wifi,
  Monitor,
  Code2,
  Plus,
  Edit3,
  XCircle,
  Server,
  Check,
  X,
} from "lucide-react";

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

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);
  const [epgMsg, setEpgMsg] = useState<string | null>(null);
  const [epgRefreshing, setEpgRefreshing] = useState(false);
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

  // Admin key prompt overlay
  if (showKeyPrompt) {
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

  const StatCard = ({
    icon: Icon,
    label,
    value,
    sub,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | number;
    sub?: string;
  }) => (
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
                refresh();
              } catch {
                setCacheMsg("Failed");
              } // SyntaxError or network error
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
                setTimeout(() => {
                  setCacheMsg(null);
                }, 3000);
                refresh();
              } catch {
                setCacheMsg("Failed");
              } // SyntaxError or network error
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
                setTimeout(() => {
                  setCacheMsg(null);
                }, 3000);
                refresh();
              } catch {
                setCacheMsg("Failed");
              } // SyntaxError or network error
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

      {/* EPG Refresh */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Wifi className="h-4 w-4 text-green-400" />
          <h2 className="text-sm font-semibold">EPG Guide</h2>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Last refresh:{" "}
              {stats.cache.epg_age != null
                ? `${Math.round(stats.cache.epg_age)}s ago`
                : "Never"}
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
                  setTimeout(() => {
                    setEpgMsg(null);
                  }, 3000);
                  refresh();
                } catch {
                  // SyntaxError or network error
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
                  <tr
                    key={s.stream}
                    className={i % 2 === 0 ? "bg-muted/20" : ""}
                  >
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
              <div
                key={i}
                className="px-4 py-2 border-b border-border/30 last:border-0 text-xs"
              >
                <span className="text-muted-foreground">{fmtTime(e.ts)}</span>
                {" — "}
                <span className="text-red-400">{e.message}</span>
                {e.path && (
                  <span className="text-muted-foreground/50 ml-2">
                    {e.path}
                  </span>
                )}
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
          <p className="text-sm text-muted-foreground">
            No search queries yet.
          </p>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            {stats.searches.recent.map((s, i) => (
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

      {/* Provider Management */}
      <ProviderManagementSection headers={headers} />

      {/* Stream Health */}
      <StreamHealthSection headers={headers} />
    </div>
  );
}

// ── Provider Management Section ──────────────────────────────

interface Provider {
  index: number;
  name: string;
  base_url: string;
  username: string;
  enabled: boolean;
  order: number;
  health: {
    last_ok: number | null;
    last_error: string | null;
    error_count: number;
    ok_count: number;
  };
}

interface ProvidersResponse {
  providers: Provider[];
}

function ProviderManagementSection({
  headers,
}: {
  headers: Record<string, string>;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    base_url: "",
    username: "",
    password: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/providers", { headers });
      if (r.ok) {
        const data: ProvidersResponse = await r.json();
        setProviders(data.providers);
      } else {
        setError("Failed to fetch providers");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }, [headers]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleToggle = async (idx: number) => {
    try {
      const r = await fetch(`/api/admin/providers/${idx}/toggle`, {
        method: "POST",
        headers,
      });
      if (r.ok) fetchProviders();
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (idx: number) => {
    if (!window.confirm("Delete this provider?")) return;
    try {
      const r = await fetch(`/api/admin/providers/${idx}`, {
        method: "DELETE",
        headers,
      });
      if (r.ok) fetchProviders();
      else setMsg("Delete failed");
    } catch {
      setMsg("Network error");
    }
  };

  const handleAdd = async () => {
    if (!formData.base_url || !formData.username) {
      setMsg("Base URL and Username are required");
      return;
    }
    try {
      const r = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (r.ok) {
        setShowAddForm(false);
        setFormData({ name: "", base_url: "", username: "", password: "" });
        setMsg("Provider added");
        fetchProviders();
      } else {
        const d = await r.json();
        setMsg(d.detail || "Add failed");
      }
    } catch {
      setMsg("Network error");
    }
  };

  const handleUpdate = async () => {
    if (editingIdx === null) return;
    try {
      const r = await fetch(`/api/admin/providers/${editingIdx}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (r.ok) {
        setEditingIdx(null);
        setFormData({ name: "", base_url: "", username: "", password: "" });
        setMsg("Provider updated");
        fetchProviders();
      } else {
        const d = await r.json();
        setMsg(d.detail || "Update failed");
      }
    } catch {
      setMsg("Network error");
    }
  };

  const startEdit = (p: Provider) => {
    setEditingIdx(p.index);
    setFormData({
      name: p.name,
      base_url: p.base_url,
      username: p.username,
      password: "",
    });
    setShowAddForm(false);
  };

  if (loading && providers.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">IPTV Providers</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchProviders}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-[10px] hover:bg-muted/80 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              setEditingIdx(null);
              setFormData({
                name: "",
                base_url: "",
                username: "",
                password: "",
              });
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/20 text-primary text-[10px] hover:bg-primary/30 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Provider
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {msg && <p className="text-xs text-green-400 mb-2">{msg}</p>}

      {/* Add / Edit Form */}
      {(showAddForm || editingIdx !== null) && (
        <div className="bg-card border border-border rounded-lg p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Name (optional)"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="px-2 py-1 rounded bg-muted text-xs border border-border/50 focus:outline-none focus:border-primary/30"
            />
            <input
              placeholder="Base URL *"
              value={formData.base_url}
              onChange={(e) =>
                setFormData({ ...formData, base_url: e.target.value })
              }
              className="px-2 py-1 rounded bg-muted text-xs border border-border/50 focus:outline-none focus:border-primary/30"
            />
            <input
              placeholder="Username *"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              className="px-2 py-1 rounded bg-muted text-xs border border-border/50 focus:outline-none focus:border-primary/30"
            />
            <input
              placeholder="Password"
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="px-2 py-1 rounded bg-muted text-xs border border-border/50 focus:outline-none focus:border-primary/30"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowAddForm(false);
                setEditingIdx(null);
              }}
              className="px-2 py-1 rounded bg-muted text-[10px] hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={editingIdx !== null ? handleUpdate : handleAdd}
              className="flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary text-[10px] hover:bg-primary/30 transition-colors"
            >
              <Check className="h-3 w-3" />
              {editingIdx !== null ? "Update" : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Provider list */}
      {providers.length === 0 && !loading ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          No providers configured. Add one above or set PROVIDERS_JSON env var.
        </div>
      ) : (
        <div className="space-y-1.5">
          {providers.map((p) => (
            <div
              key={p.index}
              className={`bg-card border border-border rounded-lg p-3 flex items-center justify-between ${p.enabled ? "" : "opacity-50"}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${p.enabled ? "bg-green-400" : "bg-gray-500"}`}
                  />
                  <span className="text-xs font-medium truncate">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    #{p.order}
                  </span>
                </div>
                <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
                  <span className="truncate max-w-[200px]">{p.base_url}</span>
                  <span>{p.username}</span>
                  {p.health.error_count > 0 && (
                    <span className="text-red-400">
                      {p.health.error_count} errors
                    </span>
                  )}
                  {p.health.ok_count > 0 && (
                    <span className="text-green-400">
                      {p.health.ok_count} ok
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(p.index)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    p.enabled
                      ? "bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                      : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                  }`}
                >
                  {p.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => startEdit(p)}
                  className="px-1.5 py-1 rounded bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleDelete(p.index)}
                  className="px-1.5 py-1 rounded bg-muted text-muted-foreground hover:text-destructive transition-colors"
                >
                  <XCircle className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stream Health Section ─────────────────────────────────────

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

function StreamHealthSection({ headers }: { headers: Record<string, string> }) {
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
