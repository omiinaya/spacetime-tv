/**
 * Tests for useFrameRateDetector hook.
 *
 * The hook relies on requestVideoFrameCallback which isn't available
 * in jsdom. We mock it on the HTMLVideoElement prototype manually.
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useFrameRateDetector } from "@/hooks/useFrameRateDetector";

// ── Mock helpers ──────────────────────────────────────────────

type VideoFrameCb = (now: DOMHighResTimeStamp, metadata: any) => void;
let mockCallback: VideoFrameCb | null = null;
let mockHandle = 100;

function setupRVFCOnPrototype() {
  // Direct assignment instead of vi.spyOn because jsdom doesn't have these
  // properties on HTMLVideoElement.prototype at all.
  (HTMLVideoElement.prototype as any).requestVideoFrameCallback = function (
    this: HTMLVideoElement,
    cb: VideoFrameCb,
  ) {
    mockCallback = cb;
    return mockHandle++;
  };

  (HTMLVideoElement.prototype as any).cancelVideoFrameCallback = function (
    _id: number,
  ) {
    mockCallback = null;
  };
}

function removeRVFCFromPrototype() {
  delete (HTMLVideoElement.prototype as any).requestVideoFrameCallback;
  delete (HTMLVideoElement.prototype as any).cancelVideoFrameCallback;
}

/** Simulate a frame callback at the given mediaTime. */
function simulateFrame(mediaTime: number) {
  if (mockCallback) {
    const metadata = {
      mediaTime,
      presentationTime: performance.now(),
      expectedDisplayTime: performance.now() + 0.01,
      width: 1920,
      height: 1080,
      processingDuration: 0.001,
      presentedFrames: 1,
      possibleFrames: 1,
      frameMetadata: null,
    };
    act(() => {
      mockCallback!(performance.now(), metadata);
    });
  }
}

// ── Tests ──────────────────────────────────────────────────────

describe("useFrameRateDetector", () => {
  beforeEach(() => {
    mockCallback = null;
    mockHandle = 100;
    vi.useFakeTimers();
  });

  afterEach(() => {
    removeRVFCFromPrototype();
  });

  it("returns supported=false when requestVideoFrameCallback is absent", () => {
    const ref = { current: document.createElement("video") };
    const { result } = renderHook(() => useFrameRateDetector(ref, true));
    expect(result.current.supported).toBe(false);
    expect(result.current.videoFps).toBe(0);
    expect(result.current.label).toBe("—");
  });

  it("returns supported=true when API is available", () => {
    setupRVFCOnPrototype();
    const ref = { current: document.createElement("video") };
    const { result } = renderHook(() => useFrameRateDetector(ref, true));
    expect(result.current.supported).toBe(true);
  });

  it("detects 30 fps from frame callbacks", () => {
    setupRVFCOnPrototype();
    const ref = { current: document.createElement("video") };
    const { result } = renderHook(() => useFrameRateDetector(ref, true));

    for (let i = 1; i <= 35; i++) {
      simulateFrame(i / 30);
    }

    act(() => {});
    expect(result.current.videoFps).toBe(30);
    expect(result.current.label).toBe("30 fps");
  });

  it("detects 24 fps from frame callbacks", () => {
    setupRVFCOnPrototype();
    const ref = { current: document.createElement("video") };
    const { result } = renderHook(() => useFrameRateDetector(ref, true));

    for (let i = 1; i <= 35; i++) {
      simulateFrame(i / 24);
    }

    act(() => {});
    expect(result.current.videoFps).toBe(24);
    expect(result.current.label).toBe("24 fps");
  });

  it("detects 50 fps from frame callbacks", () => {
    setupRVFCOnPrototype();
    const ref = { current: document.createElement("video") };
    const { result } = renderHook(() => useFrameRateDetector(ref, true));

    for (let i = 1; i <= 35; i++) {
      simulateFrame(i / 50);
    }

    act(() => {});
    expect(result.current.videoFps).toBe(50);
    expect(result.current.label).toBe("50 fps");
  });

  it("detects 60 fps from frame callbacks", () => {
    setupRVFCOnPrototype();
    const ref = { current: document.createElement("video") };
    const { result } = renderHook(() => useFrameRateDetector(ref, true));

    for (let i = 1; i <= 35; i++) {
      simulateFrame(i / 60);
    }

    act(() => {});
    expect(result.current.videoFps).toBeGreaterThanOrEqual(58);
    expect(result.current.videoFps).toBeLessThanOrEqual(62);
    expect(result.current.label).toMatch(/fps/);
  });

  it("returns 0 fps before enough samples are collected", () => {
    setupRVFCOnPrototype();
    const ref = { current: document.createElement("video") };
    const { result } = renderHook(() => useFrameRateDetector(ref, true));

    simulateFrame(1 / 60);
    simulateFrame(2 / 60);
    simulateFrame(3 / 60);

    act(() => {});
    expect(result.current.videoFps).toBe(0);
    expect(result.current.label).toBe("—");
  });

  it("does not activate when active=false", () => {
    setupRVFCOnPrototype();
    const ref = { current: document.createElement("video") };
    const { result } = renderHook(() => useFrameRateDetector(ref, false));
    // Should not error and should have initial values
    expect(result.current.supported).toBe(true);
    expect(result.current.videoFps).toBe(0);
    expect(result.current.label).toBe("—");
  });

  it("handles null video ref gracefully", () => {
    setupRVFCOnPrototype();
    const { result } = renderHook(() =>
      useFrameRateDetector({ current: null }, true),
    );
    expect(result.current.supported).toBe(true);
    expect(result.current.videoFps).toBe(0);
    expect(result.current.label).toBe("—");
  });

  it("exposes displayHz (defaults to 60)", () => {
    setupRVFCOnPrototype();
    const ref = { current: document.createElement("video") };
    const { result } = renderHook(() => useFrameRateDetector(ref, true));
    expect(result.current.displayHz).toBe(60);
  });
});
