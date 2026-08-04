import { useEffect, useState } from "react";
import {
  Satellite,
  Loader2,
  CheckCircle2,
  XCircle,
  Save,
  PlugZap,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ProviderConfig, ProviderTestResponse } from "@/lib/types";

function fmtHealth(ts: number | null): string {
  if (!ts) return "never";
  return new Date(ts * 1000).toLocaleTimeString();
}

function statusBadge(p: ProviderConfig) {
  const h = p.health;
  if (h.error_count === 0 && h.ok_count === 0) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        untested
      </span>
    );
  }
  if (h.error_count > 0 && h.ok_count === 0) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500">
        failing
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">
      healthy
    </span>
  );
}

export default function ProviderSettings() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [saved, setSaved] = useState<ProviderConfig | null>(null);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ProviderTestResponse | null>(
    null,
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.provider.get();
      setConfigured(data.configured);
      setSaved(data.provider);
      if (data.provider) {
        setName(data.provider.name);
        setBaseUrl(data.provider.base_url);
        setUsername(data.provider.username);
        setEnabled(data.provider.enabled);
        setPassword("");
      } else {
        setName("Default");
        setBaseUrl("");
        setUsername("");
        setPassword("");
        setEnabled(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // load intentionally runs once on mount; the form is the single source
    // of truth afterward.
  }, []);

  const handleTest = async () => {
    if (!baseUrl.trim() || !username.trim()) {
      setError("Enter a base URL and username first.");
      return;
    }
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const result = await api.provider.test({
        base_url: baseUrl.trim(),
        username: username.trim(),
        password: password || undefined,
      });
      setTestResult(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!baseUrl.trim() || !username.trim()) {
      setError("Base URL and username are required.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.provider.update({
        name: name.trim() || "Default",
        base_url: baseUrl.trim(),
        username: username.trim(),
        password: password || undefined,
        enabled,
      });
      setSaved(result.provider);
      setConfigured(true);
      setPassword("");
      setSuccess(result.message || "Provider saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30";

  if (loading) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Satellite className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">IPTV Provider</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading provider configuration…
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Satellite className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">IPTV Provider</h2>
        {saved && statusBadge(saved)}
      </div>
      <p className="text-xs text-muted-foreground">
        Connect your Xtream Codes IPTV account. These credentials power all live
        TV, movies, series, and the EPG guide.
      </p>

      {configured && saved && (
        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Last OK:{" "}
            <span className="text-foreground">
              {fmtHealth(saved.health.last_ok)}
            </span>
          </span>
          <span>
            OK: <span className="text-foreground">{saved.health.ok_count}</span>
          </span>
          <span>
            Failures:{" "}
            <span className="text-foreground">{saved.health.error_count}</span>
          </span>
        </div>
      )}

      <div className="grid gap-3">
        <div>
          <label
            htmlFor="provider-name"
            className="block text-[11px] text-muted-foreground mb-1"
          >
            Provider name
          </label>
          <input
            id="provider-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Provider"
            className={inputCls}
          />
        </div>

        <div>
          <label
            htmlFor="provider-url"
            className="block text-[11px] text-muted-foreground mb-1"
          >
            Base URL
          </label>
          <input
            id="provider-url"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://your-provider.example.com:8080"
            className={inputCls}
          />
        </div>

        <div>
          <label
            htmlFor="provider-user"
            className="block text-[11px] text-muted-foreground mb-1"
          >
            Username
          </label>
          <input
            id="provider-user"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Xtream username"
            autoComplete="off"
            className={inputCls}
          />
        </div>

        <div>
          <label
            htmlFor="provider-pass"
            className="block text-[11px] text-muted-foreground mb-1"
          >
            Password
          </label>
          <input
            id="provider-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              saved?.has_password
                ? "•••••••• (saved — leave blank to keep)"
                : "Xtream password"
            }
            autoComplete="new-password"
            className={inputCls}
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-card accent-primary"
          />
          <span className="text-xs text-muted-foreground">
            Provider enabled
          </span>
        </label>
      </div>

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {success && (
        <p className="text-xs text-green-500 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {success}
        </p>
      )}
      {testResult && (
        <p
          className={`text-xs flex items-center gap-1.5 ${
            testResult.ok ? "text-green-500" : "text-red-500"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          {testResult.ok
            ? `Connection OK — ${testResult.categories ?? 0} categories found.`
            : `Connection failed: ${testResult.error || "unknown error"}`}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={handleTest}
          disabled={testing || busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlugZap className="h-3.5 w-3.5" />
          )}
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button
          onClick={handleSave}
          disabled={busy || testing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {busy ? "Saving…" : "Save provider"}
        </button>
      </div>
    </section>
  );
}
