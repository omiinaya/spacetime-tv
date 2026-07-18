/**
 * Tests for useShakaPlayer — shaka-player fallback for HLS/DASH playback
 *
 * Covers: shaka-supported path, native HLS (Safari), unsupported browser,
 * error events, empty-stream detection, timeout, progress saving, cleanup.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useShakaPlayer,
  type ShakaPlayerCallbacks,
} from "@/hooks/useShakaPlayer";

// ── Mock state (object ref avoids hoisting TDZ with let) ────
const state = {
  isBrowserSupported: true,
  nativeHlsSupported: false,
  attachImpl: vi.fn(() => Promise.resolve()),
  configureImpl: vi.fn(),
  loadImpl: vi.fn(() => Promise.resolve()),
  destroyImpl: vi.fn(() => Promise.resolve()),
  addEventListenerImpl: vi.fn(),
  removeEventListenerImpl: vi.fn(),
  saveProgressImpl: vi.fn(),
};

// ── Mock shaka-player ───────────────────────────────────────
vi.mock("shaka-player", () => {
  const Severity = { CRITICAL: "critical" };
  return {
    default: {
      Player: class MockShakaPlayer {
        static isBrowserSupported = vi.fn(() => state.isBrowserSupported);
        get attach() {
          return state.attachImpl;
        }
        get configure() {
          return state.configureImpl;
        }
        get load() {
          return state.loadImpl;
        }
        get destroy() {
          return state.destroyImpl;
        }
        get addEventListener() {
          return state.addEventListenerImpl;
        }
        get removeEventListener() {
          return state.removeEventListenerImpl;
        }
      },
      util: { Error: { Severity } },
    },
  };
});

// ── Mock usePlayerUtils ─────────────────────────────────────
vi.mock("@/hooks/usePlayerUtils", () => ({
  tryAutoplay: vi.fn(() => Promise.resolve(true)),
  saveProgress: vi.fn(() => {}),
  registerProgressSync: vi.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────
function mockVideo(
  overrides: Partial<HTMLVideoElement> = {},
): HTMLVideoElement {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    removeAttribute: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    load: vi.fn(),
    canPlayType: vi.fn(() => (state.nativeHlsSupported ? "probably" : "")),
    currentTime: 0,
    duration: 120,
    readyState: 4,
    buffered: { length: 0 },
    muted: false,
    src: "",
    ...overrides,
  } as unknown as HTMLVideoElement;
}

function makeCallbacks(): ShakaPlayerCallbacks {
  return {
    onPhaseChange: vi.fn(),
    onError: vi.fn(),
    onStall: vi.fn(),
    onTimeUpdate: vi.fn(),
    onDuration: vi.fn(),
    onAutoplayMuted: vi.fn(),
    clearLoadingTimeout: vi.fn(),
  };
}

function resetTestState() {
  state.isBrowserSupported = true;
  state.nativeHlsSupported = false;
  state.attachImpl = vi.fn(() => Promise.resolve());
  state.configureImpl = vi.fn();
  state.loadImpl = vi.fn(() => Promise.resolve());
  state.destroyImpl = vi.fn(() => Promise.resolve());
  state.addEventListenerImpl = vi.fn();
  state.removeEventListenerImpl = vi.fn();
  state.saveProgressImpl = vi.fn();
  vi.clearAllMocks();
}

// ═════════════════════════════════════════════════════════════
describe("useShakaPlayer", () => {
  let videoRef: { current: HTMLVideoElement };
  let cb: ShakaPlayerCallbacks;

  beforeEach(() => {
    resetTestState();
  });
  beforeEach(() => {
    videoRef = { current: mockVideo() };
    cb = makeCallbacks();
  });

  // ─── Primary path: shaka-player supported ──────────────────
  describe("shaka-player path", () => {
    it("attaches and configures shaka on playShaka", async () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });
      await vi.waitFor(() => {
        expect(state.attachImpl).toHaveBeenCalledWith(videoRef.current, false);
      });
      expect(state.configureImpl).toHaveBeenCalledWith({
        streaming: {
          alwaysStreamText: false,
          liveSync: { enabled: true, latencyTarget: 15 },
          bufferingGoal: 30,
          rebufferingGoal: 10,
        },
        preferNativeHls: false,
      });
      unmount();
    });

    it("loads the playlist with mime type and start position", async () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka(
          "http://example.com/playlist.m3u8",
          "application/x-mpegURL",
          60,
        );
      });
      await vi.waitFor(() => {
        expect(state.loadImpl).toHaveBeenCalledWith(
          "http://example.com/playlist.m3u8",
          60,
          "application/x-mpegURL",
        );
      });
      unmount();
    });

    it("emits playing and duration on load success", async () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });
      await vi.waitFor(() => {
        expect(cb.onPhaseChange).toHaveBeenCalledWith("playing");
      });
      expect(cb.onDuration).toHaveBeenCalledWith(120);
      unmount();
    });

    it("calls stream_error when shaka load fails", async () => {
      state.loadImpl = vi.fn(() =>
        Promise.reject(new Error("Manifest parse error")),
      );
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });
      await vi.waitFor(() => {
        expect(cb.onError).toHaveBeenCalledWith(
          "stream_error",
          expect.stringContaining("Manifest parse error"),
        );
      });
      unmount();
    });

    it("calls not_supported when shaka attach fails", async () => {
      state.attachImpl = vi.fn(() =>
        Promise.reject(new Error("attach failed")),
      );
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });
      await vi.waitFor(() => {
        expect(cb.onError).toHaveBeenCalledWith(
          "not_supported",
          expect.any(String),
        );
      });
      unmount();
    });

    it("listens for critical shaka errors", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });

      const addCalls = state.addEventListenerImpl.mock.calls;
      const errorCb = addCalls.find(([e]: [string]) => e === "error");
      expect(errorCb).toBeDefined();

      act(() => {
        errorCb?.[1](
          new CustomEvent("error", { detail: { severity: "critical" } }),
        );
      });
      expect(cb.onError).toHaveBeenCalledWith(
        "stream_error",
        expect.any(String),
      );
      unmount();
    });
  });

  // ─── Native HLS (Safari) ───────────────────────────────────
  describe("native HLS (Safari)", () => {
    beforeEach(() => {
      state.isBrowserSupported = false;
      state.nativeHlsSupported = true;
      videoRef = { current: mockVideo() };
    });

    it("sets video.src when native HLS is supported", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });
      expect(videoRef.current.src).toBe("http://example.com/playlist.m3u8");
      unmount();
    });

    it("emits playing and duration on loadedmetadata", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });

      const addCalls = (
        videoRef.current.addEventListener as ReturnType<typeof vi.fn>
      ).mock.calls;
      const metaCb = addCalls.find(([e]: [string]) => e === "loadedmetadata");
      act(() => {
        metaCb?.[1]();
      });
      expect(cb.onDuration).toHaveBeenCalledWith(120);
      expect(cb.onPhaseChange).toHaveBeenCalledWith("playing");
      unmount();
    });

    it("restores startPos on loadedmetadata when > 5", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka(
          "http://example.com/playlist.m3u8",
          "application/x-mpegURL",
          120,
        );
      });

      const addCalls = (
        videoRef.current.addEventListener as ReturnType<typeof vi.fn>
      ).mock.calls;
      const metaCb = addCalls.find(([e]: [string]) => e === "loadedmetadata");
      act(() => {
        metaCb?.[1]();
      });
      expect(videoRef.current.currentTime).toBe(120);
      unmount();
    });
  });

  // ─── Unsupported browser ───────────────────────────────────
  describe("unsupported browser", () => {
    beforeEach(() => {
      state.isBrowserSupported = false;
      state.nativeHlsSupported = false;
    });

    it("fires not_supported error", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });
      expect(cb.onError).toHaveBeenCalledWith(
        "not_supported",
        expect.any(String),
      );
      unmount();
    });
  });

  // ─── Video event listeners ─────────────────────────────────
  describe("video event listeners", () => {
    it("registers timeupdate, durationchange, ended, waiting", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });

      const calls = (
        videoRef.current.addEventListener as ReturnType<typeof vi.fn>
      ).mock.calls.map(([e]: [string]) => e);
      expect(calls).toContain("timeupdate");
      expect(calls).toContain("durationchange");
      expect(calls).toContain("ended");
      expect(calls).toContain("waiting");
      unmount();
    });

    it("calls onTimeUpdate on timeupdate", () => {
      videoRef.current = mockVideo({
        currentTime: 30,
        buffered: { length: 1, start: vi.fn(() => 0), end: vi.fn(() => 60) },
      }) as HTMLVideoElement;
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });

      const addCalls = (
        videoRef.current.addEventListener as ReturnType<typeof vi.fn>
      ).mock.calls;
      const timeCb = addCalls.find(([e]: [string]) => e === "timeupdate");
      act(() => {
        timeCb?.[1]();
      });
      expect(cb.onTimeUpdate).toHaveBeenCalledWith(30, 60);
      unmount();
    });

    it("calls onDuration on durationchange", () => {
      videoRef.current = mockVideo({ duration: 3600 }) as HTMLVideoElement;
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });

      const addCalls = (
        videoRef.current.addEventListener as ReturnType<typeof vi.fn>
      ).mock.calls;
      const durCb = addCalls.find(([e]: [string]) => e === "durationchange");
      act(() => {
        durCb?.[1]();
      });
      expect(cb.onDuration).toHaveBeenCalledWith(3600);
      unmount();
    });

    it("calls onPhaseChange(paused) on ended", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });

      const addCalls = (
        videoRef.current.addEventListener as ReturnType<typeof vi.fn>
      ).mock.calls;
      const endedCb = addCalls.find(([e]: [string]) => e === "ended");
      act(() => {
        endedCb?.[1]();
      });
      expect(cb.onPhaseChange).toHaveBeenCalledWith("paused");
      unmount();
    });

    it("calls onStall on waiting", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });

      const addCalls = (
        videoRef.current.addEventListener as ReturnType<typeof vi.fn>
      ).mock.calls;
      const waitCb = addCalls.find(([e]: [string]) => e === "waiting");
      act(() => {
        waitCb?.[1]();
      });
      expect(cb.onStall).toHaveBeenCalled();
      unmount();
    });
  });

  // ─── Timeout and empty-stream ──────────────────────────────
  describe("timeout and empty-stream", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("fires timeout after 15s", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });
      act(() => {
        vi.advanceTimersByTime(15000);
      });
      expect(cb.onError).toHaveBeenCalledWith("timeout", expect.any(String));
      unmount();
    });

    it("fires empty_stream when readyState stays 0", () => {
      videoRef.current = mockVideo({ readyState: 0 }) as HTMLVideoElement;
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(cb.onError).toHaveBeenCalledWith(
        "empty_stream",
        expect.any(String),
      );
      unmount();
    });
  });

  // ─── Cleanup ────────────────────────────────────────────────
  describe("cleanup", () => {
    it("destroys shaka player on unmount", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });
      act(() => {
        unmount();
      });
      expect(state.destroyImpl).toHaveBeenCalled();
    });

    it("removes video event listeners on cleanup", () => {
      const { result, unmount } = renderHook(() =>
        useShakaPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
      );
      act(() => {
        result.current.playShaka("http://example.com/playlist.m3u8");
      });
      act(() => {
        result.current.playShaka("http://example.com/playlist2.m3u8");
      });
      expect(videoRef.current.removeEventListener).toHaveBeenCalledWith(
        "timeupdate",
        expect.any(Function),
      );
      expect(videoRef.current.removeEventListener).toHaveBeenCalledWith(
        "durationchange",
        expect.any(Function),
      );
      expect(videoRef.current.removeEventListener).toHaveBeenCalledWith(
        "ended",
        expect.any(Function),
      );
      expect(videoRef.current.removeEventListener).toHaveBeenCalledWith(
        "waiting",
        expect.any(Function),
      );
      unmount();
    });
  });
});
