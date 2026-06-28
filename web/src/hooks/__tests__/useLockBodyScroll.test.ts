import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLockBodyScroll } from "../useLockBodyScroll";

describe("useLockBodyScroll", () => {
  it("sets body overflow to hidden", () => {
    renderHook(() => useLockBodyScroll(vi.fn()));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body overflow on unmount", () => {
    const { unmount } = renderHook(() => useLockBodyScroll(vi.fn()));
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    renderHook(() => useLockBodyScroll(onClose));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on other keys", () => {
    const onClose = vi.fn();
    renderHook(() => useLockBodyScroll(onClose));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes event listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useLockBodyScroll(onClose));
    unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
