/**
 * Tests for the HistoryPage component.
 *
 * HistoryPage displays recently-watched channels from localStorage, with
 * channel cards showing icons, names, and relative timestamps. It shows
 * an empty state when no channels exist and supports "Clear all".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

// ── Mock navigate ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
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

// ── Tests ──────────────────────────────────────────────────
describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const emptySection = screen.getByText("No watch history yet").closest("div");
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
        (img) =>
          img.getAttribute("alt") === "BBC One logo",
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
      const grid = document.querySelector(".grid");
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
      const manyChannels: RecentChannel[] = Array.from({ length: 12 }, (_, i) => ({
        stream_id: i + 100,
        name: `Channel ${i + 1}`,
        icon: "",
        watchedAt: Date.now() - i * 1000,
      }));
      mockGetRecentChannels.mockReturnValue(manyChannels);
      renderHistoryPage();
      // Should render all 12
      expect(screen.getByText("Channel 1")).toBeInTheDocument();
      expect(screen.getByText("Channel 12")).toBeInTheDocument();
      const grid = document.querySelector(".grid");
      expect(grid?.children).toHaveLength(12);
    });

    it("shows data-watch-link attribute on channel buttons", () => {
      mockGetRecentChannels.mockReturnValue([sampleChannels[0]]);
      renderHistoryPage();
      const link = document.querySelector("[data-watch-link]");
      expect(link).toBeInTheDocument();
    });
  });
});
