/**
 * Tests for the OfflineBanner component.
 *
 * OfflineBanner shows a persistent banner when the browser reports
 * no network connectivity. It uses navigator.onLine and window
 * online/offline events. Provides showAlways prop for testing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import OfflineBanner from "@/components/OfflineBanner";

// ── Helpers to simulate online/offline ──────────────────────────

function setOnline(onLine: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: onLine,
    configurable: true,
    writable: true,
  });
}

// ── Tests ───────────────────────────────────────────────────────

describe("OfflineBanner", () => {
  beforeEach(() => {
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  describe("default behavior (online)", () => {
    it("renders nothing when online and showAlways is false", () => {
      const { container } = render(<OfflineBanner />);
      expect(container.innerHTML).toBe("");
    });

    it("shows the banner when showAlways is true even when online", () => {
      render(<OfflineBanner showAlways />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Back online — showing cached content where available.")).toBeInTheDocument();
    });
  });

  describe("offline state", () => {
    it("shows the offline banner when navigator.onLine is false", () => {
      setOnline(false);
      render(<OfflineBanner />);
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(screen.getByText("You are offline. Some features may be unavailable.")).toBeInTheDocument();
    });

    it("uses role='alert' and aria-live='polite' for accessibility", () => {
      setOnline(false);
      render(<OfflineBanner />);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("aria-live", "polite");
    });

    it("shows WifiOff icon when offline", () => {
      setOnline(false);
      render(<OfflineBanner />);
      // WifiOff icon renders as an SVG with aria-hidden="true"
      const svgs = document.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("online/offline event transitions", () => {
    it("hides banner when coming back online after being offline", () => {
      setOnline(false);
      const { container, rerender } = render(<OfflineBanner />);
      expect(screen.getByRole("alert")).toBeInTheDocument();

      // Simulate coming back online via window event
      setOnline(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      rerender(<OfflineBanner />);
      expect(container.innerHTML).toBe("");
    });

    it("shows banner when going offline from online", () => {
      render(<OfflineBanner />);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      // Simulate going offline
      setOnline(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("You are offline. Some features may be unavailable.")).toBeInTheDocument();
    });

    it("cleans up event listeners on unmount", () => {
      const addSpy = vi.spyOn(window, "addEventListener");
      const removeSpy = vi.spyOn(window, "removeEventListener");

      const { unmount } = render(<OfflineBanner />);
      // Should have registered online and offline listeners
      expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith("offline", expect.any(Function));

      unmount();
      // Should have cleaned up both listeners
      expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe("showAlways prop", () => {
    it("shows the back-online message when showAlways is true and online", () => {
      render(<OfflineBanner showAlways />);
      expect(screen.getByText("Back online — showing cached content where available.")).toBeInTheDocument();
    });

    it("shows the offline message when showAlways is true and offline", () => {
      setOnline(false);
      render(<OfflineBanner showAlways />);
      expect(screen.getByText("You are offline. Some features may be unavailable.")).toBeInTheDocument();
    });

    it("renders nothing when showAlways is false and online", () => {
      const { container } = render(<OfflineBanner showAlways={false} />);
      expect(container.innerHTML).toBe("");
    });
  });
});
