/**
 * Tests for the AdminDashboard page component.
 *
 * AdminDashboard provides a system admin view with server stats, cache controls,
 * EPG refresh trigger, popular content table, error log, and search query monitoring.
 * This suite covers: loading state, error state, stats rendering, cache controls,
 * EPG refresh, popular content (populated and empty), error log (populated and empty),
 * search queries (populated and empty), and interactive button functionality.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import AdminDashboard from "@/pages/AdminDashboard";

// ── Sample admin stats ────────────────────────────────────────
const sampleStats = {
  uptime: 123456,
  cache: {
    total_entries: 1500,
    hits: 12000,
    misses: 3000,
    hit_rate: 80,
    vod_categories: 25,
    series_categories: 15,
    epg_age: 300,
  },
  streams: {
    total_hits: 50000,
    unique_streams: 200,
    popular: [
      { stream: "CNN", hits: 1200 },
      { stream: "BBC World", hits: 900 },
      { stream: "Fox News", hits: 750 },
    ],
  },
  errors: {
    total: 42,
    recent: [
      { ts: 1719500000, message: "Connection timeout", path: "/api/live/streams" },
      { ts: 1719490000, message: "Cache miss for series 123", path: "/api/series/123" },
    ],
  },
  searches: {
    total: 520,
    recent: [
      { ts: 1719500000, query: "breaking bad" },
      { ts: 1719495000, query: "game of thrones" },
      { ts: 1719490000, query: "stranger things" },
    ],
  },
  sse_clients: 3,
};

const sampleStatsEmptyPopular: typeof sampleStats = {
  ...sampleStats,
  streams: { ...sampleStats.streams, popular: [] },
};

const sampleStatsEmptyErrors: typeof sampleStats = {
  ...sampleStats,
  errors: { total: 0, recent: [] },
};

const sampleStatsEmptySearches: typeof sampleStats = {
  ...sampleStats,
  searches: { total: 0, recent: [] },
};

const sampleStatsNoEpg: typeof sampleStats = {
  ...sampleStats,
  cache: { ...sampleStats.cache, epg_age: null },
};

const sampleStatsNegativeHitRate: typeof sampleStats = {
  ...sampleStats,
  cache: { ...sampleStats.cache, hit_rate: -1 },
};

// ── Before each test, set up MSW handlers for admin endpoints ──
beforeEach(() => {
  server.use(
    http.get("/api/admin/stats", () =>
      HttpResponse.json(sampleStats),
    ),
    http.post("/api/admin/cache/clear", () =>
      HttpResponse.json({ message: "Cache cleared" }),
    ),
    http.post("/api/admin/cache/warm", () =>
      HttpResponse.json({ message: "Warming started" }),
    ),
    http.post("/api/admin/cache/warm-full", () =>
      HttpResponse.json({ message: "Full re-warm started" }),
    ),
    http.post("/api/admin/epg/refresh", () =>
      HttpResponse.json({ message: "EPG refresh triggered" }),
    ),
  );
});

// ── Helper ────────────────────────────────────────────────────
function renderDashboard() {
  return render(<AdminDashboard />);
}

// ── Tests ─────────────────────────────────────────────────────

describe("AdminDashboard", () => {
  it("shows loading spinner on initial render", () => {
    // Use a handler that delays to keep the loading state visible
    server.use(
      http.get("/api/admin/stats", async () => {
        await new Promise((r) => setTimeout(r, 500));
        return HttpResponse.json(sampleStats);
      }),
    );
    renderDashboard();
    // The loading spinner is a <div> with animate-spin class
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders page title and header info after loading", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Admin Dashboard")).toBeTruthy();
    });
    // Header shows uptime and SSE clients
    expect(screen.getByText(/Uptime:/)).toBeTruthy();
    // 123456 seconds = 1d 10h 17m
    expect(screen.getByText(/1d 10h 17m/)).toBeTruthy();
    expect(screen.getByText(/SSE clients: 3/)).toBeTruthy();
  });

  it("renders all five stat cards with correct values", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("1500")).toBeTruthy();
    });
    // Cache Entries: 1,500
    expect(screen.getByText("Cache Entries")).toBeTruthy();
    expect(screen.getByText("25 VOD · 15 series")).toBeTruthy();
    // Stream Hits: 50,000
    expect(screen.getByText("50,000")).toBeTruthy();
    expect(screen.getByText("200 unique streams")).toBeTruthy();
    // Cache Hit Rate: 80%
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.getByText(/12000 hits · 3000 misses/)).toBeTruthy();
    // EPG Age: 300s
    expect(screen.getByText("300s")).toBeTruthy();
    // SSE Clients: 3 (in stat card value) and header text
    expect(screen.getByText(/SSE clients: 3/)).toBeTruthy();
  });

  it("renders Cache Controls section with three buttons", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Cache Controls")).toBeTruthy();
    });
    expect(screen.getByText("Clear Cache")).toBeTruthy();
    expect(screen.getByText("Warm Cache")).toBeTruthy();
    expect(screen.getByText("Full Rewarm")).toBeTruthy();
  });

  it("renders EPG Guide section with Refresh button", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("EPG Guide")).toBeTruthy();
    });
    expect(screen.getByText(/300s ago/)).toBeTruthy();
    expect(screen.getByText("Refresh EPG Now")).toBeTruthy();
  });

  it("shows EPG age as 'Never' when epg_age is null", async () => {
    server.use(
      http.get("/api/admin/stats", () => HttpResponse.json(sampleStatsNoEpg)),
    );
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Never/)).toBeTruthy();
    });
  });

  it("renders Popular Content table with stream data", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Popular Content")).toBeTruthy();
    });
    // Table header
    expect(screen.getByText("Stream")).toBeTruthy();
    expect(screen.getByText("Hits")).toBeTruthy();
    // Data rows
    expect(screen.getByText("CNN")).toBeTruthy();
    expect(screen.getByText("1,200")).toBeTruthy();
    expect(screen.getByText("BBC World")).toBeTruthy();
    expect(screen.getByText("900")).toBeTruthy();
    expect(screen.getByText("Fox News")).toBeTruthy();
    expect(screen.getByText("750")).toBeTruthy();
  });

  it("shows empty state when no popular content", async () => {
    server.use(
      http.get("/api/admin/stats", () => HttpResponse.json(sampleStatsEmptyPopular)),
    );
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("No stream data yet.")).toBeTruthy();
    });
  });

  it("renders Recent Errors section with error entries", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/42 total/)).toBeTruthy();
    });
    expect(screen.getByText("Connection timeout")).toBeTruthy();
    expect(screen.getByText("/api/live/streams")).toBeTruthy();
    expect(screen.getByText("Cache miss for series 123")).toBeTruthy();
    expect(screen.getByText("/api/series/123")).toBeTruthy();
  });

  it("shows empty state when no errors recorded", async () => {
    server.use(
      http.get("/api/admin/stats", () => HttpResponse.json(sampleStatsEmptyErrors)),
    );
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("No errors recorded.")).toBeTruthy();
    });
  });

  it("renders Recent Searches section with search queries", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/520 total/)).toBeTruthy();
    });
    expect(screen.getByText(/"breaking bad"/)).toBeTruthy();
    expect(screen.getByText(/"game of thrones"/)).toBeTruthy();
    expect(screen.getByText(/"stranger things"/)).toBeTruthy();
  });

  it("shows empty state when no search queries", async () => {
    server.use(
      http.get("/api/admin/stats", () => HttpResponse.json(sampleStatsEmptySearches)),
    );
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("No search queries yet.")).toBeTruthy();
    });
  });

  it("shows — for hit rate when negative in the stat card", async () => {
    server.use(
      http.get("/api/admin/stats", () => HttpResponse.json(sampleStatsNegativeHitRate)),
    );
    renderDashboard();
    // Wait for stats to load (check for Cache Entries card first)
    await waitFor(() => {
      expect(screen.getByText("Cache Entries")).toBeTruthy();
    });
    // Hit rate stat card should show "—" (the first em dash in the stat grid)
    // There may be other "—" characters in error log entries, so use getAllByText
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
    // The first dash should be in the stat card's value div
    expect(dashes[0].closest('.text-2xl')).toBeTruthy();
  });

  it("shows error state with retry button on fetch failure", async () => {
    server.use(
      http.get("/api/admin/stats", () => new HttpResponse(null, { status: 500 })),
    );
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("HTTP 500")).toBeTruthy();
    });
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("retry button re-fetches stats after error", async () => {
    // First call fails
    server.use(
      http.get("/api/admin/stats", () => new HttpResponse(null, { status: 500 })),
    );
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeTruthy();
    });

    // Now make the next call succeed
    server.use(
      http.get("/api/admin/stats", () => HttpResponse.json(sampleStats)),
      { once: true }, // override just the next call
    );

    // Click retry
    const retryBtn = screen.getByText("Retry");
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    // Should now show dashboard content
    await waitFor(() => {
      expect(screen.getByText("Admin Dashboard")).toBeTruthy();
    });
  });

  it("Clear Cache button triggers cache clear and shows success message", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Clear Cache")).toBeTruthy();
    });

    const clearBtn = screen.getByText("Clear Cache");
    await act(async () => {
      fireEvent.click(clearBtn);
    });

    // After clicking, shows "Clearing…" then "Cache cleared"
    await waitFor(() => {
      expect(screen.getByText("Cache cleared")).toBeTruthy();
    });
  });

  it("Warm Cache button triggers cache warm and shows success message", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Warm Cache")).toBeTruthy();
    });

    const warmBtn = screen.getByText("Warm Cache");
    await act(async () => {
      fireEvent.click(warmBtn);
    });

    await waitFor(() => {
      expect(screen.getByText("Warming started")).toBeTruthy();
    });
  });

  it("Refresh EPG Now button triggers EPG refresh", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Refresh EPG Now")).toBeTruthy();
    });

    const epgBtn = screen.getByText("Refresh EPG Now");
    await act(async () => {
      fireEvent.click(epgBtn);
    });

    await waitFor(() => {
      expect(screen.getByText("EPG refresh triggered")).toBeTruthy();
    });
  });
});
