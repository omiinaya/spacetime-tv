/**
 * Tests for useNowPlaying — EPG "now playing" programme info fetcher.
 *
 * Fetches from /api/guide/now with periodic refresh (30s interval).
 * Uses real timers (fake timers conflict with MSW's internal scheduling).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { useNowPlaying } from "@/hooks/useNowPlaying";

describe("useNowPlaying", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("returns empty programmes and null lookups for empty streamIds", () => {
    const { result } = renderHook(() => useNowPlaying([]));
    expect(result.current.programmes.size).toBe(0);
    expect(result.current.getNowPlaying(1)).toBeNull();
    expect(result.current.getNowPlayingChannel(1)).toBeNull();
  });

  it("fetches and returns programme data", async () => {
    server.use(
      http.get("*/guide/now", () =>
        HttpResponse.json({
          programmes: {
            "1": { title: "News at 6", channel_name: "BBC One" },
            "2": { title: "Movie Night", channel_name: "HBO" },
          },
        }),
      ),
    );

    const { result } = renderHook(() => useNowPlaying([1, 2]));

    await waitFor(() => {
      expect(result.current.programmes.size).toBe(2);
    });
    expect(result.current.getNowPlaying(1)).toBe("News at 6");
    expect(result.current.getNowPlayingChannel(1)).toBe("BBC One");
    expect(result.current.getNowPlaying(2)).toBe("Movie Night");
    expect(result.current.getNowPlayingChannel(2)).toBe("HBO");
  });

  it("returns null for unknown streamId", async () => {
    server.use(
      http.get("*/guide/now", () =>
        HttpResponse.json({
          programmes: { "1": { title: "News", channel_name: "BBC" } },
        }),
      ),
    );

    const { result } = renderHook(() => useNowPlaying([1]));

    await waitFor(() => {
      expect(result.current.programmes.size).toBe(1);
    });
    expect(result.current.getNowPlaying(999)).toBeNull();
    expect(result.current.getNowPlayingChannel(999)).toBeNull();
  });

  it("handles filtered-out null programmes gracefully", async () => {
    server.use(
      http.get("*/guide/now", () =>
        HttpResponse.json({
          programmes: {
            "1": { title: "News", channel_name: "BBC" },
            "2": null,
          },
        }),
      ),
    );

    const { result } = renderHook(() => useNowPlaying([1, 2]));

    await waitFor(() => {
      expect(result.current.programmes.size).toBe(1);
    });
    expect(result.current.getNowPlaying(2)).toBeNull();
  });

  it("silently handles API error", async () => {
    server.use(http.get("*/guide/now", () => HttpResponse.error()));

    const { result } = renderHook(() => useNowPlaying([1]));

    // The hook catches errors silently — programmes should be empty
    await vi.waitFor(
      () => {
        expect(result.current.programmes.size).toBe(0);
      },
      { timeout: 2000 },
    );
  });

  it("processes only first 200 streamIds", async () => {
    const handler = vi.fn();
    server.use(
      http.get("*/guide/now", ({ request }) => {
        const url = new URL(request.url);
        const streamIds = url.searchParams.get("stream_ids") || "";
        handler(streamIds.split(",").length);
        return HttpResponse.json({ programmes: {} });
      }),
    );

    const manyIds = Array.from({ length: 500 }, (_, i) => i + 1);
    renderHook(() => useNowPlaying(manyIds));

    await vi.waitFor(
      () => {
        expect(handler).toHaveBeenCalledWith(200);
      },
      { timeout: 2000 },
    );
  });
});
