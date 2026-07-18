/**
 * Tests for usePlayerUtils helpers — localStorage persistence,
 * tryAutoplay, probeStream, saveProgress.
 *
 * These are pure functions extracted from the useVideoPlayer hook
 * for testability. The fmtTime function is tested in
 * useVideoPlayer.test.ts alongside the hook.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getWatchPos,
  saveWatchPos,
  getVolume,
  saveVolume,
  getMuted,
  saveMuted,
  tryAutoplay,
  probeStream,
  saveProgress,
  registerProgressSync,
  transcodeCache,
} from "@/hooks/usePlayerUtils";

vi.mock("@/lib/watchProgressSync", () => ({
  queueProgress: vi.fn(),
}));
vi.mock("@/lib/continueWatching", () => ({
  saveSeriesProgress: vi.fn(),
  saveMovieProgress: vi.fn(),
}));

// ── transcodeCache ───────────────────────────────────────────
describe("transcodeCache", () => {
  beforeEach(() => {
    transcodeCache.clear();
  });

  it("starts empty", () => {
    expect(transcodeCache.size).toBe(0);
  });

  it("stores and retrieves entries", () => {
    transcodeCache.set("live/123", "http://transcode/123");
    expect(transcodeCache.get("live/123")).toBe("http://transcode/123");
  });
});

// ── getWatchPos / saveWatchPos ───────────────────────────────
describe("getWatchPos / saveWatchPos", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null for empty storage", () => {
    expect(getWatchPos("vod_5")).toBeNull();
  });

  it("saves and retrieves a position", () => {
    saveWatchPos("vod_5", 120.5);
    expect(getWatchPos("vod_5")).toBe(120.5);
  });

  it("overwrites existing position", () => {
    saveWatchPos("vod_5", 10);
    saveWatchPos("vod_5", 200);
    expect(getWatchPos("vod_5")).toBe(200);
  });

  it("handles multiple watch keys independently", () => {
    saveWatchPos("vod_1", 30);
    saveWatchPos("ep_2_3", 60);
    expect(getWatchPos("vod_1")).toBe(30);
    expect(getWatchPos("ep_2_3")).toBe(60);
  });

  it("returns null for corrupted localStorage", () => {
    localStorage.setItem("stv_watch", "not-json");
    expect(getWatchPos("vod_5")).toBeNull();
  });

  it("survives missing key gracefully", () => {
    localStorage.setItem("stv_watch", JSON.stringify({}));
    expect(getWatchPos("nonexistent")).toBeNull();
  });
});

// ── getVolume / saveVolume ───────────────────────────────────
describe("getVolume / saveVolume", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to 0.8", () => {
    expect(getVolume()).toBe(0.8);
  });

  it("returns saved volume", () => {
    saveVolume(0.3);
    expect(getVolume()).toBe(0.3);
  });

  it("handles corrupted value gracefully", () => {
    localStorage.setItem("stv_volume", "nope");
    expect(getVolume()).toBe(0.8);
  });

  it("clamps extremes through the raw storage path", () => {
    saveVolume(0);
    expect(getVolume()).toBe(0);
    saveVolume(1);
    expect(getVolume()).toBe(1);
  });
});

// ── getMuted / saveMuted ─────────────────────────────────────
describe("getMuted / saveMuted", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to false", () => {
    expect(getMuted()).toBe(false);
  });

  it("saves and returns muted = true", () => {
    saveMuted(true);
    expect(getMuted()).toBe(true);
  });

  it("returns false after unmuting", () => {
    saveMuted(true);
    saveMuted(false);
    expect(getMuted()).toBe(false);
  });

  it("handles corrupted value gracefully", () => {
    localStorage.setItem("stv_muted", "maybe");
    expect(getMuted()).toBe(false);
  });
});

// ── tryAutoplay ──────────────────────────────────────────────
describe("tryAutoplay", () => {
  function createMockVideo() {
    return {
      play: vi.fn(),
      muted: false,
    } as unknown as HTMLVideoElement;
  }

  it("returns true when unmuted autoplay succeeds", async () => {
    const video = createMockVideo();
    video.play.mockResolvedValue(undefined);
    const onMutedFallback = vi.fn();
    expect(await tryAutoplay(video, onMutedFallback)).toBe(true);
    expect(onMutedFallback).not.toHaveBeenCalled();
    expect(video.muted).toBe(false);
  });

  it("falls back to muted autoplay when unmuted fails", async () => {
    const video = createMockVideo();
    video.play
      .mockRejectedValueOnce(new Error("NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    const onMutedFallback = vi.fn();
    expect(await tryAutoplay(video, onMutedFallback)).toBe(true);
    expect(video.muted).toBe(true);
    expect(onMutedFallback).toHaveBeenCalledOnce();
  });

  it("returns false when both autoplay attempts fail", async () => {
    const video = createMockVideo();
    video.play
      .mockRejectedValueOnce(new Error("NotAllowedError"))
      .mockRejectedValueOnce(new Error("AbortError"));
    expect(await tryAutoplay(video)).toBe(false);
  });

  it("does not call onMutedFallback when muted autoplay fails", async () => {
    const video = createMockVideo();
    video.play
      .mockRejectedValueOnce(new Error("NotAllowedError"))
      .mockRejectedValueOnce(new Error("AbortError"));
    const onMutedFallback = vi.fn();
    expect(await tryAutoplay(video, onMutedFallback)).toBe(false);
    expect(onMutedFallback).not.toHaveBeenCalled();
  });
});

// ── probeStream ──────────────────────────────────────────────
describe("probeStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns codec info on successful fetch", async () => {
    const mockJson = vi.fn().mockResolvedValue({ codec: "h264", width: 1920 });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      json: mockJson,
    } as unknown as Response);
    const result = await probeStream("/api/movie/probe/5");
    expect(result).toEqual({ codec: "h264", width: 1920 });
  });

  it("returns { codec: 'unknown' } on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );
    const result = await probeStream("/api/movie/probe/5");
    expect(result).toEqual({ codec: "unknown" });
  });

  it("respects external abort signal", async () => {
    const controller = new AbortController();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const promise = probeStream("/api/movie/probe/5", controller.signal);
    controller.abort();
    const result = await promise;
    expect(result).toEqual({ codec: "unknown" });
    fetchSpy.mockRestore();
  });

  it("times out after 10 seconds", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const promise = probeStream("/api/movie/probe/5");
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(result).toEqual({ codec: "unknown" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

// ── saveProgress ─────────────────────────────────────────────
import { saveSeriesProgress, saveMovieProgress } from "@/lib/continueWatching";
import { queueProgress } from "@/lib/watchProgressSync";

describe("saveProgress", () => {
  function createMockVideo(
    overrides: Partial<HTMLVideoElement> = {},
  ): HTMLVideoElement {
    return {
      paused: false,
      currentTime: 100,
      duration: 600,
      ...overrides,
    } as HTMLVideoElement;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("saves watch position for a movie", () => {
    saveProgress({
      video: createMockVideo(),
      watchKey: "vod_42",
      type: "movie",
      id: "42",
    });
    // Should have saved to localStorage
    expect(getWatchPos("vod_42")).toBe(100);
    // Should have queued background sync
    expect(queueProgress).toHaveBeenCalledWith("vod_42", 100);
    // Should have saved movie continue-watching
    expect(saveMovieProgress).toHaveBeenCalled();
    expect(saveSeriesProgress).not.toHaveBeenCalled();
  });

  it("skips save when video is paused", () => {
    saveProgress({
      video: createMockVideo({ paused: true }),
      watchKey: "vod_42",
      type: "movie",
      id: "42",
    });
    expect(getWatchPos("vod_42")).toBeNull();
    expect(queueProgress).not.toHaveBeenCalled();
    expect(saveMovieProgress).not.toHaveBeenCalled();
  });

  it("skips save when time <= 5s", () => {
    saveProgress({
      video: createMockVideo({ currentTime: 3 }),
      watchKey: "vod_42",
      type: "movie",
      id: "42",
    });
    expect(getWatchPos("vod_42")).toBeNull();
  });

  it("saves series progress with metadata from sessionStorage", () => {
    sessionStorage.setItem(
      "stv_series_meta_7",
      JSON.stringify({
        name: "Test Series",
        cover: "/cover.jpg",
        seasonNumber: 1,
        episodeNum: 3,
        episodeTitle: "Ep 3",
        durationSeconds: 1200,
      }),
    );
    saveProgress({
      video: createMockVideo({ duration: 1200 }),
      watchKey: "ep_7_101",
      type: "series",
      seriesId: "7",
      epId: "101",
      id: undefined,
    });
    // watchPos was saved via saveWatchPos internally
    expect(getWatchPos("ep_7_101")).toBe(100);
    expect(saveSeriesProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        seriesId: 7,
        seriesName: "Test Series",
        cover: "/cover.jpg",
        seasonNumber: 1,
        episodeNum: 3,
        episodeTitle: "Ep 3",
        progressSeconds: 100,
        durationSeconds: 1200,
      }),
    );
    expect(saveMovieProgress).not.toHaveBeenCalled();
  });

  it("does not auto-advance below 95%", () => {
    const onAutoAdvance = vi.fn();
    sessionStorage.setItem(
      "stv_series_meta_7",
      JSON.stringify({ name: "Series", durationSeconds: 1200 }),
    );
    sessionStorage.setItem(
      "stv_series_episodes_7_1",
      JSON.stringify([{ id: "101", episode_num: 1, title: "E1" }]),
    );
    sessionStorage.setItem("stv_series_current_idx_7", "0");

    saveProgress({
      video: createMockVideo({ currentTime: 200, duration: 1200 }), // 16.7%
      watchKey: "ep_7_101",
      type: "series",
      seriesId: "7",
      epId: "101",
      onAutoAdvance,
    });
    expect(onAutoAdvance).not.toHaveBeenCalled();
  });

  it("auto-advances at ≥95% progress when next episode exists", () => {
    const onAutoAdvance = vi.fn();
    sessionStorage.setItem(
      "stv_series_meta_7",
      JSON.stringify({ name: "Series", durationSeconds: 100 }),
    );
    sessionStorage.setItem(
      "stv_series_episodes_7_1",
      JSON.stringify([
        { id: "101", episode_num: 1, title: "E1" },
        { id: "102", episode_num: 2, title: "E2" },
      ]),
    );
    sessionStorage.setItem("stv_series_current_idx_7", "0");
    sessionStorage.setItem("stv_series_active_season_7", "1");

    saveProgress({
      video: createMockVideo({ currentTime: 99, duration: 100 }), // 99% — ≥95% threshold
      watchKey: "ep_7_101",
      type: "series",
      seriesId: "7",
      epId: "101",
      onAutoAdvance,
    });
    expect(onAutoAdvance).toHaveBeenCalledWith("/watch/series/7/102");
    // Should update current index
    expect(sessionStorage.getItem("stv_series_current_idx_7")).toBe("1");
  });

  it("does not auto-advance if already auto-advanced for this series", () => {
    const onAutoAdvance = vi.fn();
    sessionStorage.setItem("stv_auto_advanced_7", "1");
    sessionStorage.setItem(
      "stv_series_meta_7",
      JSON.stringify({ name: "Series", durationSeconds: 100 }),
    );

    saveProgress({
      video: createMockVideo({ currentTime: 99, duration: 100 }),
      watchKey: "ep_7_101",
      type: "series",
      seriesId: "7",
      epId: "101",
      onAutoAdvance,
    });
    expect(onAutoAdvance).not.toHaveBeenCalled();
  });

  it("does not auto-advance at last episode (no next)", () => {
    const onAutoAdvance = vi.fn();
    sessionStorage.setItem(
      "stv_series_meta_7",
      JSON.stringify({ name: "Series", durationSeconds: 100 }),
    );
    sessionStorage.setItem(
      "stv_series_episodes_7_1",
      JSON.stringify([{ id: "101", episode_num: 1, title: "E1" }]),
    );
    sessionStorage.setItem("stv_series_current_idx_7", "0");
    sessionStorage.setItem("stv_series_active_season_7", "1");

    saveProgress({
      video: createMockVideo({ currentTime: 99, duration: 100 }),
      watchKey: "ep_7_101",
      type: "series",
      seriesId: "7",
      epId: "101",
      onAutoAdvance,
    });
    expect(onAutoAdvance).not.toHaveBeenCalled();
  });

  it("saves movie continue-watching with metadata", () => {
    sessionStorage.setItem(
      "stv_movie_meta",
      JSON.stringify({ id: 42, name: "Test Movie", poster: "/poster.jpg" }),
    );
    saveProgress({
      video: createMockVideo({ currentTime: 120, duration: 600 }),
      watchKey: "vod_42",
      type: "movie",
      id: "42",
    });
    expect(saveMovieProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        movieId: 42,
        movieName: "Test Movie",
        poster: "/poster.jpg",
        progressSeconds: 120,
      }),
    );
  });
});

// ── registerProgressSync ────────────────────────────────────
describe("registerProgressSync", () => {
  it("registers sync-watch-progress with service worker", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const ready = Promise.resolve({ sync: { register } });
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready },
      configurable: true,
      writable: true,
    });
    await registerProgressSync();
    expect(register).toHaveBeenCalledWith("sync-watch-progress");
  });

  it("handles service worker error gracefully", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.reject(new Error("SW not available")) },
      configurable: true,
      writable: true,
    });
    // Should not throw despite rejected promise
    await registerProgressSync();
    // If we got here without throwing, .catch handled it
  });
});
