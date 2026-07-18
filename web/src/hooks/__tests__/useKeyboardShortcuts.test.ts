import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";

const mockNavigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

describe("useKeyboardShortcuts", () => {
  let events: Map<string, (e: any) => void>;

  beforeEach(() => {
    mockNavigate.mockClear();
    // Track registered event listeners
    events = new Map();
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, handler: any) => {
        events.set(type, handler);
      },
    );
    vi.spyOn(window, "removeEventListener").mockImplementation(
      (type: string) => {
        events.delete(type);
      },
    );
    // Default: no input focused
    document.activeElement?.blur();
  });

  function fireKey(key: string, extra: Record<string, any> = {}) {
    const handler = events.get("keydown");
    if (handler) {
      handler(new KeyboardEvent("keydown", { key, ...extra }));
    }
  }

  it("registers a keydown listener", () => {
    renderHook(() => useKeyboardShortcuts());
    expect(events.has("keydown")).toBe(true);
  });

  it("navigates to /guide on g", () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey("g");
    expect(mockNavigate).toHaveBeenCalledWith("/guide");
  });

  it("navigates to / on h", () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey("h");
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("navigates to /movies on m", () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey("m");
    expect(mockNavigate).toHaveBeenCalledWith("/movies");
  });

  it("navigates to /series on s", () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey("s");
    expect(mockNavigate).toHaveBeenCalledWith("/series");
  });

  it("navigates to /search on /", () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey("/");
    expect(mockNavigate).toHaveBeenCalledWith("/search");
  });

  it("dispatches stv:toggle-shortcuts event on ?", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    renderHook(() => useKeyboardShortcuts());
    fireKey("?");
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "stv:toggle-shortcuts" }),
    );
    dispatchSpy.mockRestore();
  });

  it("ignores keys when an input is focused", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    renderHook(() => useKeyboardShortcuts());
    fireKey("g");
    expect(mockNavigate).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("ignores keys when an textarea is focused", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    renderHook(() => useKeyboardShortcuts());
    fireKey("m");
    expect(mockNavigate).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it("ignores keys when Ctrl is held", () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey("g", { ctrlKey: true });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("ignores keys when Meta (Cmd) is held", () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey("s", { metaKey: true });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("ignores keys when Alt is held", () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey("h", { altKey: true });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("cleans up listener on unmount", () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts());
    unmount();
    expect(events.has("keydown")).toBe(false);
  });
});
