/**
 * Tests for AgentAccess — the admin page that lists pending hermes-id agents
 * and lets the admin approve/deny them.
 *
 * Covers: loading state, error + retry, empty state, populated table with
 * project chips + formatted timestamps, 403 → AdminKeyPrompt flow, approve
 * (confirm + success + cancel), deny, and sessionStorage adminKey persistence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import AgentAccess from "@/pages/AgentAccess";

// Sonner's Toaster isn't rendered in this test tree, so spy on the toast
// module directly to assert success/error notifications. vi.hoisted keeps
// the spy above the hoisted vi.mock factory.
const toastSpy = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastSpy }));

interface SampleAgent {
  did: string;
  status: string;
  display_name: string;
  registered_at: string;
  updated_at: string | null;
  approved_at: string | null;
  metadata: Record<string, unknown>;
  projects: string[];
}

const agentA: SampleAgent = {
  did: "did:key:z6Mkabc123",
  status: "pending",
  display_name: "Hermes Agent",
  registered_at: "2026-08-01T10:00:00Z",
  updated_at: null,
  approved_at: null,
  metadata: {},
  projects: ["spacetime-tv"],
};

const agentB: SampleAgent = {
  did: "did:key:z6Mkdef456",
  status: "pending",
  display_name: "",
  registered_at: "not-a-date",
  updated_at: null,
  approved_at: null,
  metadata: {},
  projects: [],
};

function listResponse(agents: SampleAgent[], total = agents.length) {
  return { agents, total, page: 1, page_size: 20, pages: 1 };
}

function renderPage() {
  return render(<AgentAccess />);
}

describe("AgentAccess", () => {
  beforeEach(() => {
    sessionStorage.clear();
    toastSpy.success.mockClear();
    toastSpy.error.mockClear();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows a loading spinner before the first response", () => {
    server.use(
      http.get(
        "/api/admin/hermes-id/agents",
        () =>
          new Promise(() => {
            /* never resolves — keep loading */
          }),
      ),
    );
    renderPage();
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows an error state and retries after clicking Retry", async () => {
    let calls = 0;
    server.use(
      http.get("/api/admin/hermes-id/agents", () => {
        calls += 1;
        if (calls === 1)
          return HttpResponse.json({ detail: "boom" }, { status: 500 });
        return HttpResponse.json(listResponse([agentA]));
      }),
    );
    renderPage();
    expect(await screen.findByText(/HTTP 500/)).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(await screen.findByText(agentA.did)).toBeTruthy();
  });

  it("shows the empty state when no agents are pending", async () => {
    server.use(
      http.get("/api/admin/hermes-id/agents", () =>
        HttpResponse.json(listResponse([])),
      ),
    );
    renderPage();
    expect(await screen.findByText(/No pending agents/)).toBeTruthy();
  });

  it("renders the agent table with display name, projects, and timestamps", async () => {
    server.use(
      http.get("/api/admin/hermes-id/agents", () =>
        HttpResponse.json(listResponse([agentA, agentB])),
      ),
    );
    renderPage();
    expect(await screen.findByText(agentA.did)).toBeTruthy();
    expect(screen.getByText("Hermes Agent")).toBeTruthy();
    expect(screen.getByText("spacetime-tv")).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("2 pending")),
    ).toBeTruthy();
    // invalid date falls back to the raw string
    expect(screen.getByText("not-a-date")).toBeTruthy();
  });

  it("shows AdminKeyPrompt when the API returns 403", async () => {
    server.use(
      http.get("/api/admin/hermes-id/agents", () =>
        HttpResponse.json({ detail: "Admin key required" }, { status: 403 }),
      ),
    );
    renderPage();
    expect(await screen.findByText("Admin Key Required")).toBeTruthy();
  });

  it("submits the admin key and refetches", async () => {
    let keySeen: string | null = null;
    server.use(
      http.get("/api/admin/hermes-id/agents", ({ request }) => {
        keySeen = request.headers.get("X-Admin-Key");
        if (keySeen) return HttpResponse.json(listResponse([agentA]));
        return HttpResponse.json(
          { detail: "Admin key required" },
          { status: 403 },
        );
      }),
    );
    renderPage();
    expect(await screen.findByText("Admin Key Required")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Admin key…"), {
      target: { value: "sekret" },
    });
    fireEvent.click(screen.getByText("Unlock"));
    expect(await screen.findByText(agentA.did)).toBeTruthy();
    expect(sessionStorage.getItem("adminKey")).toBe("sekret");
    expect(keySeen).toBe("sekret");
  });

  it("approves an agent after confirm and removes the row", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    let approved = "";
    server.use(
      http.get("/api/admin/hermes-id/agents", () =>
        HttpResponse.json(listResponse([agentA])),
      ),
      http.post("/api/admin/hermes-id/agents/:did/approve", ({ params }) => {
        approved = String(params.did);
        return HttpResponse.json({ ok: true });
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByText("Approve"));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(approved).toBe(agentA.did));
    await waitFor(() => {
      expect(screen.queryByText(agentA.did)).toBeNull();
    });
    expect(toastSpy.success).toHaveBeenCalledWith("Agent approved");
    // Removing the last pending agent surfaces the empty state
    expect(screen.getByText(/No pending agents/)).toBeTruthy();
  });

  it("does nothing when confirm is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    let approved = "";
    server.use(
      http.get("/api/admin/hermes-id/agents", () =>
        HttpResponse.json(listResponse([agentA])),
      ),
      http.post("/api/admin/hermes-id/agents/:did/approve", ({ params }) => {
        approved = String(params.did);
        return HttpResponse.json({ ok: true });
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByText("Approve"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(approved).toBe("");
    expect(screen.getByText(agentA.did)).toBeTruthy();
  });

  it("denies an agent after confirm and removes the row", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let denied = "";
    server.use(
      http.get("/api/admin/hermes-id/agents", () =>
        HttpResponse.json(listResponse([agentA])),
      ),
      http.post("/api/admin/hermes-id/agents/:did/deny", ({ params }) => {
        denied = String(params.did);
        return HttpResponse.json({ ok: true });
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByText("Deny"));
    await waitFor(() => expect(denied).toBe(agentA.did));
    await waitFor(() => {
      expect(screen.queryByText(agentA.did)).toBeNull();
    });
  });

  it("shows a toast when an action fails with a detail message", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    server.use(
      http.get("/api/admin/hermes-id/agents", () =>
        HttpResponse.json(listResponse([agentA])),
      ),
      http.post("/api/admin/hermes-id/agents/:did/deny", () =>
        HttpResponse.json({ detail: "already approved" }, { status: 400 }),
      ),
    );
    renderPage();
    fireEvent.click(await screen.findByText("Deny"));
    await waitFor(() => {
      expect(toastSpy.error).toHaveBeenCalledWith(
        expect.stringContaining("already approved"),
      );
    });
    // row stays
    expect(screen.getByText(agentA.did)).toBeTruthy();
  });
});
