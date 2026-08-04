/**
 * Tests for useFocusTrap — keyboard focus confinement in modal dialogs.
 *
 * Note: jsdom doesn't fully support offsetParent for elements created
 * with document.createElement and appended to body. The focus-trap's
 * internal getFocusableElements filters by offsetParent, so we test
 * the hook's keyboard event handling at the document level instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

describe("useFocusTrap", () => {
  let container: HTMLElement;
  let firstBtn: HTMLButtonElement;
  let lastBtn: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.tabIndex = -1;
    firstBtn = document.createElement("button");
    firstBtn.textContent = "First";
    container.appendChild(firstBtn);
    lastBtn = document.createElement("button");
    lastBtn.textContent = "Last";
    container.appendChild(lastBtn);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does nothing when active is false", () => {
    const containerRef = { current: null };

    const { unmount } = renderHook(() => useFocusTrap(containerRef, false));

    // No errors — should be a no-op
    unmount();
  });

  it("focuses container fallback when no focusable elements exist", () => {
    // Container with no child buttons (firstBtn/lastBtn were removed in setup)
    const emptyContainer = document.createElement("div");
    emptyContainer.tabIndex = -1;
    document.body.appendChild(emptyContainer);

    const containerRef = { current: emptyContainer };
    renderHook(() => useFocusTrap(containerRef, true));

    // Container should receive focus (fallback)
    expect(document.activeElement).toBe(emptyContainer);
  });

  it("registers and removes keydown listener based on active state", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const containerRef = { current: container };

    const { unmount } = renderHook(
      ({ active }) => useFocusTrap(containerRef, active),
      { initialProps: { active: true } },
    );

    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("ignores non-Tab key presses", () => {
    const containerRef = { current: container };

    renderHook(() => useFocusTrap(containerRef, true));

    const escapeEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    });
    const preventDefaultSpy = vi.spyOn(escapeEvent, "preventDefault");

    document.dispatchEvent(escapeEvent);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("restores focus to previous element on cleanup", () => {
    const containerRef = { current: container };

    // Set up a separate element outside the container
    const previousEl = document.createElement("button");
    previousEl.textContent = "Previous";
    document.body.appendChild(previousEl);
    previousEl.focus();
    expect(document.activeElement).toBe(previousEl);

    const { unmount } = renderHook(() => useFocusTrap(containerRef, true));

    // Unmount — focus should return to previous element
    unmount();
    expect(document.activeElement).toBe(previousEl);
  });

  it("focuses the first focusable element when present", () => {
    // jsdom reports offsetParent = null, so stub it to reveal focusables
    Object.defineProperty(firstBtn, "offsetParent", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(lastBtn, "offsetParent", {
      configurable: true,
      value: {},
    });
    const containerRef = { current: container };
    renderHook(() => useFocusTrap(containerRef, true));
    expect(document.activeElement).toBe(firstBtn);
  });

  it("wraps forward focus from last to first element on Tab", () => {
    Object.defineProperty(firstBtn, "offsetParent", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(lastBtn, "offsetParent", {
      configurable: true,
      value: {},
    });
    const containerRef = { current: container };
    renderHook(() => useFocusTrap(containerRef, true));
    // Focus the last element so Tab should wrap back to the first
    lastBtn.focus();
    expect(document.activeElement).toBe(lastBtn);
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
    });
    const preventDefaultSpy = vi.spyOn(tabEvent, "preventDefault");
    document.dispatchEvent(tabEvent);
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(firstBtn);
  });

  it("wraps focus backward from first to last element on Shift+Tab", () => {
    Object.defineProperty(firstBtn, "offsetParent", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(lastBtn, "offsetParent", {
      configurable: true,
      value: {},
    });
    const containerRef = { current: container };
    renderHook(() => useFocusTrap(containerRef, true));
    // Focus the first element so Shift+Tab wraps back to the last
    firstBtn.focus();
    expect(document.activeElement).toBe(firstBtn);
    const shiftTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
    });
    const preventDefaultSpy = vi.spyOn(shiftTabEvent, "preventDefault");
    document.dispatchEvent(shiftTabEvent);
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(lastBtn);
  });

  it("does not wrap Tab when a non-boundary element has focus", () => {
    // Set up a middle element between first and last
    const middleBtn = document.createElement("button");
    middleBtn.textContent = "Middle";
    container.insertBefore(middleBtn, lastBtn);
    Object.defineProperty(firstBtn, "offsetParent", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(middleBtn, "offsetParent", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(lastBtn, "offsetParent", {
      configurable: true,
      value: {},
    });
    const containerRef = { current: container };
    renderHook(() => useFocusTrap(containerRef, true));
    middleBtn.focus();
    expect(document.activeElement).toBe(middleBtn);
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
    });
    const preventDefaultSpy = vi.spyOn(tabEvent, "preventDefault");
    document.dispatchEvent(tabEvent);
    // middle is neither first nor last → natural tab order, no wrap
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("no-ops on Tab when the container holds no focusable elements", () => {
    const emptyContainer = document.createElement("div");
    emptyContainer.tabIndex = -1;
    document.body.appendChild(emptyContainer);
    const containerRef = { current: emptyContainer };
    renderHook(() => useFocusTrap(containerRef, true));
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
    });
    const preventDefaultSpy = vi.spyOn(tabEvent, "preventDefault");
    document.dispatchEvent(tabEvent);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});
