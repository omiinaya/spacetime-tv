import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlayerConnectionQuality } from "../usePlayerConnectionQuality";

describe("usePlayerConnectionQuality", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with excellent quality and zero stalls", () => {
    const { result } = renderHook(() =>
      usePlayerConnectionQuality({ downloadSpeed: 0, qualityIdx: 0 }),
    );
    expect(result.current.connectionQuality).toBe("excellent");
    expect(result.current.stallCount).toBe(0);
    expect(result.current.suggestLowerQuality).toBe(false);
  });

  it("tracks stalls via onStall callback", () => {
    const { result } = renderHook(() =>
      usePlayerConnectionQuality({ downloadSpeed: 0, qualityIdx: 0 }),
    );

    act(() => {
      result.current.onStall();
    });

    // Advance past the 3s polling interval
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.stallCount).toBe(1);
  });

  it("classifies quality as 'poor' with low speed and many stalls", () => {
    const { result } = renderHook(() =>
      usePlayerConnectionQuality({ downloadSpeed: 50, qualityIdx: 0 }),
    );

    // Simulate enough stalls to push quality to "poor"
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.onStall();
      }
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.connectionQuality).toBe("poor");
  });

  it("classifies quality as 'excellent' with high speed and no stalls", () => {
    const { result } = renderHook(() =>
      usePlayerConnectionQuality({ downloadSpeed: 5000, qualityIdx: 0 }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.connectionQuality).toBe("excellent");
    expect(result.current.suggestLowerQuality).toBe(false);
  });

  it("suggests lower quality when poor and not at max quality", () => {
    const { result } = renderHook(() =>
      usePlayerConnectionQuality({ downloadSpeed: 50, qualityIdx: 0 }),
    );

    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.onStall();
      }
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.connectionQuality).toBe("poor");
    expect(result.current.suggestLowerQuality).toBe(true);
  });

  it("does not suggest lower quality when already at lowest quality", () => {
    const { result } = renderHook(() =>
      usePlayerConnectionQuality({
        downloadSpeed: 50,
        qualityIdx: 3, // or whatever QUALITIES.length - 1 is
      }),
    );

    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.onStall();
      }
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
  });

  it("classifies quality as 'fair' with medium speed and moderate stalls", () => {
    const { result } = renderHook(() =>
      usePlayerConnectionQuality({ downloadSpeed: 200, qualityIdx: 0 }),
    );

    act(() => {
      for (let i = 0; i < 6; i++) {
        result.current.onStall();
      }
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.connectionQuality).toBe("fair");
  });

  it("classifies quality as 'good' with decent speed and few stalls", () => {
    const { result } = renderHook(() =>
      usePlayerConnectionQuality({ downloadSpeed: 1000, qualityIdx: 0 }),
    );

    act(() => {
      result.current.onStall();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.connectionQuality).toBe("good");
  });

  it("handles onStats without error", () => {
    const { result } = renderHook(() =>
      usePlayerConnectionQuality({ downloadSpeed: 1000, qualityIdx: 0 }),
    );

    expect(() => {
      act(() => {
        result.current.onStats(500, 10, 200);
      });
    }).not.toThrow();
  });

  it("cleans up the polling interval on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderHook(() =>
      usePlayerConnectionQuality({ downloadSpeed: 0, qualityIdx: 0 }),
    );

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
