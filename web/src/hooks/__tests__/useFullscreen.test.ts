import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFullscreen } from "../useFullscreen";

describe("useFullscreen", () => {
  beforeEach(() => {
    // Clear fullscreen element for clean state
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  it("starts as not fullscreen", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.isFullscreen).toBe(false);
  });

  it("responds to fullscreenchange event (entering)", () => {
    const { result } = renderHook(() => useFullscreen());
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: document.createElement("div"),
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(true);
  });

  it("responds to fullscreenchange event (exiting)", () => {
    // Start in fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      value: document.createElement("div"),
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useFullscreen());
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: null,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it("responds to webkitfullscreenchange", () => {
    const { result } = renderHook(() => useFullscreen());
    act(() => {
      Object.defineProperty(document, "webkitFullscreenElement", {
        value: document.createElement("div"),
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("webkitfullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(true);
  });

  it("allows optimistic set via setIsFullscreen", () => {
    const { result } = renderHook(() => useFullscreen());
    act(() => {
      result.current.setIsFullscreen(true);
    });
    expect(result.current.isFullscreen).toBe(true);
  });

  it("cleans up event listeners on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useFullscreen());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("webkitfullscreenchange", expect.any(Function));
    removeSpy.mockRestore();
  });
});
