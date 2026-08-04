/**
 * Tests for useHlsPlayer — HLS VOD playback via hls.js
 *
 * Covers all three playback paths:
 *   1. hls.js supported (primary path, ~90% of browsers)
 *   2. Native HLS via <video> (Safari)
 *   3. Unsupported browser → not_supported error
 *
 * Plus: error recovery (NETWORK_ERROR→startLoad, MEDIA_ERROR→recoverMediaError,
 * fatal→shaka fallback), progress saving, 15s timeout, empty-stream detection,
 * resume position, and cleanup/destroy lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHlsPlayer, type HlsPlayerCallbacks } from "@/hooks/useHlsPlayer";

// ── Module-level flag for hls.js isSupported ────────────────
// This is the ONLY way to control the mock from within tests
// since vi.mock is hoisted and cannot reference local variables.
let HlsSupported = true;

vi.mock("hls.js", () => {
  const Events = {
    MANIFEST_PARSED: "manifest_parsed",
    ERROR: "hls_error",
    MEDIA_ATTACHED: "media_attached",
  };
  const ErrorTypes = {
    NETWORK_ERROR: "networkError",
    MEDIA_ERROR: "mediaError",
  };
  return {
    default: class MockHls {
      static isSupported = vi.fn(() => HlsSupported);
      static Events = Events;
      static ErrorTypes = ErrorTypes;
      loadSource = vi.fn();
      attachMedia = vi.fn();
      destroy = vi.fn();
      startLoad = vi.fn();
      recoverMediaError = vi.fn();
      on = vi.fn((evt: string, cb: (event: string, data: unknown) => void) => {
        if (!hlsListeners[evt]) hlsListeners[evt] = [];
        hlsListeners[evt].push(cb);
      });
      off = vi.fn();
      levels = [{ details: { totalduration: 3600 } }];

      constructor() {
        lastHls = {
          loadSource: this.loadSource,
          attachMedia: this.attachMedia,
          destroy: this.destroy,
          startLoad: this.startLoad,
          recoverMediaError: this.recoverMediaError,
          on: this.on,
          off: this.off,
        };
      }
    },
  };
});

// ── Mock usePlayerUtils ─────────────────────────────────────
const mockSaveProgress = vi.fn();
const mockRegisterProgressSync = vi.fn();
const mockTryAutoplay = vi.fn();
vi.mock("@/hooks/usePlayerUtils", () => ({
  tryAutoplay: (video: HTMLVideoElement, _onMuted?: () => void) =>
    mockTryAutoplay(video),
  saveProgress: (...args: unknown[]) => mockSaveProgress(...args),
  registerProgressSync: (...args: unknown[]) =>
    mockRegisterProgressSync(...args),
}));

// ── Hls event helpers ───────────────────────────────────────
const hlsListeners: Record<
  string,
  Array<(event: string, data: unknown) => void>
> = {};
let lastHls: {
  loadSource: ReturnType<typeof vi.fn>;
  attachMedia: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  startLoad: ReturnType<typeof vi.fn>;
  recoverMediaError: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
} | null = null;

function fireHlsEvent(event: string, data: Record<string, unknown> = {}) {
  for (const cb of hlsListeners[event] || []) cb(event, data);
}

function resetTestState() {
  HlsSupported = true;
  Object.keys(hlsListeners).forEach((k) => delete hlsListeners[k]);
  lastHls = null;
  mockSaveProgress.mockClear();
  mockRegisterProgressSync.mockClear();
  mockTryAutoplay.mockClear();
  // Faithful to the real tryAutoplay: calls video.play() and resolves true
  mockTryAutoplay.mockImplementation((video: HTMLVideoElement) => {
    video.play();
    return Promise.resolve(true);
  });
}

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
    canPlayType: vi.fn(() => ""),
    buffered: { length: 0 },
    duration: 120,
    currentTime: 0,
    readyState: 0,
    muted: false,
    src: "",
    ...overrides,
  } as unknown as HTMLVideoElement;
}

function makeCallbacks(): HlsPlayerCallbacks {
  return {
    onPhaseChange: vi.fn(),
    onError: vi.fn(),
    onStall: vi.fn(),
    onTimeUpdate: vi.fn(),
    onDuration: vi.fn(),
    onAutoplayMuted: vi.fn(),
    clearLoadingTimeout: vi.fn(),
    onHlsFatalError: vi.fn(),
  };
}

// ═════════════════════════════════════════════════════════════
// 1. hls.js supported path (primary, ~90% browsers)
// ═════════════════════════════════════════════════════════════
describe("useHlsPlayer — hls.js supported", () => {
  let videoRef: { current: HTMLVideoElement };
  let cb: HlsPlayerCallbacks;

  beforeEach(() => {
    resetTestState();
    vi.clearAllMocks();
  });
  beforeEach(() => {
    videoRef = { current: mockVideo() };
    cb = makeCallbacks();
  });

  it("calls loadSource and attachMedia on playHLS", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    expect(lastHls?.loadSource).toHaveBeenCalledWith(
      "http://example.com/playlist.m3u8",
    );
    expect(lastHls?.attachMedia).toHaveBeenCalledWith(videoRef.current);
    unmount();
  });

  it("emits phase=playing and duration on MANIFEST_PARSED", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    act(() => {
      fireHlsEvent("manifest_parsed");
    });
    expect(cb.onPhaseChange).toHaveBeenCalledWith("playing");
    expect(cb.onDuration).toHaveBeenCalled();
    expect(videoRef.current.play).toHaveBeenCalled();
    unmount();
  });

  it("restores startPos on MANIFEST_PARSED when > 5", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8", 120);
    });
    act(() => {
      fireHlsEvent("manifest_parsed");
    });
    expect(videoRef.current.currentTime).toBe(120);
    unmount();
  });

  it("does NOT restore startPos when <= 5", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8", 3);
    });
    act(() => {
      fireHlsEvent("manifest_parsed");
    });
    expect(videoRef.current.currentTime).toBe(0);
    unmount();
  });

  it("recovers NETWORK_ERROR with startLoad", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    act(() => {
      fireHlsEvent("hls_error", { type: "networkError", fatal: true });
    });
    expect(lastHls?.startLoad).toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
    unmount();
  });

  it("recovers MEDIA_ERROR with recoverMediaError", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    act(() => {
      fireHlsEvent("hls_error", { type: "mediaError", fatal: true });
    });
    expect(lastHls?.recoverMediaError).toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
    unmount();
  });

  it("fires onError and onHlsFatalError for other fatal errors", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    act(() => {
      fireHlsEvent("hls_error", { type: "otherError", fatal: true });
    });
    expect(cb.onError).toHaveBeenCalledWith("stream_error", expect.any(String));
    expect(cb.onHlsFatalError).toHaveBeenCalledWith(
      "http://example.com/playlist.m3u8",
    );
    unmount();
  });

  it("ignores non-fatal errors", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    act(() => {
      fireHlsEvent("hls_error", { type: "networkError", fatal: false });
    });
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onHlsFatalError).not.toHaveBeenCalled();
    unmount();
  });

  it("fires onError(timeout) after 15s", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(cb.onError).toHaveBeenCalledWith("timeout", expect.any(String));
    vi.useRealTimers();
    unmount();
  });

  it("fires onError(empty_stream) when readyState stays 0", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(cb.onError).toHaveBeenCalledWith("empty_stream", expect.any(String));
    vi.useRealTimers();
    unmount();
  });

  it("registers video event listeners on playHLS", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    expect(videoRef.current.addEventListener).toHaveBeenCalledWith(
      "timeupdate",
      expect.any(Function),
    );
    expect(videoRef.current.addEventListener).toHaveBeenCalledWith(
      "durationchange",
      expect.any(Function),
    );
    expect(videoRef.current.addEventListener).toHaveBeenCalledWith(
      "ended",
      expect.any(Function),
    );
    expect(videoRef.current.addEventListener).toHaveBeenCalledWith(
      "waiting",
      expect.any(Function),
    );
    unmount();
  });

  it("clears video src before loading new HLS", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    expect(videoRef.current.removeAttribute).toHaveBeenCalledWith("src");
    unmount();
  });
});

// ═════════════════════════════════════════════════════════════
// 2. Native HLS path (Safari)
// ═════════════════════════════════════════════════════════════
describe("useHlsPlayer — native HLS (Safari)", () => {
  let videoRef: { current: HTMLVideoElement };
  let cb: HlsPlayerCallbacks;

  beforeEach(() => {
    resetTestState();
    vi.clearAllMocks();
  });
  beforeEach(() => {
    HlsSupported = false; // No hls.js support
    videoRef = { current: mockVideo({ canPlayType: vi.fn(() => "probably") }) };
    cb = makeCallbacks();
  });

  it("sets video.src when native HLS is supported", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    expect(videoRef.current.src).toBe("http://example.com/playlist.m3u8");
    unmount();
  });

  it("emits phase=playing and duration on loadedmetadata", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    const addCalls = (
      videoRef.current.addEventListener as ReturnType<typeof vi.fn>
    ).mock.calls;
    const loadedMetaCb = addCalls.find(
      ([e]: [string]) => e === "loadedmetadata",
    );
    expect(loadedMetaCb).toBeDefined();
    act(() => {
      loadedMetaCb?.[1]();
    });
    expect(cb.onDuration).toHaveBeenCalledWith(videoRef.current.duration);
    expect(cb.onPhaseChange).toHaveBeenCalledWith("playing");
    expect(videoRef.current.play).toHaveBeenCalled();
    unmount();
  });

  it("restores startPos on loadedmetadata when > 5", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8", 120);
    });
    const addCalls = (
      videoRef.current.addEventListener as ReturnType<typeof vi.fn>
    ).mock.calls;
    const loadedMetaCb = addCalls.find(
      ([e]: [string]) => e === "loadedmetadata",
    );
    act(() => {
      loadedMetaCb?.[1]();
    });
    expect(videoRef.current.currentTime).toBe(120);
    unmount();
  });
});

// ═════════════════════════════════════════════════════════════
// 3. Unsupported browser path
// ═════════════════════════════════════════════════════════════
describe("useHlsPlayer — unsupported browser", () => {
  let videoRef: { current: HTMLVideoElement };
  let cb: HlsPlayerCallbacks;

  beforeEach(() => {
    resetTestState();
    vi.clearAllMocks();
  });
  beforeEach(() => {
    HlsSupported = false;
    videoRef = { current: mockVideo({ canPlayType: vi.fn(() => "") }) };
    cb = makeCallbacks();
  });

  it("fires not_supported error when neither hls.js nor native HLS works", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    expect(cb.onError).toHaveBeenCalledWith(
      "not_supported",
      expect.any(String),
    );
    expect(cb.onPhaseChange).not.toHaveBeenCalled();
    unmount();
  });
});

// ═════════════════════════════════════════════════════════════
// 4. Cleanup and destroy
// ═════════════════════════════════════════════════════════════
describe("useHlsPlayer — cleanup and destroy", () => {
  let videoRef: { current: HTMLVideoElement };
  let cb: HlsPlayerCallbacks;

  beforeEach(() => {
    resetTestState();
    vi.clearAllMocks();
  });
  beforeEach(() => {
    videoRef = { current: mockVideo() };
    cb = makeCallbacks();
  });

  it("destroys Hls instance on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    act(() => {
      unmount();
    });
    expect(lastHls?.destroy).toHaveBeenCalled();
  });

  it("cleans up previous Hls when playHLS called multiple times", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/first.m3u8");
    });
    const firstHls = lastHls;
    act(() => {
      result.current.playHLS("http://example.com/second.m3u8");
    });
    expect(firstHls?.destroy).toHaveBeenCalled();
    expect(lastHls?.loadSource).toHaveBeenCalledWith(
      "http://example.com/second.m3u8",
    );
    unmount();
  });

  it("removes video event listeners on cleanup", () => {
    const { result, unmount } = renderHook(() =>
      useHlsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playHLS("http://example.com/playlist.m3u8");
    });
    act(() => {
      result.current.playHLS("http://example.com/another.m3u8");
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

// ═════════════════════════════════════════════════════════════
// Progress saving
// ═════════════════════════════════════════════════════════════
describe("useHlsPlayer — progress saving", () => {
  let videoRef: { current: HTMLVideoElement };
  let cb: HlsPlayerCallbacks;

  beforeEach(() => {
    resetTestState();
    vi.clearAllMocks();
    vi.useFakeTimers();
    videoRef = { current: mockVideo({ currentTime: 60, paused: false }) };
    cb = makeCallbacks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves progress every 5s when watchKey is set", () => {
    const { result, unmount } = renderHook(() => useHlsPlayer(videoRef, cb));
    act(() => {
      result.current.playHLS(
        "http://cdn/vod.m3u8",
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        "movie:1",
      );
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockSaveProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        video: videoRef.current,
        watchKey: "movie:1",
        type: "movie",
      }),
    );
    unmount();
  });

  it("registers progress sync on the 6th save (30s)", () => {
    const { result, unmount } = renderHook(() => useHlsPlayer(videoRef, cb));
    act(() => {
      result.current.playHLS(
        "http://cdn/vod.m3u8",
        null,
        "movie",
        "s1",
        "e1",
        "42",
        "movie:1",
      );
    });
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(mockSaveProgress).toHaveBeenCalled();
    expect(mockRegisterProgressSync).toHaveBeenCalled();
    unmount();
  });

  it("does not set up the progress interval without a watchKey", () => {
    const { result, unmount } = renderHook(() => useHlsPlayer(videoRef, cb));
    act(() => {
      result.current.playHLS("http://cdn/vod.m3u8");
    });
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(mockSaveProgress).not.toHaveBeenCalled();
    unmount();
  });

  it("clears the progress interval on unmount", () => {
    const { result, unmount } = renderHook(() => useHlsPlayer(videoRef, cb));
    act(() => {
      result.current.playHLS(
        "http://cdn/vod.m3u8",
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        "movie:1",
      );
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    const callsBefore = mockSaveProgress.mock.calls.length;
    unmount();
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(mockSaveProgress.mock.calls.length).toBe(callsBefore);
  });
});

// ═════════════════════════════════════════════════════════════
// Empty-stream detection (readyState transitions)
// ═════════════════════════════════════════════════════════════
describe("useHlsPlayer — empty stream detection", () => {
  let videoRef: { current: HTMLVideoElement };
  let cb: HlsPlayerCallbacks;

  beforeEach(() => {
    resetTestState();
    vi.clearAllMocks();
    vi.useFakeTimers();
    cb = makeCallbacks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires empty_stream when readyState stays 0 after 2s", () => {
    videoRef = { current: mockVideo({ readyState: 0 }) };
    const { result, unmount } = renderHook(() => useHlsPlayer(videoRef, cb));
    act(() => {
      result.current.playHLS(
        "http://cdn/vod.m3u8",
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        "movie:1",
      );
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(cb.onError).toHaveBeenCalledWith(
      "empty_stream",
      expect.stringContaining("Stream returned empty data"),
    );
    unmount();
  });

  it("does not fire empty_stream once readyState becomes positive", () => {
    // Start ready; then transition to readyState 1 — the checker clears
    videoRef = { current: mockVideo({ readyState: 1 }) };
    const { result, unmount } = renderHook(() => useHlsPlayer(videoRef, cb));
    act(() => {
      result.current.playHLS(
        "http://cdn/vod.m3u8",
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        "movie:1",
      );
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(cb.onError).not.toHaveBeenCalledWith(
      "empty_stream",
      expect.any(String),
    );
    unmount();
  });
});
