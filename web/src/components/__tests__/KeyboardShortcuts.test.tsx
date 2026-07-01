/**
 * Tests for the KeyboardShortcuts component.
 *
 * KeyboardShortcuts renders an overlay with keyboard shortcut info.
 * Toggled via custom event 'stv:toggle-shortcuts'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";

/** Helper to toggle the overlay via custom event wrapped in act */
function toggleOverlay() {
  act(() => {
    window.dispatchEvent(new CustomEvent("stv:toggle-shortcuts"));
  });
}

describe("KeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing by default (closed)", () => {
    const { container } = render(<KeyboardShortcuts />);
    expect(container.innerHTML).toBe("");
  });

  it("opens overlay when custom event is dispatched", () => {
    render(<KeyboardShortcuts />);
    toggleOverlay();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("toggles open/close on each custom event", () => {
    render(<KeyboardShortcuts />);

    // First toggle: open
    toggleOverlay();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();

    // Second toggle: close
    toggleOverlay();
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
  });

  it("displays shortcut categories: Global and Player", () => {
    render(<KeyboardShortcuts />);
    toggleOverlay();
    expect(screen.getByText("Global")).toBeInTheDocument();
    expect(screen.getByText("Player")).toBeInTheDocument();
  });

  it("displays shortcut labels and key bindings", () => {
    render(<KeyboardShortcuts />);
    toggleOverlay();
    expect(screen.getByText("Go to Home")).toBeInTheDocument();
    expect(screen.getByText("Play / Pause")).toBeInTheDocument();
    expect(screen.getByText("h")).toBeInTheDocument();
    expect(screen.getByText("Space / k")).toBeInTheDocument();
  });

  it("closes on Escape keydown", () => {
    render(<KeyboardShortcuts />);
    toggleOverlay();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
  });

  it("closes when clicking the backdrop", () => {
    render(<KeyboardShortcuts />);
    toggleOverlay();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();

    // Click the backdrop (the outer fixed div)
    const backdrop = document.querySelector(".fixed.inset-0");
    expect(backdrop).not.toBeNull();
    act(() => {
      fireEvent.click(backdrop!);
    });
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
  });

  it("does not close when clicking inside the modal", () => {
    render(<KeyboardShortcuts />);
    toggleOverlay();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();

    // Click inside the modal container
    const modal = document.querySelector(".rounded-2xl");
    expect(modal).not.toBeNull();
    act(() => {
      fireEvent.click(modal!);
    });
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("renders close button in header", () => {
    render(<KeyboardShortcuts />);
    toggleOverlay();

    const closeBtn = screen.getByLabelText("Close");
    expect(closeBtn).toBeInTheDocument();
    act(() => {
      fireEvent.click(closeBtn);
    });
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
  });

  it("has dialog ARIA attributes for accessibility", () => {
    render(<KeyboardShortcuts />);
    toggleOverlay();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Keyboard Shortcuts");
  });

  it("renders footer with ? toggle hint", () => {
    render(<KeyboardShortcuts />);
    toggleOverlay();
    expect(screen.getByText(/Press/)).toBeInTheDocument();
  });

  it("removes event listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<KeyboardShortcuts />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith(
      "stv:toggle-shortcuts",
      expect.any(Function),
    );
  });

  it("removes keydown listener when overlay closes", () => {
    render(<KeyboardShortcuts />);
    toggleOverlay();

    // Close via toggle
    toggleOverlay();

    // Escape should not trigger anything now
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
  });
});
