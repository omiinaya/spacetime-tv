/**
 * Tests for the ErrorBoundary component.
 *
 * ErrorBoundary is a React class component that catches rendering errors
 * in its children tree and shows a fallback UI with recovery actions.
 * It also reports errors to the backend beacon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "@/components/ErrorBoundary";

// Mock the error reporter to avoid actual fetch calls
vi.mock("@/components/ErrorReporter", () => ({
  reportRenderError: vi.fn(),
}));

// Import the mocked function for assertions
import { reportRenderError } from "@/components/ErrorReporter";

// ── Helper: component that throws on render ────────────────
function Bomb({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error("💥 KABOOM");
  }
  return <div data-testid="safe-child">All good</div>;
}

function SafeChild() {
  return <div data-testid="safe-child">Hello world</div>;
}

// ── Mock window.location ──────────────────────────────────
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();

  // Mock window.location
  // @ts-expect-error - we're deleting to reassign
  delete window.location;
  window.location = {
    ...originalLocation,
    href: "",
    reload: vi.fn(),
  } as unknown as Location;
});

afterEach(() => {
  window.location = originalLocation;
});

// ── Tests ─────────────────────────────────────────────────
describe("ErrorBoundary", () => {
  describe("normal rendering (no error)", () => {
    it("renders children when there is no error", () => {
      render(
        <ErrorBoundary>
          <SafeChild />
        </ErrorBoundary>,
      );
      expect(screen.getByTestId("safe-child")).toHaveTextContent("Hello world");
    });

    it("does not show fallback UI when there is no error", () => {
      render(
        <ErrorBoundary>
          <SafeChild />
        </ErrorBoundary>,
      );
      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("catches a thrown error and shows fallback UI", () => {
      // Suppress console.error from React's error logging during test
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(
        screen.getByText(/An unexpected error occurred/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Try refreshing/),
      ).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    it("shows the error message in details expandable section", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );

      // The details should already be open after an error
      // Check the <pre> element contains the error text
      const pre = document.querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre!.textContent).toContain("KABOOM");

      consoleSpy.mockRestore();
    });

    it("reports the error to the backend beacon via reportRenderError", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );

      expect(reportRenderError).toHaveBeenCalledTimes(1);
      expect(reportRenderError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "💥 KABOOM" }),
        expect.any(String),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("recovery actions", () => {
    it('has a "Reload" button that reloads the page', () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );

      const reloadBtn = screen.getByText("Reload");
      expect(reloadBtn).toBeInTheDocument();

      fireEvent.click(reloadBtn);
      expect(window.location.reload).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });

    it('has a "Go Home" button that navigates to /', () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );

      const goHomeBtn = screen.getByText("Go Home");
      expect(goHomeBtn).toBeInTheDocument();

      fireEvent.click(goHomeBtn);
      expect(window.location.href).toBe("/");

      consoleSpy.mockRestore();
    });
  });

  describe("custom fallback prop", () => {
    it("renders custom fallback instead of default when provided", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error UI</div>}>
          <Bomb />
        </ErrorBoundary>,
      );

      expect(screen.getByTestId("custom-fallback")).toHaveTextContent("Custom Error UI");
      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });
});
