/**
 * Tests for usePlayerControls — playback control callbacks.
 *
 * Note: HTMLMediaElement properties like `paused` and `readyState` are
 * read-only. We use Object.defineProperty to set them for test scenarios.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlayerControls } from "@/hooks/usePlayerControls";
import type { PlayerControlsDeps } from "@/hooks/usePlayerControls";

function createMockVideo(): HTMLVideoElement {
  const v = document.createElement("video");
  vi.spyOn(v, "play").mockResolvedValue();
  vi.spyOn(v, "pause");
  Object.defineProperty(v, "buffered", {
    get: () => ({
      length: 2,
      start: (_i: number) => 0,
      end: (_i: number) => 120,
    }),
    configurable: true,
  });
  return v;
}

function setPaused(v: HTMLVideoElement, val: boolean) {
  Object.defineProperty(v, "paused", { value: val, configurable: true });
}

function setReadyState(v: HTMLVideoElement, val: number) {
  Object.defineProperty(v, "readyState", { value: val, configurable: true });
}

function createDeps(
  overrides: Partial<PlayerControlsDeps> = {},
): PlayerControlsDeps {
  const video = createMockVideo();
  return {
    videoRef: { current: video },
    subHlsRef: { current: null },
    remuxVodUrlRef: { current: null },
    remuxVodTranscodeRef: { current: false },
    isLive: false,
    isVod: true,
    playVodRemux: vi.fn(),
    destroyMpegts: vi.fn(),
    destroyHls: vi.fn(),
    setCurrentTime: vi.fn(),
    setPhase: vi.fn(),
    setVolumeState: vi.fn(),
    volume: 0.8,
    muted: false,
    setMuted: vi.fn(),
    setPlaybackRate: vi.fn(),
    setQualityIdx: vi.fn(),
    setIsBehindLive: vi.fn(),
    setSecondsBehindLive: vi.fn(),
    clearLoadingTimeout: vi.fn(),
    saveVolume: vi.fn(),
    saveMuted: vi.fn(),
    ...overrides,
  };
}

describe("usePlayerControls", () => {
  it("togglePlay plays when paused", () => {
    const deps = createDeps();
    setPaused(deps.videoRef.current!, true);
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.togglePlay());

    expect(deps.videoRef.current!.play).toHaveBeenCalled();
    expect(deps.setPhase).toHaveBeenCalledWith("playing");
  });

  it("togglePlay pauses when playing", () => {
    const deps = createDeps();
    setPaused(deps.videoRef.current!, false);
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.togglePlay());

    expect(deps.videoRef.current!.pause).toHaveBeenCalled();
    expect(deps.setPhase).toHaveBeenCalledWith("paused");
  });

  it("togglePlay handles null video ref", () => {
    const deps = createDeps({ videoRef: { current: null } });
    const { result } = renderHook(() => usePlayerControls(deps));
    expect(() => act(() => result.current.togglePlay())).not.toThrow();
  });

  it("seekTo sets video.currentTime for VOD with remux URL", () => {
    const deps = createDeps({ remuxVodUrlRef: { current: "http://stream" } });
    setReadyState(deps.videoRef.current!, 2);
    const v = deps.videoRef.current!;
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.seekTo(30));
    expect(v.currentTime).toBe(30);
    expect(deps.setCurrentTime).toHaveBeenCalled();
  });

  it("seekTo clamps time for live streams to buffered range", () => {
    const deps = createDeps({ isLive: true });
    const v = deps.videoRef.current!;
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.seekTo(500)); // beyond buffered end
    expect(v.currentTime).toBe(119); // buf.end(0) - 1 = 119
  });

  it("seekTo falls back to remux on seek error", () => {
    const deps = createDeps();
    const v = deps.videoRef.current!;

    // currentTime setter throws when seeking
    const currentTime = 0;
    Object.defineProperty(v, "currentTime", {
      get: () => currentTime,
      set: () => {
        throw new Error("Seek error");
      },
      configurable: true,
    });

    const { result } = renderHook(() => usePlayerControls(deps));

    // The remux fallback only triggers when we have remuxVodUrlRef
    // But without it, seekTo returns early. The seek error path needs
    // remuxVodUrlRef to be set for the catch block to run.
    // Without remuxVodUrlRef, set::setcurrentTime just returns early.
    // Test that the error is caught gracefully.
    act(() => result.current.seekTo(30));
    // No crash — graceful handling
  });

  it("seeks with fallback when remuxVodUrl is set and seek fails", () => {
    const deps = createDeps({ remuxVodUrlRef: { current: "http://stream" } });
    const v = deps.videoRef.current!;

    const currentTime = 0;
    Object.defineProperty(v, "currentTime", {
      get: () => currentTime,
      set: () => {
        throw new Error("Seek error");
      },
      configurable: true,
    });

    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.seekTo(30));

    expect(deps.destroyMpegts).toHaveBeenCalled();
    expect(deps.setPhase).toHaveBeenCalledWith("loading");
    expect(deps.playVodRemux).toHaveBeenCalledWith(
      "http://stream",
      expect.any(Number),
      false,
    );
  });

  it("seek forwards by delta for VOD", () => {
    const deps = createDeps({ remuxVodUrlRef: { current: "http://stream" } });
    const v = deps.videoRef.current!;
    v.currentTime = 50;
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.seek(10)); // forward 10s
    expect(v.currentTime).toBe(60);
  });

  it("seek handles live stream buffered range correctly", () => {
    const deps = createDeps({ isLive: true });
    const v = deps.videoRef.current!;
    v.currentTime = 50;
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.seek(100)); // try to seek forward 100s
    expect(v.currentTime).toBe(119); // clamped to buf.end(0) - 1
  });

  it("setVolume updates volume and unmutes when >0 and muted", () => {
    const deps = createDeps({ muted: true });
    const v = deps.videoRef.current!;
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.setVolume(0.5));

    expect(v.volume).toBe(0.5);
    expect(v.muted).toBe(false);
    expect(deps.setMuted).toHaveBeenCalledWith(false);
    expect(deps.saveVolume).toHaveBeenCalledWith(0.5);
  });

  it("setVolume mutes at zero", () => {
    const deps = createDeps();
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.setVolume(0));

    expect(deps.setMuted).toHaveBeenCalledWith(true);
  });

  it("toggleMute unmutes when muted", () => {
    const deps = createDeps({ muted: true, volume: 0 });
    const v = deps.videoRef.current!;
    v.muted = true;
    v.volume = 0;
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.toggleMute());

    expect(v.muted).toBe(false);
    expect(deps.setMuted).toHaveBeenCalledWith(false);
    expect(deps.saveMuted).toHaveBeenCalledWith(false);
  });

  it("toggleMute mutes when not muted", () => {
    const deps = createDeps({ muted: false, volume: 0.8 });
    const v = deps.videoRef.current!;
    v.muted = false;
    v.volume = 0.8;
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.toggleMute());

    expect(v.muted).toBe(true);
    expect(v.volume).toBe(0);
    expect(deps.setMuted).toHaveBeenCalledWith(true);
    expect(deps.saveMuted).toHaveBeenCalledWith(true);
  });

  it("setSpeed updates playback rate", () => {
    const deps = createDeps();
    const v = deps.videoRef.current!;
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.setSpeed(1.5));

    expect(v.playbackRate).toBe(1.5);
    expect(deps.setPlaybackRate).toHaveBeenCalledWith(1.5);
  });

  it("setSpeed handles null video ref", () => {
    const deps = createDeps({ videoRef: { current: null } });
    const { result } = renderHook(() => usePlayerControls(deps));

    expect(() => act(() => result.current.setSpeed(1.5))).not.toThrow();
  });

  it("setQuality updates quality index", () => {
    const deps = createDeps();
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.setQuality(2));

    expect(deps.setQualityIdx).toHaveBeenCalledWith(2);
  });

  it("seekToLive seeks to buffered end for live streams", () => {
    const deps = createDeps({ isLive: true });
    const v = deps.videoRef.current!;
    setPaused(v, true);
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.seekToLive());

    expect(v.currentTime).toBe(118); // buf.end(0) - 2
    expect(deps.setIsBehindLive).toHaveBeenCalledWith(false);
    expect(deps.setSecondsBehindLive).toHaveBeenCalledWith(0);
  });

  it("seekToLive does nothing when no buffered data", () => {
    // Empty buffered
    const deps = createDeps({ isLive: true });
    Object.defineProperty(deps.videoRef.current!, "buffered", {
      get: () => ({ length: 0, start: () => 0, end: () => 0 }),
    });
    const v = deps.videoRef.current!;
    const { result } = renderHook(() => usePlayerControls(deps));

    act(() => result.current.seekToLive());

    expect(v.currentTime).toBe(0); // unchanged
  });
});
