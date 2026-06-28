/**
 * Tests for useVideoPlayer hook and related utilities.
 *
 * The hook is complex (~1274 lines) with three playback paths
 * (live MPEG-TS, VOD remux, HLS). These tests cover the pure
 * logic (fmtTime, phase transitions, quality computation, error
 * handling) and mock the browser APIs that real playback depends on.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { fmtTime, QUALITIES, useVideoPlayer } from "@/hooks/useVideoPlayer";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";

// ── fmtTime ──────────────────────────────────────────────────
describe("fmtTime", () => {
  it("formats zero", () => {
    expect(fmtTime(0)).toBe("0:00");
  });

  it("formats seconds-only", () => {
    expect(fmtTime(45)).toBe("0:45");
    expect(fmtTime(9)).toBe("0:09");
  });

  it("formats minutes", () => {
    expect(fmtTime(125)).toBe("2:05");
    expect(fmtTime(600)).toBe("10:00");
  });

  it("formats hours", () => {
    expect(fmtTime(3661)).toBe("1:01:01");
    expect(fmtTime(7320)).toBe("2:02:00");
  });

  it("handles Infinity and negative values", () => {
    expect(fmtTime(Infinity)).toBe("0:00");
    expect(fmtTime(-1)).toBe("0:00");
    expect(fmtTime(NaN)).toBe("0:00");
  });
});

// ── QUALITIES ────────────────────────────────────────────────
describe("QUALITIES", () => {
  it("contains expected tiers", () => {
    const labels = QUALITIES.map((q) => q.label);
    expect(labels).toEqual(["Original", "1080p", "720p", "360p"]);
  });
});

// ── Mock external dependencies ───────────────────────────────
// mpegts.js and hls.js are heavy native modules; we mock them
// so the hook can load without side effects.

vi.mock("mpegts.js", () => {
  const Events = {
    MEDIA_INFO: "media_info",
    LOADING_COMPLETE: "loading_complete",
    STATISTICS_INFO: "statistics_info",
    ERROR: "error",
  };
  const createPlayer = vi.fn(() => ({
    attachMediaElement: vi.fn(),
    load: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }));
  return {
    default: { createPlayer, Events, isSupported: () => true },
    Events,
    createPlayer,
  };
});

vi.mock("hls.js", () => {
  class Hls {
    static isSupported = vi.fn(() => true);
    static Events = {
      MANIFEST_PARSED: "manifest_parsed",
      ERROR: "hls_error",
      MEDIA_ATTACHED: "media_attached",
    };
    static ErrorTypes = {
      NETWORK_ERROR: "networkError",
      MEDIA_ERROR: "mediaError",
    };
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
    on = vi.fn();
    off = vi.fn();
    levels = [{ details: { totalduration: 3600 } }];
  }
  return { default: Hls };
});

vi.mock("@/lib/continueWatching", () => ({
  saveSeriesProgress: vi.fn(),
  saveMovieProgress: vi.fn(),
}));

vi.mock("@/lib/watchProgressSync", () => ({
  queueProgress: vi.fn(),
}));

// ── useVideoPlayer — type derivation ─────────────────────────
describe("useVideoPlayer — type derivation", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("derives isLive=true for live type", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "live", id: "123", seriesId: undefined, epId: undefined }),
    );
    expect(result.current.isLive).toBe(true);
    expect(result.current.isVod).toBe(false);
    unmount();
  });

  it("derives isVod=true for movie type", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "456", seriesId: undefined, epId: undefined }),
    );
    expect(result.current.isLive).toBe(false);
    expect(result.current.isVod).toBe(true);
    unmount();
  });

  it("derives isVod=true for series type", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "series", id: undefined, seriesId: "42", epId: "101" }),
    );
    expect(result.current.isLive).toBe(false);
    expect(result.current.isVod).toBe(true);
    unmount();
  });
});

// ── useVideoPlayer — initial state ──────────────────────────
describe("useVideoPlayer — initial state", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("reports default initial values", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "789", seriesId: undefined, epId: undefined }),
    );

    // The hook goes to "probing" immediately via the main effect
    expect(["loading", "probing"]).toContain(result.current.phase);
    expect(result.current.errorMsg).toBeNull();
    expect(result.current.errorType).toBeNull();
    expect(result.current.transcoding).toBe(false);
    expect(result.current.volume).toBeGreaterThanOrEqual(0);
    expect(result.current.volume).toBeLessThanOrEqual(1);
    expect(result.current.muted).toBe(false);
    expect(result.current.playbackRate).toBe(1);
    expect(result.current.qualityIdx).toBe(0);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.showResumePrompt).toBe(false);
    expect(result.current.isBehindLive).toBe(false);
    expect(result.current.secondsBehindLive).toBe(0);
    expect(result.current.connectionQuality).toBe("excellent");
    unmount();
  });

  it("reads volume from localStorage", () => {
    localStorage.setItem("stv_volume", "0.3");
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "101112", seriesId: undefined, epId: undefined }),
    );
    expect(result.current.volume).toBe(0.3);
    unmount();
  });
});

// ── useVideoPlayer — controls ───────────────────────────────
describe("useVideoPlayer — controls", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("setVolume updates volume state", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "131415", seriesId: undefined, epId: undefined }),
    );

    act(() => { result.current.setVolume(0.5); });
    expect(result.current.volume).toBe(0.5);
    unmount();
  });

  it("toggleMute is a no-op without video element (ref is null)", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "161718", seriesId: undefined, epId: undefined }),
    );

    // Without a mounted video element, toggleMute returns early.
    // Muted state remains false (default).
    const initialMuted = result.current.muted;
    act(() => { result.current.toggleMute(); });
    // State stays unchanged because videoRef.current is null
    // (the hook returns early before calling setMuted)
    expect(result.current.muted).toBe(initialMuted);
    unmount();
  });

  it("setSpeed updates playbackRate", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "192021", seriesId: undefined, epId: undefined }),
    );

    act(() => { result.current.setSpeed(1.5); });
    expect(result.current.playbackRate).toBe(1.5);

    act(() => { result.current.setSpeed(2); });
    expect(result.current.playbackRate).toBe(2);
    unmount();
  });

  it("setQuality updates qualityIdx", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "222324", seriesId: undefined, epId: undefined }),
    );

    act(() => { result.current.setQuality(2); });
    expect(result.current.qualityIdx).toBe(2);

    act(() => { result.current.setQuality(0); });
    expect(result.current.qualityIdx).toBe(0);
    unmount();
  });

  it("retryStream resets state and triggers reload", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "live", id: "252627", seriesId: undefined, epId: undefined }),
    );

    act(() => { result.current.retryStream(); });
    // retryStream sets phase to "loading" then increments retryKey,
    // which re-fires the main effect which immediately sets phase
    // to "probing". So we expect "loading" or "probing" after retry.
    expect(["loading", "probing"]).toContain(result.current.phase);
    expect(result.current.errorMsg).toBeNull();
    unmount();
  });
});

// ── useVideoPlayer — resume prompt ──────────────────────────
describe("useVideoPlayer — resume prompt", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("does not show resume prompt when no stored position", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "282930", seriesId: undefined, epId: undefined }),
    );
    // Without localStorage position, showResumePrompt should be false
    expect(result.current.showResumePrompt).toBe(false);
    expect(result.current.resumePos).toBeNull();
    unmount();
  });

  it("does not show resume prompt for live type", () => {
    localStorage.setItem(
      "stv_watch",
      JSON.stringify({ live_123: { pos: 300, ts: Date.now() } }),
    );
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "live", id: "123", seriesId: undefined, epId: undefined }),
    );
    expect(result.current.showResumePrompt).toBe(false);
    unmount();
  });
});

// ── useVideoPlayer — probe routing (main effect) ────────────
describe("useVideoPlayer — probe routing", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    server.resetHandlers();
  });

  it("transitions to probing state on mount", () => {
    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "probe1", seriesId: undefined, epId: undefined }),
    );
    expect(result.current.phase).toBe("probing");
    expect(result.current.loadingStep).toBe("Detecting video format…");
    unmount();
  });

  it("probes and starts remux for native codec", async () => {
    server.use(
      http.get("*/movie/probe/probe2", () =>
        HttpResponse.json({ codec: "h264", width: 1920 }),
      ),
    );

    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "probe2", seriesId: undefined, epId: undefined }),
    );

    await vi.waitFor(() => {
      expect(result.current.phase !== "probing").toBe(true);
    });
    expect(result.current.transcoding).toBe(false);
    unmount();
  });

  it("probes and sets transcoding for hevc codec", async () => {
    server.use(
      http.get("*/movie/probe/probe3", () =>
        HttpResponse.json({ codec: "hevc", height: 1080 }),
      ),
    );

    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "probe3", seriesId: undefined, epId: undefined }),
    );

    await vi.waitFor(() => {
      expect(result.current.phase !== "probing").toBe(true);
    });
    expect(result.current.transcoding).toBe(true);
    unmount();
  });

  it("probes and shows empty_stream error for unavailable codec", async () => {
    server.use(
      http.get("*/movie/probe/probe4", () =>
        HttpResponse.json({ codec: "unavailable" }),
      ),
    );

    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "probe4", seriesId: undefined, epId: undefined }),
    );

    await vi.waitFor(() => {
      expect(result.current.phase).toBe("error");
    });
    expect(result.current.errorType).toBe("empty_stream");
    unmount();
  });

  it("probes and handles probe fetch error gracefully", async () => {
    server.use(
      http.get("*/movie/probe/probe5", () => HttpResponse.error()),
    );

    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "probe5", seriesId: undefined, epId: undefined }),
    );

    await vi.waitFor(() => {
      expect(result.current.phase !== "probing").toBe(true);
    });
    expect(result.current.transcoding).toBe(false);
    unmount();
  });

  it("shows resume prompt when stored position exists for movie", async () => {
    localStorage.setItem(
      "stv_watch",
      JSON.stringify({ vod_resume1: { pos: 300, ts: Date.now() } }),
    );

    server.use(
      http.get("*/movie/probe/resume1", () =>
        HttpResponse.json({ codec: "h264" }),
      ),
    );

    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "movie", id: "resume1", seriesId: undefined, epId: undefined }),
    );

    await vi.waitFor(() => {
      expect(result.current.showResumePrompt).toBe(true);
    });
    expect(result.current.resumePos).toBe(300);
    unmount();
  });

  it("does not show resume prompt for live type even with stored position", async () => {
    localStorage.setItem(
      "stv_watch",
      JSON.stringify({ vod_live1: { pos: 300, ts: Date.now() } }),
    );

    server.use(
      http.get("*/live/probe/live1", () =>
        HttpResponse.json({ codec: "h264" }),
      ),
    );

    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "live", id: "live1", seriesId: undefined, epId: undefined }),
    );

    await vi.waitFor(() => {
      expect(result.current.phase !== "probing").toBe(true);
    });
    expect(result.current.showResumePrompt).toBe(false);
    unmount();
  });

  it("starts remux for live type after probe", async () => {
    server.use(
      http.get("*/live/probe/liveProbe1", () =>
        HttpResponse.json({ codec: "h264" }),
      ),
    );

    const { result, unmount } = renderHook(() =>
      useVideoPlayer({ type: "live", id: "liveProbe1", seriesId: undefined, epId: undefined }),
    );

    await vi.waitFor(() => {
      expect(result.current.phase !== "probing").toBe(true);
    });
    expect(result.current.isLive).toBe(true);
    expect(result.current.transcoding).toBe(false);
    unmount();
  });
});
