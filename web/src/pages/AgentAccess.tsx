import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import AdminKeyPrompt from "@/components/admin/AdminKeyPrompt";

interface Agent {
  did: string;
  status: string;
  display_name: string;
  registered_at: string;
  updated_at: string | null;
  approved_at: string | null;
  metadata: Record<string, unknown>;
  projects: string[];
}

interface AgentListResponse {
  agents: Agent[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

function fmtRegisteredAt(ts: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export default function AgentAccess() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState(
    () => sessionStorage.getItem("adminKey") || "",
  );
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  const [actingDid, setActingDid] = useState<string | null>(null);

  const headers: Record<string, string> = adminKey
    ? { "X-Admin-Key": adminKey }
    : {};

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/hermes-id/agents?status=pending", {
        headers,
      });
      if (r.status === 403) {
        setShowKeyPrompt(true);
        throw new Error("Admin key required");
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as AgentListResponse;
      setAgents(data.agents ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      if ((e as Error).message !== "Admin key required") {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitKey = () => {
    sessionStorage.setItem("adminKey", pendingKey);
    setAdminKey(pendingKey);
    setShowKeyPrompt(false);
    setPendingKey("");
  };

  const act = useCallback(
    async (did: string, action: "approve" | "deny") => {
      const verb = action === "approve" ? "approve" : "deny";
      if (!window.confirm(`Are you sure you want to ${verb} agent ${did}?`)) {
        return;
      }
      setActingDid(did);
      try {
        const r = await fetch(
          `/api/admin/hermes-id/agents/${encodeURIComponent(did)}/${action}`,
          { method: "POST", headers },
        );
        if (r.status === 403) {
          setShowKeyPrompt(true);
          return;
        }
        if (!r.ok) {
          let detail = `HTTP ${r.status}`;
          try {
            const body = (await r.json()) as { detail?: unknown };
            if (body.detail) detail = String(body.detail);
          } catch {
            // non-JSON error body — keep the HTTP status fallback
          }
          throw new Error(detail);
        }
        toast.success(action === "approve" ? "Agent approved" : "Agent denied");
        setAgents((prev) => prev.filter((a) => a.did !== did));
        setTotal((t) => Math.max(0, t - 1));
      } catch (e) {
        toast.error(
          `${action === "approve" ? "Approve" : "Deny"} failed: ${(e as Error).message}`,
        );
      } finally {
        setActingDid(null);
      }
    },
    [headers],
  );

  if (showKeyPrompt) {
    return (
      <AdminKeyPrompt
        pendingKey={pendingKey}
        setPendingKey={setPendingKey}
        submitKey={submitKey}
      />
    );
  }

  if (loading && agents.length === 0) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Agent Access</h1>
            <p className="text-sm text-muted-foreground">
              Pending hermes-id agents requesting access to this project
              {total > 0 ? ` · ${total} pending` : ""}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-muted/80 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No pending agents. New agents requesting access will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30">
                <th className="px-4 py-3 font-medium">Agent DID</th>
                <th className="px-4 py-3 font-medium">Display Name</th>
                <th className="px-4 py-3 font-medium">Registered</th>
                <th className="px-4 py-3 font-medium">Requested Projects</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr
                  key={agent.did}
                  className="border-b border-border last:border-0 hover:bg-muted/20"
                >
                  <td className="px-4 py-3 font-mono text-xs break-all">
                    {agent.did}
                  </td>
                  <td className="px-4 py-3">{agent.display_name || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {fmtRegisteredAt(agent.registered_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {agent.projects.length > 0 ? (
                        agent.projects.map((p) => (
                          <span
                            key={p}
                            className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => act(agent.did, "approve")}
                        disabled={actingDid === agent.did}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => act(agent.did, "deny")}
                        disabled={actingDid === agent.did}
                        className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <X className="h-3.5 w-3.5" />
                        Deny
                      </button>
                    </div>
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
