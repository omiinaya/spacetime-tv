/**
 * Tests for the ErrorReporter component.
 *
 * ErrorReporter is an invisible component that listens for window
 * error/unhandledrejection events and POSTs them to /api/error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import ErrorReporter from "@/components/ErrorReporter";

describe("ErrorReporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing (returns null)", () => {
    const { container } = render(<ErrorReporter />);
    expect(container.innerHTML).toBe("");
  });

  it("registers error and unhandledrejection listeners on mount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    render(<ErrorReporter />);
    expect(addSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
  });

  it("removes listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<ErrorReporter />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
  });

  it("POSTs to /api/error on window error event", () => {
    render(<ErrorReporter />);

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Test error",
        error: new Error("Test error"),
        filename: "test.js",
        lineno: 10,
        colno: 5,
      }),
    );

    expect(fetch).toHaveBeenCalledWith("/api/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.stringContaining("Test error"),
    });
  });

  it("POSTs to /api/error on unhandledrejection event", () => {
    render(<ErrorReporter />);

    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: new Error("Rejected promise"),
      }),
    );

    expect(fetch).toHaveBeenCalledWith("/api/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.stringContaining("Rejected promise"),
    });
  });

  it("POSTs includes url in error payload", () => {
    render(<ErrorReporter />);

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "URL test",
        error: new Error("URL test"),
      }),
    );

    expect(fetch).toHaveBeenCalledWith("/api/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.stringContaining(window.location.href),
    });
  });

  it("handles string rejection reason", () => {
    render(<ErrorReporter />);

    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: "string reason",
      }),
    );

    expect(fetch).toHaveBeenCalledWith("/api/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.stringContaining("string reason"),
    });
  });

  it("handles non-error, non-string rejection reason", () => {
    render(<ErrorReporter />);

    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: { custom: true },
      }),
    );

    expect(fetch).toHaveBeenCalledWith("/api/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.stringContaining("Unhandled promise rejection"),
    });
  });

  it("does not throw when fetch itself fails", () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );
    render(<ErrorReporter />);

    expect(() => {
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "Should not throw",
          error: new Error("Should not throw"),
        }),
      );
    }).not.toThrow();
  });
});
