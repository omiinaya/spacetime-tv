/**
 * Tests for useGuideData — EPG guide data hook with caching,
 * infinite scroll, SSE updates, and settings-based filtering.
 *
 * Depends on SettingsContext, api.guide.get (via MSW), sessionStorage
 * caching, IntersectionObserver, and EventSource (SSE).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { useGuideData } from "@/hooks/useGuideData";

// ── Mock SettingsContext ───────────────────────────────────
const mockSettings = {
  languages: [] as string[],
  hiddenCategories: [] as string[],
  showAdult: true,
};
const mockUpdateSettings = vi.fn();
const mockResetSettings = vi.fn();

vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({
    settings: mockSettings,
    update: mockUpdateSettings,
    reset: mockResetSettings,
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Mock EventSource (SSE, not available in jsdom) ─────────
interface MockEsInstance {
  url: string;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _listeners: Map<string, Set<Function>>;
  dispatchEvent: (type: string, data?: string) => void;
}
let mockEventSourceInstance: MockEsInstance | null = null;

function createMockEs() {
  mockEventSourceInstance = {
    url: "",
    close: vi.fn(),
    addEventListener: vi.fn((type: string, handler: Function) => {
      if (!mockEventSourceInstance!._listeners.has(type)) {
        mockEventSourceInstance!._listeners.set(type, new Set());
      }
      mockEventSourceInstance!._listeners.get(type)!.add(handler);
    }),
    removeEventListener: vi.fn(),
    _listeners: new Map(),
    dispatchEvent: (type: string, data?: string) => {
      const handlers = mockEventSourceInstance!._listeners.get(type);
      if (handlers) {
        for (const h of handlers) {
          h(data ? new MessageEvent(type, { data }) : new Event(type));
        }
      }
    },
  };
  return mockEventSourceInstance!;
}

// ── Sample channel groups ──────────────────────────────────
const sampleGuideData = {
  channel_groups: [
    { channel_id: 1, channel_name: "BBC One", stream_id: 100, programmes: [] },
    { channel_id: 2, channel_name: "BBC Two", stream_id: 200, programmes: [] },
  ],
  total_channels: 10,
};

// ── Tests ─────────────────────────────────────────────────
describe("useGuideData", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.clearAllMocks();
    server.resetHandlers();
    // Stub EventSource for this test
    function MockEventSource(url: string): MockEsInstance {
      const instance = createMockEs();
      instance.url = url;
      return instance;
    }
    vi.stubGlobal(
      "EventSource",
      MockEventSource as unknown as typeof EventSource,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts in loading state", () => {
    // Deliberately not setting up MSW — fetch never resolves
    server.use(http.get("*/guide", () => new Promise(() => {})));
    const { result } = renderHook(() => useGuideData());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.allData).toEqual([]);
  });

  it("fetches and returns guide data", async () => {
    server.use(
      http.get("*/guide", ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get("offset"));
        return HttpResponse.json({
          channel_groups: offset === 0 ? sampleGuideData.channel_groups : [],
          total_channels: sampleGuideData.total_channels,
        });
      }),
    );

    const { result } = renderHook(() => useGuideData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.allData).toHaveLength(2);
    expect(result.current.totalChannels).toBe(10);
    expect(result.current.allData[0].channel_name).toBe("BBC One");
  });

  it("sets error on API failure", async () => {
    server.use(http.get("*/guide", () => HttpResponse.error()));

    const { result } = renderHook(() => useGuideData());

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.loading).toBe(false);
  });

  it("loads from sessionStorage cache when available and fresh", async () => {
    const cachedData = {
      data: [
        {
          channel_id: 99,
          channel_name: "Cached Channel",
          stream_id: 999,
          programmes: [],
        },
      ],
      total: 1,
      ts: Date.now(),
    };
    sessionStorage.setItem("stv_guide_data", JSON.stringify(cachedData));

    // MSW handler spies to verify it's called for background refresh
    const apiHandler = vi.fn();
    server.use(
      http.get("*/guide", () => {
        apiHandler();
        return HttpResponse.json({
          channel_groups: sampleGuideData.channel_groups,
          total_channels: sampleGuideData.total_channels,
        });
      }),
    );

    const { result } = renderHook(() => useGuideData());

    // Should show cached data immediately
    expect(result.current.loading).toBe(false);
    expect(result.current.allData).toHaveLength(1);
    expect(result.current.allData[0].channel_name).toBe("Cached Channel");

    // Background refresh fires (eventually)
    await waitFor(() => {
      expect(apiHandler).toHaveBeenCalled();
    });
  });

  it("ignores stale cache (>5 min) and fetches fresh", async () => {
    const staleData = {
      data: [
        { channel_id: 1, channel_name: "Stale", stream_id: 1, programmes: [] },
      ],
      total: 1,
      ts: Date.now() - 600_000, // 10 minutes ago
    };
    sessionStorage.setItem("stv_guide_data", JSON.stringify(staleData));

    server.use(
      http.get("*/guide", () =>
        HttpResponse.json({
          channel_groups: sampleGuideData.channel_groups,
          total_channels: sampleGuideData.total_channels,
        }),
      ),
    );

    const { result } = renderHook(() => useGuideData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // Should fetch fresh data, not use stale cache
    expect(result.current.allData).toHaveLength(2);
    expect(result.current.allData[0].channel_name).toBe("BBC One");
  });

  it("filters out channels in hidden categories", async () => {
    // Set up sessionStorage with channel→category mapping
    sessionStorage.setItem(
      "stv_live_all_slim",
      JSON.stringify({
        a: [
          { id: 100, c: "cat_hidden" },
          { id: 200, c: "cat_visible" },
        ],
      }),
    );

    mockSettings.hiddenCategories = ["cat_hidden"];

    server.use(
      http.get("*/guide", () =>
        HttpResponse.json({
          channel_groups: sampleGuideData.channel_groups,
          total_channels: sampleGuideData.total_channels,
        }),
      ),
    );

    const { result } = renderHook(() => useGuideData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // Only BBC Two (stream_id=200, cat_visible) should remain
    expect(result.current.filteredChannels).toHaveLength(1);
    expect(result.current.filteredChannels[0].channel_name).toBe("BBC Two");
    // allData still has both
    expect(result.current.allData).toHaveLength(2);
  });

  it("computes timeSlots and nowPct", async () => {
    server.use(
      http.get("*/guide", () =>
        HttpResponse.json({
          channel_groups: sampleGuideData.channel_groups,
          total_channels: sampleGuideData.total_channels,
        }),
      ),
    );

    const { result } = renderHook(() => useGuideData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.timeSlots).toHaveLength(9); // 0..8 = 9 slots
    expect(result.current.nowPct).toBeGreaterThanOrEqual(0);
    expect(result.current.nowPct).toBeLessThanOrEqual(100);
    expect(result.current.now).toBeInstanceOf(Date);
  });

  it("loads more data on loadPage with offset > 0", async () => {
    const handler = vi.fn();
    server.use(
      http.get("*/guide", ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get("offset"));
        handler(offset);
        if (offset === 0) {
          return HttpResponse.json({
            channel_groups: [
              {
                channel_id: 1,
                channel_name: "Ch 1",
                stream_id: 1,
                programmes: [],
              },
              {
                channel_id: 2,
                channel_name: "Ch 2",
                stream_id: 2,
                programmes: [],
              },
            ],
            total_channels: 10,
          });
        }
        return HttpResponse.json({
          channel_groups: [
            {
              channel_id: 3,
              channel_name: "Ch 3",
              stream_id: 3,
              programmes: [],
            },
          ],
          total_channels: 10,
        });
      }),
    );

    const { result } = renderHook(() => useGuideData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.allData).toHaveLength(2);

    // Manually trigger load more
    result.current.loadPage(2);

    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith(2);
    });
    expect(result.current.allData).toHaveLength(3);
    expect(result.current.allData[2].channel_name).toBe("Ch 3");
  });

  it("returns sentinelRef as a div ref", async () => {
    server.use(
      http.get("*/guide", () =>
        HttpResponse.json({
          channel_groups: sampleGuideData.channel_groups,
          total_channels: sampleGuideData.total_channels,
        }),
      ),
    );

    const { result } = renderHook(() => useGuideData());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.sentinelRef.current).toBeNull(); // not mounted
    expect(result.current.sentinelRef).toHaveProperty("current");
  });
});
