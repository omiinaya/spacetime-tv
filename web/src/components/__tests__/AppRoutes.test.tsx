/**
 * Tests for AppRoutes — the route table that maps every app path to its
 * page component (wrapped in ErrorBoundary + Suspense).
 *
 * Lazy page modules are vi.mock'd to sentinel <div data-page=".."> components
 * so the dynamic imports resolve synchronously; assertions check the wrapper
 * padding class, the PageLoader Suspense fallback, route→component resolution,
 * and the catch-all NotFound route.
 */
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppRoutes, PageLoader } from "@/components/AppRoutes";

// Mock every lazy-loaded page module to a sentinel div carrying a data-page
// attribute so route resolution is observable in the DOM.
vi.mock("@/pages/HomePage", () => ({
  default: () => <div data-page="home" />,
}));
vi.mock("@/pages/LiveTV", () => ({ default: () => <div data-page="live" /> }));
vi.mock("@/pages/Guide", () => ({ default: () => <div data-page="guide" /> }));
vi.mock("@/pages/Movies", () => ({
  default: () => <div data-page="movies" />,
}));
vi.mock("@/pages/Series", () => ({
  default: () => <div data-page="series" />,
}));
vi.mock("@/pages/Search", () => ({
  default: () => <div data-page="search" />,
}));
vi.mock("@/pages/SettingsPage", () => ({
  default: () => <div data-page="settings" />,
}));
vi.mock("@/pages/WatchlistPage", () => ({
  default: () => <div data-page="watchlist" />,
}));
vi.mock("@/pages/HistoryPage", () => ({
  default: () => <div data-page="history" />,
}));
vi.mock("@/pages/PersonPage", () => ({
  default: () => <div data-page="person" />,
}));
vi.mock("@/pages/RecordingsPage", () => ({
  default: () => <div data-page="recordings" />,
}));
vi.mock("@/components/Player", () => ({
  default: () => <div data-page="play" />,
}));
vi.mock("@/components/WatchRecording", () => ({
  default: () => <div data-page="watchrec" />,
}));
vi.mock("@/pages/AdminDashboard", () => ({
  default: () => <div data-page="admin" />,
}));
vi.mock("@/pages/AgentAccess", () => ({
  default: () => <div data-page="agents" />,
}));
vi.mock("@/pages/NotFound", () => ({
  default: () => <div data-page="notfound" />,
}));

function renderAt(route: string, isWatchRoute = false) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppRoutes isWatchRoute={isWatchRoute} />
    </MemoryRouter>,
  );
}

function pageRendered(page: string) {
  return document.querySelector(`[data-page="${page}"]`) !== null;
}

describe("PageLoader", () => {
  it("renders the spinning loader fallback", () => {
    const { container } = render(<PageLoader />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });
});

describe("AppRoutes", () => {
  it("applies padding wrapper for non-watch routes", () => {
    const { container } = renderAt("/");
    expect((container.firstChild as HTMLElement).className).toContain("p-6");
  });

  it("removes padding wrapper on watch routes", () => {
    const { container } = renderAt("/watch/movie/12", true);
    expect((container.firstChild as HTMLElement).className).toBe("");
  });

  it.each([
    ["/", "home"],
    ["/live", "live"],
    ["/guide", "guide"],
    ["/movies", "movies"],
    ["/series", "series"],
    ["/search", "search"],
    ["/watchlist", "watchlist"],
    ["/history", "history"],
    ["/recordings", "recordings"],
    ["/settings", "settings"],
    ["/admin", "admin"],
    ["/admin/agents", "agents"],
    ["/watch/live/42", "play"],
    ["/watch/movie/7", "play"],
    ["/watch/recording/9", "watchrec"],
    ["/watch/series/3/11", "play"],
  ])("renders the %s page component for path %s", async (route, page) => {
    renderAt(route, route.startsWith("/watch/"));
    // Lazy pages resolve async — wait for the sentinel to appear.
    await waitFor(() => {
      expect(pageRendered(page)).toBe(true);
    });
  });

  it("renders the Person page for /person/:encodedName", async () => {
    renderAt("/person/keanu%20reeves");
    await waitFor(() => {
      expect(pageRendered("person")).toBe(true);
    });
  });

  it("falls back to NotFound for unknown paths", async () => {
    renderAt("/this/does/not/exist");
    await waitFor(() => {
      expect(pageRendered("notfound")).toBe(true);
    });
  });
});
