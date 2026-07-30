import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CacheControls from "@/components/admin/CacheControls";
import EpgRefreshSection from "@/components/admin/EpgRefreshSection";

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn();
});

describe("CacheControls", () => {
  it("renders three cache action buttons", () => {
    render(<CacheControls headers={{}} onRefresh={vi.fn()} />);
    expect(screen.getByText("Clear Cache")).toBeTruthy();
    expect(screen.getByText("Warm Cache")).toBeTruthy();
    expect(screen.getByText("Full Rewarm")).toBeTruthy();
  });

  it("calls clear cache API on click", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ message: "Cache cleared" }),
    } as Response);
    const onRefresh = vi.fn();

    render(<CacheControls headers={{}} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByText("Clear Cache"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/cache/clear", {
        method: "POST",
        headers: {},
      });
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it("calls warm cache API on click", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ message: "Warming started" }),
    } as Response);

    render(<CacheControls headers={{}} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByText("Warm Cache"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/cache/warm", {
        method: "POST",
        headers: {},
      });
    });
  });

  it("calls full re-warm API on click", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ message: "Full re-warm started" }),
    } as Response);

    render(<CacheControls headers={{}} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByText("Full Rewarm"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/cache/warm-full", {
        method: "POST",
        headers: {},
      });
    });
  });
});

describe("EpgRefreshSection", () => {
  it("renders EPG refresh info", () => {
    render(<EpgRefreshSection headers={{}} epgAge={120} onRefresh={vi.fn()} />);
    expect(screen.getByText("EPG Guide")).toBeTruthy();
    expect(screen.getByText((t) => t.includes("120s ago"))).toBeTruthy();
  });

  it('shows "Never" when epgAge is null', () => {
    render(<EpgRefreshSection headers={{}} epgAge={null} onRefresh={vi.fn()} />);
    expect(screen.getByText((t) => t.includes("Never"))).toBeTruthy();
  });

  it("calls refresh API when Refresh EPG Now clicked", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ message: "EPG refresh triggered" }),
    } as Response);
    const onRefresh = vi.fn();

    render(<EpgRefreshSection headers={{}} epgAge={300} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByText("Refresh EPG Now"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/epg/refresh", {
        method: "POST",
        headers: {},
      });
    });
    expect(onRefresh).toHaveBeenCalled();
  });
});
