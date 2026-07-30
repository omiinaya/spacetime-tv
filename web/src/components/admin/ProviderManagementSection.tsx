import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Plus, Check, Edit3, XCircle, Server } from "lucide-react";

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

export default function ProviderManagementSection({
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
