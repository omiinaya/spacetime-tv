/**
 * Tests for the PWAInstallPrompt component.
 *
 * PWAInstallPrompt shows a banner prompting the user to install the
 * PWA. It responds to the beforeinstallprompt event, handles iOS
 * fallback, and persists dismissal via localStorage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

// ── Mock matchMedia for standalone mode detection ──────────────

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// ── Mock userAgent for iOS detection ──────────────────────────

function mockUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
    writable: true,
  });
}

// ── Mock localStorage ─────────────────────────────────────────

function clearLocalStorage() {
  localStorage.clear();
}

// ── Factory for beforeinstallprompt event ─────────────────────

function createBeforeInstallPromptEvent() {
  const promptFn = vi.fn().mockResolvedValue(undefined);
  const userChoicePromise = Promise.resolve({ outcome: "accepted" as const });
  return {
    prompt: promptFn,
    userChoice: userChoicePromise,
  };
}

// ── Helper to dispatch beforeinstallprompt ────────────────────

function dispatchBeforeInstallPrompt(returnValue?: {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}) {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  if (returnValue) {
    event.prompt = returnValue.prompt;
    event.userChoice = returnValue.userChoice;
  }
  return event;
}

// ── Tests ─────────────────────────────────────────────────────

describe("PWAInstallPrompt", () => {
  beforeEach(() => {
    clearLocalStorage();
    mockMatchMedia(false); // not in standalone mode
    mockUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"); // not iOS
  });

  afterEach(() => {
    clearLocalStorage();
  });

  describe("initial state (no prompt event fired)", () => {
    it("renders nothing when no beforeinstallprompt event has fired", () => {
      const { container } = render(<PWAInstallPrompt />);
      expect(container.innerHTML).toBe("");
    });

    it("renders nothing when in standalone (already installed) mode", () => {
      mockMatchMedia(true); // standalone mode
      // Even if we dispatch the event, it shouldn't show because standalone
      const { container } = render(<PWAInstallPrompt />);

      // Fire event
      const promptObj = createBeforeInstallPromptEvent();
      act(() => {
        window.dispatchEvent(dispatchBeforeInstallPrompt(promptObj));
      });

      // Should still be nothing because standalone check happens first
      expect(container.innerHTML).toBe("");
    });
  });

  describe("beforeinstallprompt event handling", () => {
    it("shows install banner when beforeinstallprompt event fires", () => {
      render(<PWAInstallPrompt />);

      const promptObj = createBeforeInstallPromptEvent();
      act(() => {
        window.dispatchEvent(dispatchBeforeInstallPrompt(promptObj));
      });

      expect(screen.getByText("Install Spacetime-TV")).toBeInTheDocument();
      expect(
        screen.getByText("Add to your home screen for quick access"),
      ).toBeInTheDocument();
    });

    it("shows Install and 'Not now' buttons", () => {
      render(<PWAInstallPrompt />);

      const promptObj = createBeforeInstallPromptEvent();
      act(() => {
        window.dispatchEvent(dispatchBeforeInstallPrompt(promptObj));
      });

      expect(screen.getByText("Install")).toBeInTheDocument();
      expect(screen.getByText("Not now")).toBeInTheDocument();
    });

    it("calls deferredPrompt.prompt() when Install is clicked", async () => {
      render(<PWAInstallPrompt />);

      const promptObj = createBeforeInstallPromptEvent();
      act(() => {
        window.dispatchEvent(dispatchBeforeInstallPrompt(promptObj));
      });

      await waitFor(() => {
        expect(screen.getByText("Install")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Install"));
      expect(promptObj.prompt).toHaveBeenCalledTimes(1);
    });

    it("hides banner after successful install (accepted)", async () => {
      render(<PWAInstallPrompt />);

      const promptObj = createBeforeInstallPromptEvent();
      act(() => {
        window.dispatchEvent(dispatchBeforeInstallPrompt(promptObj));
      });

      expect(screen.getByText("Install Spacetime-TV")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Install"));
      await waitFor(() => {
        // After accepted, the banner should hide
        expect(
          screen.queryByText("Install Spacetime-TV"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("dismissal behavior", () => {
    it("hides banner when 'Not now' is clicked", () => {
      render(<PWAInstallPrompt />);

      const promptObj = createBeforeInstallPromptEvent();
      act(() => {
        window.dispatchEvent(dispatchBeforeInstallPrompt(promptObj));
      });

      expect(screen.getByText("Install Spacetime-TV")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Not now"));

      expect(
        screen.queryByText("Install Spacetime-TV"),
      ).not.toBeInTheDocument();
    });

    it("stores dismissal timestamp in localStorage", async () => {
      render(<PWAInstallPrompt />);

      const promptObj = createBeforeInstallPromptEvent();
      act(() => {
        window.dispatchEvent(dispatchBeforeInstallPrompt(promptObj));
      });

      fireEvent.click(screen.getByText("Not now"));

      await waitFor(() => {
        const ts = localStorage.getItem("stv_pwa_dismissed");
        expect(ts).not.toBeNull();
        expect(Number(ts)).toBeGreaterThan(0);
      });
    });
  });

  describe("iOS fallback", () => {
    it("does NOT show iOS prompt for non-iOS browsers (no setTimeout show)", () => {
      vi.useFakeTimers();
      const { container } = render(<PWAInstallPrompt />);

      // Advance past the iOS delay
      act(() => {
        vi.advanceTimersByTime(6000);
      });

      // Should not show because non-iOS shouldn't trigger the fallback
      expect(container.innerHTML).toBe("");

      vi.useRealTimers();
    });

    it("shows install prompt for iOS Safari after delay", () => {
      vi.useFakeTimers();
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      );

      render(<PWAInstallPrompt />);

      // Before delay — should not show yet
      expect(
        screen.queryByText("Install Spacetime-TV"),
      ).not.toBeInTheDocument();

      // Advance past the 5s delay
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByText("Install Spacetime-TV")).toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe("re-dismissal guard", () => {
    it("does not show again if dismissed within the last week", () => {
      // Set a recent dismissal
      localStorage.setItem("stv_pwa_dismissed", String(Date.now() - 86400_000)); // 1 day ago

      const { container } = render(<PWAInstallPrompt />);

      // Fire beforeinstallprompt
      const promptObj = createBeforeInstallPromptEvent();
      act(() => {
        window.dispatchEvent(dispatchBeforeInstallPrompt(promptObj));
      });

      // Banner should NOT show because recently dismissed
      expect(container.innerHTML).toBe("");
    });

    it("shows again if dismissed more than a week ago", () => {
      // Set an old dismissal
      localStorage.setItem(
        "stv_pwa_dismissed",
        String(Date.now() - 8 * 86400_000),
      ); // 8 days ago

      render(<PWAInstallPrompt />);

      const promptObj = createBeforeInstallPromptEvent();
      act(() => {
        window.dispatchEvent(dispatchBeforeInstallPrompt(promptObj));
      });

      // Banner should show because dismissal has expired
      expect(screen.getByText("Install Spacetime-TV")).toBeInTheDocument();
    });
  });
});
