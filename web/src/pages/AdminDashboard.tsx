import { useEffect, useState, useCallback } from "react";
import { Activity, Database, Tv, AlertTriangle, Radio, Clock } from "lucide-react";
import ProviderManagementSection from "@/components/admin/ProviderManagementSection";
import StreamHealthSection from "@/components/admin/StreamHealthSection";
import StatCard from "@/components/admin/StatCard";
import AdminKeyPrompt from "@/components/admin/AdminKeyPrompt";
import CacheControls from "@/components/admin/CacheControls";
import EpgRefreshSection from "@/components/admin/EpgRefreshSection";
import PopularContentTable from "@/components/admin/PopularContentTable";
import ErrorLogSection from "@/components/admin/ErrorLogSection";
import RecentSearchesSection from "@/components/admin/RecentSearchesSection";

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

export function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString();
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
