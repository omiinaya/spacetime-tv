/**
 * Tests for useKeyboard — global keyboard shortcuts for the player.
 *
 * Covers: Space/k = togglePlay, ArrowLeft/j = seek -10s,
 * ArrowRight/l = seek +10s, f = fullscreen, m = mute,
 * ArrowUp/Down = volume ±0.1, input gating, listener cleanup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboard } from "@/hooks/useKeyboard";

function createCallbacks() {
  return {
    togglePlay: vi.fn(),
    seek: vi.fn(),
    toggleFullscreen: vi.fn(),
    toggleMute: vi.fn(),
    setVolume: vi.fn(),
    volume: 0.5,
  };
}

function fireKey(key: string, opts: Partial<KeyboardEvent> = {}) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...opts }),
  );
}

describe("useKeyboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("toggles play on Space", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey(" ");
    expect(cb.togglePlay).toHaveBeenCalledOnce();
  });

  it("toggles play on k", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey("k");
    expect(cb.togglePlay).toHaveBeenCalledOnce();
  });

  it("seeks -10s on ArrowLeft", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey("ArrowLeft");
    expect(cb.seek).toHaveBeenCalledWith(-10);
  });

  it("seeks -10s on j", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey("j");
    expect(cb.seek).toHaveBeenCalledWith(-10);
  });

  it("seeks +10s on ArrowRight", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey("ArrowRight");
    expect(cb.seek).toHaveBeenCalledWith(10);
  });

  it("seeks +10s on l", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey("l");
    expect(cb.seek).toHaveBeenCalledWith(10);
  });

  it("toggles fullscreen on f", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey("f");
    expect(cb.toggleFullscreen).toHaveBeenCalledOnce();
  });

  it("toggles mute on m", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey("m");
    expect(cb.toggleMute).toHaveBeenCalledOnce();
  });

  it("increases volume on ArrowUp", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey("ArrowUp");
    expect(cb.setVolume).toHaveBeenCalledWith(0.6);
  });

  it("decreases volume on ArrowDown", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey("ArrowDown");
    expect(cb.setVolume).toHaveBeenCalledWith(0.4);
  });

  it("clamps volume at 1.0 on ArrowUp", () => {
    const cb = createCallbacks();
    cb.volume = 0.95;
    renderHook(() => useKeyboard(cb));
    fireKey("ArrowUp");
    expect(cb.setVolume).toHaveBeenCalledWith(1);
  });

  it("clamps volume at 0 on ArrowDown", () => {
    const cb = createCallbacks();
    cb.volume = 0.03;
    renderHook(() => useKeyboard(cb));
    fireKey("ArrowDown");
    expect(cb.setVolume).toHaveBeenCalledWith(0);
  });

  it("prevents default for Space, ArrowLeft, ArrowRight", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    const space = new KeyboardEvent("keydown", { key: " " });
    const left = new KeyboardEvent("keydown", { key: "ArrowLeft" });
    const right = new KeyboardEvent("keydown", { key: "ArrowRight" });
    const sp = vi.spyOn(space, "preventDefault");
    const l = vi.spyOn(left, "preventDefault");
    const r = vi.spyOn(right, "preventDefault");
    window.dispatchEvent(space);
    expect(sp).toHaveBeenCalledOnce();
    window.dispatchEvent(left);
    expect(l).toHaveBeenCalledOnce();
    window.dispatchEvent(right);
    expect(r).toHaveBeenCalledOnce();
  });

  it("does not prevent default for f or m", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    const fe = new KeyboardEvent("keydown", { key: "f" });
    const me = new KeyboardEvent("keydown", { key: "m" });
    const fSpy = vi.spyOn(fe, "preventDefault");
    const mSpy = vi.spyOn(me, "preventDefault");
    window.dispatchEvent(fe);
    expect(fSpy).not.toHaveBeenCalled();
    window.dispatchEvent(me);
    expect(mSpy).not.toHaveBeenCalled();
  });

  it("skips handler when focused on INPUT", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    // Dispatch on input so event target is the input element
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(cb.togglePlay).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("skips handler when focused on TEXTAREA", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(cb.togglePlay).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it("cleans up event listener on unmount", () => {
    const cb = createCallbacks();
    const { unmount } = renderHook(() => useKeyboard(cb));
    unmount();
    // After unmount, listener should be removed
    const spy = vi.spyOn(cb, "togglePlay");
    fireKey(" ");
    expect(spy).not.toHaveBeenCalled();
  });

  it("responds to arrow keys when not in input", () => {
    const cb = createCallbacks();
    renderHook(() => useKeyboard(cb));
    fireKey("ArrowUp");
    expect(cb.setVolume).toHaveBeenCalledOnce();
  });

  it("updates handler when volume changes", () => {
    const cb = createCallbacks();
    const { rerender } = renderHook(({ v }) => useKeyboard({ ...cb, volume: v }), {
      initialProps: { v: 0.5 },
    });
    fireKey("ArrowUp");
    expect(cb.setVolume).toHaveBeenCalledWith(0.6);

    // Rerender with higher volume then fire ArrowDown
    cb.setVolume.mockClear();
    rerender({ v: 0.9 });
    fireKey("ArrowDown");
    expect(cb.setVolume).toHaveBeenCalledWith(0.8);
  });
});
