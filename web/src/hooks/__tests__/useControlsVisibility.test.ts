/**
 * Tests for useControlsVisibility — player controls auto-hide timer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useControlsVisibility } from "@/hooks/useControlsVisibility";

describe("useControlsVisibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with controls visible", () => {
    const { result } = renderHook(() => useControlsVisibility());
    expect(result.current.controlsVisible).toBe(true);
  });

  it("showControls sets visible without timer by default", () => {
    const { result } = renderHook(() => useControlsVisibility());

    act(() => result.current.hideControls());
    expect(result.current.controlsVisible).toBe(false);

    act(() => result.current.showControls());
    expect(result.current.controlsVisible).toBe(true);
  });

  it("hideControls hides immediately", () => {
    const { result } = renderHook(() => useControlsVisibility());

    expect(result.current.controlsVisible).toBe(true);
    act(() => result.current.hideControls());
    expect(result.current.controlsVisible).toBe(false);
  });

  it("showControls with temporary=true auto-hides after 3 seconds", () => {
    const { result } = renderHook(() => useControlsVisibility());

    act(() => result.current.showControls(true));
    expect(result.current.controlsVisible).toBe(true);

    // Advance 2s — still visible
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.controlsVisible).toBe(true);

    // Advance past 3s — hidden
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.controlsVisible).toBe(false);
  });

  it("showControls extends timer when called again", () => {
    const { result } = renderHook(() => useControlsVisibility());

    act(() => result.current.showControls(true));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.controlsVisible).toBe(true);

    // Re-show — resets timer
    act(() => result.current.showControls(true));
    act(() => vi.advanceTimersByTime(2000));
    // Still visible because timer was reset
    expect(result.current.controlsVisible).toBe(true);

    // Advance past the reset timer
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.controlsVisible).toBe(false);
  });

  it("showControls without temporary=true does not auto-hide", () => {
    const { result } = renderHook(() => useControlsVisibility());

    act(() => result.current.showControls());
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.controlsVisible).toBe(true);
  });

  it("hideControls clears pending timer", () => {
    const { result } = renderHook(() => useControlsVisibility());

    act(() => result.current.showControls(true));
    act(() => result.current.hideControls());
    expect(result.current.controlsVisible).toBe(false);

    // Timer should have been cleared, so no auto-show
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.controlsVisible).toBe(false);
  });
});
