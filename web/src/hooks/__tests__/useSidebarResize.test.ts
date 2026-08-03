/**
 * Tests for useSidebarResize — sidebar drag-to-resize hook with
 * localStorage persistence and min/max clamping.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useSidebarResize,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  SIDEBAR_DEFAULT,
} from "@/hooks/useSidebarResize";

describe("useSidebarResize", () => {
  afterEach(() => {
    localStorage.clear();
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", vi.fn());
    document.removeEventListener("mouseup", vi.fn());
  });

  it("returns the default width when nothing is saved", () => {
    const { result } = renderHook(() => useSidebarResize());
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT);
  });

  it("reads a saved width from localStorage", () => {
    localStorage.setItem("stv_sidebar_width", "300");
    const { result } = renderHook(() => useSidebarResize());
    expect(result.current.sidebarWidth).toBe(300);
  });

  it("reads legacy stv-sidebar-width as fallback", () => {
    localStorage.setItem("stv-sidebar-width", "260");
    const { result } = renderHook(() => useSidebarResize());
    expect(result.current.sidebarWidth).toBe(260);
  });

  it("clamps saved width to the min", () => {
    localStorage.setItem("stv_sidebar_width", "10");
    const { result } = renderHook(() => useSidebarResize());
    expect(result.current.sidebarWidth).toBe(SIDEBAR_MIN);
  });

  it("clamps saved width to the max", () => {
    localStorage.setItem("stv_sidebar_width", "9999");
    const { result } = renderHook(() => useSidebarResize());
    expect(result.current.sidebarWidth).toBe(SIDEBAR_MAX);
  });

  it("resizes on drag and persists the width on mouseup", () => {
    const { result } = renderHook(() => useSidebarResize());
    const dragEvent = {
      preventDefault: vi.fn(),
      clientX: 0,
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.onResizeStart(dragEvent);
    });
    expect(dragEvent.preventDefault).toHaveBeenCalled();
    expect(document.body.style.cursor).toBe("ew-resize");

    // Drag to x=350 (within bounds)
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 350 }));
    });
    expect(result.current.sidebarWidth).toBe(350);

    // Drag beyond max -> clamped
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 2000 }));
    });
    expect(result.current.sidebarWidth).toBe(SIDEBAR_MAX);

    // Release -> persists the clamped value
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(localStorage.getItem("stv_sidebar_width")).toBe(String(SIDEBAR_MAX));
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("clamps drag below min", () => {
    const { result } = renderHook(() => useSidebarResize());
    act(() => {
      result.current.onResizeStart({
        preventDefault: vi.fn(),
        clientX: 0,
      } as unknown as React.MouseEvent);
    });
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 5 }));
    });
    expect(result.current.sidebarWidth).toBe(SIDEBAR_MIN);
  });
});
