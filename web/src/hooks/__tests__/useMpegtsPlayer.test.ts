/**
 * Tests for useMpegtsPlayer — live MPEG-TS playback via mpegts.js
 *
 * Covers: playMPEGTS lifecycle, error recovery (reconnect), health-check
 * reconnect after 15s no-stats, DVR time tracking, cleanup/destroy.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useMpegtsPlayer,
  type MpegtsPlayerCallbacks,
} from "@/hooks/useMpegtsPlayer";

// ── Mock mpegts.js ───────────────────────────────────────────
// Module-level mutable state — vi.mock references it via strings
// (not variables) to avoid hoisting TDZ issues.
const state = {
  lastPlayer: null as Record<string, ReturnType<typeof vi.fn>> | null,
  listeners: {} as Record<string, Array<(...args: unknown[]) => void>>,
  createPlayerCalls: 0,
};

function makeMockPlayer() {
  const p = {
    attachMediaElement: vi.fn(),
    load: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn((evt: string, cb: (...args: unknown[]) => void) => {
      if (!state.listeners[evt]) state.listeners[evt] = [];
      state.listeners[evt].push(cb);
    }),
  };
  return p;
}

function fireMpegtsEvent(event: string, ...args: unknown[]) {
  for (const cb of state.listeners[event] || []) cb(...args);
}

vi.mock("mpegts.js", () => {
  const Events = {
    MEDIA_INFO: "media_info",
    LOADING_COMPLETE: "loading_complete",
    STATISTICS_INFO: "statistics_info",
    ERROR: "error",
  };
  return {
    default: {
      Events,
      createPlayer: vi.fn(() => {
        state.createPlayerCalls++;
        const p = makeMockPlayer();
        state.lastPlayer = p;
        return p;
      }),
    },
  };
});

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
    currentTime: 0,
    buffered: { length: 0 },
    ...overrides,
  } as unknown as HTMLVideoElement;
}

function makeCallbacks(): MpegtsPlayerCallbacks {
  return {
    onPhaseChange: vi.fn(),
    onError: vi.fn(),
    onAutoplayMuted: vi.fn(),
    onStats: vi.fn(),
    onStall: vi.fn(),
    onPlaying: vi.fn(),
    onLiveTimeUpdate: vi.fn(),
    clearLoadingTimeout: vi.fn(),
    startLoadingTimeout: vi.fn(),
  };
}

function resetTestState() {
  Object.keys(state.listeners).forEach((k) => delete state.listeners[k]);
  state.lastPlayer = null;
  state.createPlayerCalls = 0;
  vi.clearAllMocks();
}

// ═════════════════════════════════════════════════════════════
describe("useMpegtsPlayer", () => {
  let videoRef: { current: HTMLVideoElement };
  let cb: MpegtsPlayerCallbacks;

  beforeEach(() => {
    resetTestState();
  });
  beforeEach(() => {
    videoRef = { current: mockVideo() };
    cb = makeCallbacks();
  });

  it("creates mpegts player and attaches media on playMPEGTS", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });

    expect(state.createPlayerCalls).toBe(1);
    expect(state.lastPlayer?.attachMediaElement).toHaveBeenCalledWith(
      videoRef.current,
    );
    expect(state.lastPlayer?.load).toHaveBeenCalled();
    expect(cb.onPhaseChange).toHaveBeenCalledWith("loading");
    unmount();
  });

  it("calls startLoadingTimeout on playMPEGTS", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });
    expect(cb.startLoadingTimeout).toHaveBeenCalled();
    unmount();
  });

  it("removes src attribute before creating player", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });
    expect(videoRef.current.removeAttribute).toHaveBeenCalledWith("src");
    unmount();
  });

  it("destroys previous player on consecutive calls", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/first.ts", true, false);
    });
    const firstPlayer = state.lastPlayer;
    act(() => {
      result.current.playMPEGTS("http://example.com/second.ts", true, false);
    });
    expect(firstPlayer?.destroy).toHaveBeenCalled();
    unmount();
  });

  it("triggers autoplay on MEDIA_INFO", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });
    act(() => {
      fireMpegtsEvent("media_info");
    });
    expect(videoRef.current.play).toHaveBeenCalled();
    unmount();
  });

  it("triggers autoplay on LOADING_COMPLETE", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });
    act(() => {
      fireMpegtsEvent("loading_complete");
    });
    expect(videoRef.current.play).toHaveBeenCalled();
    unmount();
  });

  it("fires onStats on STATISTICS_INFO", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });
    act(() => {
      fireMpegtsEvent("statistics_info", {
        speed: 1500,
        droppedFrames: 5,
        decodedFrames: 100,
      });
    });
    expect(cb.onStats).toHaveBeenCalledWith(1500, 5, 100);
    unmount();
  });

  it("does NOT reconnect when detail.response.code is 0", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });
    const prevPlayer = state.lastPlayer;
    act(() => {
      fireMpegtsEvent("error", "", { response: { code: 0 } });
    });
    expect(prevPlayer?.destroy).not.toHaveBeenCalled();
    unmount();
  });

  it("reconnects when ERROR fires with non-zero code", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });
    const prevPlayer = state.lastPlayer;
    act(() => {
      fireMpegtsEvent("error", "", { response: { code: 500 } });
    });
    expect(prevPlayer?.destroy).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // A new player should have been created (total calls >= 2)
    expect(state.createPlayerCalls).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
    unmount();
  });

  it("reconnects health check after 20s without stats when live", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });
    const prevPlayer = state.lastPlayer;

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(prevPlayer?.destroy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(prevPlayer?.destroy).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(state.createPlayerCalls).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
    unmount();
  });

  it("does NOT reconnect health check for non-live (VOD)", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", false, false);
    });
    const prevPlayer = state.lastPlayer;
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(prevPlayer?.destroy).not.toHaveBeenCalled();
    vi.useRealTimers();
    unmount();
  });

  it("calls onLiveTimeUpdate on timeupdate for live", () => {
    videoRef.current = mockVideo({
      currentTime: 30,
      buffered: { length: 1, start: vi.fn(() => 0), end: vi.fn(() => 60) },
    }) as HTMLVideoElement;
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });

    const addCalls = (
      videoRef.current.addEventListener as ReturnType<typeof vi.fn>
    ).mock.calls;
    const timeCb = addCalls.find(([e]: [string]) => e === "timeupdate");
    act(() => {
      timeCb?.[1]();
    });
    expect(cb.onLiveTimeUpdate).toHaveBeenCalledWith(30, 0, 60, 30, true);
    unmount();
  });

  it("calls onStall when waiting event fires", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
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

  it("destroys player on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });
    const player = state.lastPlayer;
    act(() => {
      unmount();
    });
    expect(player?.destroy).toHaveBeenCalled();
  });

  it("removes event listeners on cleanup", () => {
    const { result, unmount } = renderHook(() =>
      useMpegtsPlayer(videoRef as React.RefObject<HTMLVideoElement>, cb),
    );
    act(() => {
      result.current.playMPEGTS("http://example.com/stream.ts", true, false);
    });
    act(() => {
      result.current.playMPEGTS("http://example.com/stream2.ts", true, false);
    });
    expect(videoRef.current.removeEventListener).toHaveBeenCalledWith(
      "playing",
      expect.any(Function),
    );
    expect(videoRef.current.removeEventListener).toHaveBeenCalledWith(
      "waiting",
      expect.any(Function),
    );
    expect(videoRef.current.removeEventListener).toHaveBeenCalledWith(
      "timeupdate",
      expect.any(Function),
    );
    unmount();
  });
});
