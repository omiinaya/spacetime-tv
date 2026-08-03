/**
 * Tests for OfflineBanner — online/offline connectivity banner.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import OfflineBanner from "@/components/OfflineBanner";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("OfflineBanner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when online and showAlways is false", () => {
    setOnline(true);
    const { container } = render(<OfflineBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("shows offline message when navigator.onLine is false", () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("alert").textContent).toContain("You are offline");
  });

  it("shows the banner when showAlways is true even while online", () => {
    setOnline(true);
    render(<OfflineBanner showAlways />);
    expect(screen.getByRole("alert").textContent).toContain("Back online");
  });

  it("responds to the offline event after mounting online", () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("alert").textContent).toContain("You are offline");
  });

  it("hides when the online event fires", () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("alert")).toBeTruthy();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
