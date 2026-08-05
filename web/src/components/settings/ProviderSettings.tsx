import { useCallback, useEffect, useState } from "react";
import {
  Satellite,
  Loader2,
  CheckCircle2,
  XCircle,
  Save,
  PlugZap,
  Plus,
  Trash2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  ProviderConfig,
  ProviderListItem,
  ProviderTestResponse,
} from "@/lib/types";

function statusBadge(p: Pick<ProviderConfig, "health">) {
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

interface FormState {
  name: string;
  base_url: string;
  username: string;
  password: string;
  enabled: boolean;
}

const emptyForm: FormState = {
  name: "",
  base_url: "",
  username: "",
  password: "",
  enabled: true,
};

export default function ProviderSettings() {
  const [providers, setProviders] = useState<ProviderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ProviderTestResponse | null>(
    null,
  );

  // form editor state: null = closed, "new" = add form, number = editing idx
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [testIdx, setTestIdx] = useState<number | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.provider.list();
      setProviders(data.providers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm(emptyForm);
    setEditing("new");
    setTestResult(null);
    setSuccess(null);
  };

  const openEdit = (p: ProviderListItem) => {
    setForm({
      name: p.name,
      base_url: p.base_url,
      username: p.username,
      password: "",
      enabled: p.enabled,
    });
    setEditing(p.index);
    setTestResult(null);
    setSuccess(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setTestResult(null);
  };

  const handleTest = async (idx: number | "new") => {
    if (!form.base_url.trim() || !form.username.trim()) {
      setError("Enter a base URL and username first.");
      return;
    }
    setTesting(true);
    setError(null);
    setTestResult(null);
    setTestIdx(idx);
    try {
      const result = await api.provider.test({
        base_url: form.base_url.trim(),
        username: form.username.trim(),
        password: form.password || undefined,
      });
      setTestResult(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.base_url.trim() || !form.username.trim()) {
      setError("Base URL and username are required.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: form.name.trim() || "Default",
        base_url: form.base_url.trim(),
        username: form.username.trim(),
        password: form.password || undefined,
        enabled: form.enabled,
      };
      if (editing === "new") {
        const result = await api.provider.add(payload);
        setSuccess(result.message || "Provider added.");
      } else if (typeof editing === "number") {
        const result = await api.provider.updateAt(editing, payload);
        setSuccess(result.message || "Provider saved.");
      }
      closeEditor();
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (idx: number) => {
    try {
      const result = await api.provider.toggle(idx);
      setSuccess(result.message || "Provider updated.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDelete = async (idx: number) => {
    if (!window.confirm("Delete this provider?")) return;
    try {
      const result = await api.provider.remove(idx);
      setSuccess(result.message || "Provider deleted.");
      if (editing === idx) closeEditor();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const inputCls =
    "w-full h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30";

  if (loading) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Satellite className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">IPTV Providers</h2>
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
        <h2 className="text-sm font-semibold">IPTV Providers</h2>
        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded border border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Connect any Xtream Codes IPTV service — Live TV, movies, series, and the
        EPG guide all use these accounts. Credentials and endpoints are saved to{" "}
        <code className="text-[10px]">server/.env</code> (
        <code className="text-[10px]">PROVIDERS_JSON</code>) so they survive
        restarts and redeploys.
      </p>

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

      {/* Provider list */}
      {providers.length === 0 && editing !== "new" ? (
        <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
          No providers configured. Add one below or set{" "}
          <code className="text-[10px]">PROVIDERS_JSON</code> in your env.
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <div
              key={p.index}
              className={`border border-border rounded-lg p-3 ${
                p.enabled ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    p.enabled ? "bg-green-500" : "bg-muted-foreground"
                  }`}
                />
                <span className="text-sm font-medium truncate">{p.name}</span>
                {p.index === 0 && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium uppercase">
                    primary
                  </span>
                )}
                {statusBadge(p)}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  #{p.order}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                <span className="truncate max-w-[260px]">{p.base_url}</span>
                <span>{p.username}</span>
                {p.health.error_count > 0 && (
                  <span className="text-red-500">
                    {p.health.error_count} errors
                  </span>
                )}
                {p.health.ok_count > 0 && (
                  <span className="text-green-500">{p.health.ok_count} ok</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  onClick={() => handleToggle(p.index)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
                    p.enabled
                      ? "bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                      : "bg-green-500/20 text-green-500 hover:bg-green-500/30"
                  }`}
                >
                  {p.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => openEdit(p)}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(p.index)}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      {editing !== null && (
        <div className="border border-border rounded-lg p-3 space-y-3 bg-card/40">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold">
              {editing === "new" ? "Add provider" : "Edit provider"}
            </h3>
            {typeof editing === "number" && (
              <span className="text-[10px] text-muted-foreground">
                index {editing}
              </span>
            )}
          </div>

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
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
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
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
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
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={
                  typeof editing === "number"
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
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-border bg-card accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                Provider enabled
              </span>
            </label>
          </div>

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
              onClick={() => handleTest(editing)}
              disabled={testing || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {testing && testIdx === editing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlugZap className="h-3.5 w-3.5" />
              )}
              {testing && testIdx === editing ? "Testing…" : "Test connection"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || testing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? "Saving…" : "Save provider"}
            </button>
            <button
              onClick={closeEditor}
              disabled={saving || testing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {editing === null && (
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add provider
        </button>
      )}

      {providers.length > 0 && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 shrink-0" />
          Passwords are stored encrypted at rest and never returned to the UI.
          The first enabled provider is used as primary.
        </p>
      )}
    </section>
  );
}
