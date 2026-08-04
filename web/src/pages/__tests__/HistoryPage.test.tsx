/**
 * Tests for the HistoryPage component.
 *
 * HistoryPage displays recently-watched channels from localStorage, with
 * channel cards showing icons, names, and relative timestamps. It shows
 * an empty state when no channels exist and supports "Clear all".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import HistoryPage from "@/pages/HistoryPage";
import type { RecentChannel } from "@/lib/recentChannels";

// ── Mock recentChannels module ──────────────────────────────
const mockGetRecentChannels = vi.fn<() => RecentChannel[]>();
const mockClearRecentChannels = vi.fn();

vi.mock("@/lib/recentChannels", () => ({
  getRecentChannels: (...args: unknown[]) => mockGetRecentChannels(...args),
  clearRecentChannels: (...args: unknown[]) => mockClearRecentChannels(...args),
}));

// ── Mock continueWatching module ────────────────────────────
const mockGetContinueWatching = vi.fn();
const mockGetMovieContinueWatching = vi.fn();
const mockClearAllProgress = vi.fn();

vi.mock("@/lib/continueWatching", () => ({
  getContinueWatching: (...args: unknown[]) => mockGetContinueWatching(...args),
  getMovieContinueWatching: (...args: unknown[]) =>
    mockGetMovieContinueWatching(...args),
  clearAllProgress: (...args: unknown[]) => mockClearAllProgress(...args),
}));

// ── Mock navigate ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Sample data ────────────────────────────────────────────
const sampleChannels: RecentChannel[] = [
  {
    stream_id: 1,
    name: "BBC One",
    icon: "/logos/bbc-one.png",
    watchedAt: Date.now() - 3600_000, // 1 hour ago
  },
  {
    stream_id: 2,
    name: "CNN",
    icon: "/logos/cnn.png",
    watchedAt: Date.now() - 7200_000, // 2 hours ago
  },
  {
    stream_id: 3,
    name: "Sky News",
    icon: "",
    watchedAt: Date.now() - 86400_000, // 1 day ago
  },
];

// ── Helper ──────────────────────────────────────────────────
function renderHistoryPage() {
  return render(
    <MemoryRouter>
      <HistoryPage />
    </MemoryRouter>,
  );
}

const sampleSeriesCW = [
  {
    seriesId: 10,
    episodeId: 101,
    seriesName: "Breaking Bad",
    cover: "http://cdn/bb.jpg",
    seasonNumber: 2,
    episodeNum: 5,
    progressSeconds: 1200,
    durationSeconds: 3600,
    updatedAt: Date.now(),
  },
];

const sampleMovieCW = [
  {
    movieId: 20,
    movieName: "Inception",
    poster: "http://cdn/inception.jpg",
    progressSeconds: 600,
    durationSeconds: 900,
    updatedAt: Date.now(),
  },
];

// ── Tests ──────────────────────────────────────────────────
describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContinueWatching.mockReturnValue([]);
    mockGetMovieContinueWatching.mockReturnValue([]);
  });

  // ── Empty state ─────────────────────────────────────────
  describe("empty state", () => {
    beforeEach(() => {
      mockGetRecentChannels.mockReturnValue([]);
    });

    it('shows "No watch history yet" message', () => {
      renderHistoryPage();
      expect(screen.getByText("No watch history yet")).toBeInTheDocument();
    });

    it("shows a Clock icon in the empty state", () => {
      renderHistoryPage();
      // The Clock icon is rendered inside the empty state section
      const emptySection = screen
        .getByText("No watch history yet")
        .closest("div");
      expect(emptySection?.querySelector("svg")).toBeInTheDocument();
    });

    it("shows subtitle text", () => {
      renderHistoryPage();
      expect(
        screen.getByText("Content you watch will appear here"),
      ).toBeInTheDocument();
    });

    it('shows a "Browse Live TV" button that navigates to /live', () => {
      renderHistoryPage();
      const btn = screen.getByText("Browse Live TV");
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(mockNavigate).toHaveBeenCalledWith("/live");
    });

    it("does NOT show Clear all button when empty", () => {
      renderHistoryPage();
      expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
    });

    it("does NOT show channel cards when empty", () => {
      renderHistoryPage();
      expect(screen.queryByText("BBC One")).not.toBeInTheDocument();
    });
  });

  // ── With channels ───────────────────────────────────────
  describe("with channels", () => {
    beforeEach(() => {
      mockGetRecentChannels.mockReturnValue(sampleChannels);
    });

    it("renders channel cards with names", () => {
      renderHistoryPage();
      expect(screen.getByText("BBC One")).toBeInTheDocument();
      expect(screen.getByText("CNN")).toBeInTheDocument();
      expect(screen.getByText("Sky News")).toBeInTheDocument();
    });

    it("renders channel icons when available", () => {
      renderHistoryPage();
      const images = screen.getAllByRole("img");
      // Two channels have icons
      const bbcImg = images.find(
        (img) => img.getAttribute("alt") === "BBC One logo",
      );
      expect(bbcImg).toBeInTheDocument();
      expect(bbcImg).toHaveAttribute("loading", "lazy");

      const cnnImg = images.find(
        (img) => img.getAttribute("alt") === "CNN logo",
      );
      expect(cnnImg).toBeInTheDocument();
    });

    it("shows fallback TV icon for channels without an icon", () => {
      renderHistoryPage();
      // Sky News has empty icon — should show Tv icon fallback
      const skyNewsCard = screen.getByText("Sky News").closest("button");
      // The fallback is a div with Tv icon
      const fallbackDiv = skyNewsCard?.querySelector(".bg-muted");
      expect(fallbackDiv).toBeInTheDocument();
      expect(fallbackDiv?.querySelector("svg")).toBeInTheDocument();
    });

    it("does not render timestamp when watchedAt is missing", () => {
      // Override: channel with missing watchedAt
      const channelsWithoutTs: RecentChannel[] = [
        { stream_id: 99, name: "NoTs Channel", icon: "", watchedAt: 0 },
      ];
      mockGetRecentChannels.mockReturnValue(channelsWithoutTs);
      renderHistoryPage();
      // Should render the name but no timestamp
      expect(screen.getByText("NoTs Channel")).toBeInTheDocument();
      expect(screen.queryByText("2h ago")).not.toBeInTheDocument();
    });

    it("navigates to /watch/live/:id on channel click", () => {
      renderHistoryPage();
      const bbcCard = screen.getByText("BBC One").closest("button");
      expect(bbcCard).toBeInTheDocument();
      fireEvent.click(bbcCard!);
      expect(mockNavigate).toHaveBeenCalledWith("/watch/live/1");
    });

    it('shows a "Clear all" button when channels exist', () => {
      renderHistoryPage();
      const clearBtn = screen.getByText("Clear all");
      expect(clearBtn).toBeInTheDocument();
      expect(clearBtn).toHaveClass("bg-destructive/10");
    });

    it('"Clear all" button calls clearRecentChannels and clears the list', () => {
      renderHistoryPage();
      const clearBtn = screen.getByText("Clear all");
      fireEvent.click(clearBtn);

      expect(mockClearRecentChannels).toHaveBeenCalledOnce();

      // The component should update to empty state
      expect(screen.queryByText("BBC One")).not.toBeInTheDocument();
      expect(screen.getByText("No watch history yet")).toBeInTheDocument();
    });

    it("renders Trash2 icon on Clear all button", () => {
      renderHistoryPage();
      const clearBtn = screen.getByText("Clear all");
      expect(clearBtn.querySelector("svg")).toBeInTheDocument();
    });

    it("renders channels in a grid layout", () => {
      renderHistoryPage();
      const grid = document.querySelector(".channel-grid");
      expect(grid).toBeInTheDocument();
      expect(grid?.children).toHaveLength(3);
    });
  });

  // ── Edge cases ─────────────────────────────────────────
  describe("edge cases", () => {
    it("handles single channel", () => {
      mockGetRecentChannels.mockReturnValue([sampleChannels[0]]);
      renderHistoryPage();
      expect(screen.getByText("BBC One")).toBeInTheDocument();
      expect(screen.queryByText("CNN")).not.toBeInTheDocument();
    });

    it("handles many channels (max 12)", () => {
      const manyChannels: RecentChannel[] = Array.from(
        { length: 12 },
        (_, i) => ({
          stream_id: i + 100,
          name: `Channel ${i + 1}`,
          icon: "",
          watchedAt: Date.now() - i * 1000,
        }),
      );
      mockGetRecentChannels.mockReturnValue(manyChannels);
      renderHistoryPage();
      // Should render all 12
      expect(screen.getByText("Channel 1")).toBeInTheDocument();
      expect(screen.getByText("Channel 12")).toBeInTheDocument();
      const grid = document.querySelector(".channel-grid");
      expect(grid?.children).toHaveLength(12);
    });

    it("shows data-watch-link attribute on channel buttons", () => {
      mockGetRecentChannels.mockReturnValue([sampleChannels[0]]);
      renderHistoryPage();
      const link = document.querySelector("[data-watch-link]");
      expect(link).toBeInTheDocument();
    });
  });

  // ── Continue Watching — Series ─────────────────────────
  describe("continue watching series", () => {
    it("renders the Series section with title and episode info", () => {
      mockGetContinueWatching.mockReturnValue(sampleSeriesCW);
      renderHistoryPage();
      expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
      expect(screen.getByText("S2 · E5")).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: "Breaking Bad poster" }),
      ).toBeInTheDocument();
    });

    it("shows a placeholder when the series cover is missing", () => {
      mockGetContinueWatching.mockReturnValue([
        { ...sampleSeriesCW[0], cover: "" },
      ]);
      renderHistoryPage();
      expect(
        screen.queryByRole("img", { name: "Breaking Bad poster" }),
      ).toBeNull();
      expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
    });

    it("navigates to the series episode on click", () => {
      mockGetContinueWatching.mockReturnValue(sampleSeriesCW);
      renderHistoryPage();
      fireEvent.click(screen.getByText("Breaking Bad"));
      expect(mockNavigate).toHaveBeenCalledWith("/watch/series/10/101");
    });

    it("renders the progress bar width from progress/duration", () => {
      mockGetContinueWatching.mockReturnValue(sampleSeriesCW);
      renderHistoryPage();
      const bar = document.querySelector(".bg-primary");
      expect(bar).toBeInTheDocument();
      // 1200/3600 = 33.33% (float rounding differs across engines)
      expect(parseFloat((bar as HTMLElement).style.width)).toBeCloseTo(
        33.33,
        1,
      );
    });

    it("hides the progress bar when duration is zero", () => {
      mockGetContinueWatching.mockReturnValue([
        { ...sampleSeriesCW[0], durationSeconds: 0 },
      ]);
      renderHistoryPage();
      expect(document.querySelector(".bg-primary")).toBeNull();
    });
  });

  // ── Continue Watching — Movies ─────────────────────────
  describe("continue watching movies", () => {
    it("renders the Movies section with title and poster", () => {
      mockGetMovieContinueWatching.mockReturnValue(sampleMovieCW);
      renderHistoryPage();
      expect(screen.getByText("Inception")).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: "Inception poster" }),
      ).toBeInTheDocument();
    });

    it("shows a placeholder when the movie poster is missing", () => {
      mockGetMovieContinueWatching.mockReturnValue([
        { ...sampleMovieCW[0], poster: "" },
      ]);
      renderHistoryPage();
      expect(
        screen.queryByRole("img", { name: "Inception poster" }),
      ).toBeNull();
    });

    it("navigates to the movie on click", () => {
      mockGetMovieContinueWatching.mockReturnValue(sampleMovieCW);
      renderHistoryPage();
      fireEvent.click(screen.getByText("Inception"));
      expect(mockNavigate).toHaveBeenCalledWith("/watch/movie/20");
    });

    it("renders the movie progress bar", () => {
      mockGetMovieContinueWatching.mockReturnValue(sampleMovieCW);
      renderHistoryPage();
      const bar = document.querySelector(".bg-primary");
      expect(bar).toBeInTheDocument();
      // 600/900 = 66.67% (float rounding differs across engines)
      expect(parseFloat((bar as HTMLElement).style.width)).toBeCloseTo(
        66.67,
        1,
      );
    });
  });

  // ── Clear all with mixed content ────────────────────────
  describe("clear all with mixed history", () => {
    it("clears channels, series, and movie progress together", () => {
      mockGetRecentChannels.mockReturnValue(sampleChannels);
      mockGetContinueWatching.mockReturnValue(sampleSeriesCW);
      mockGetMovieContinueWatching.mockReturnValue(sampleMovieCW);
      renderHistoryPage();
      fireEvent.click(screen.getByText("Clear all"));
      expect(mockClearRecentChannels).toHaveBeenCalled();
      expect(mockClearAllProgress).toHaveBeenCalled();
      expect(screen.getByText("No watch history yet")).toBeInTheDocument();
    });

    it("shows Clear all when only series progress exists", () => {
      mockGetContinueWatching.mockReturnValue(sampleSeriesCW);
      renderHistoryPage();
      expect(screen.getByText("Clear all")).toBeInTheDocument();
    });
  });
});
