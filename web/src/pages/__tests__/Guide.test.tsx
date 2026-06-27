/**
 * Tests for the Guide (EPG) page component.
 *
 * Guide is the primary Live TV EPG page. It displays a channel grid with
 * a timeline header, searchable programme listings, and per-channel favorites.
 * It supports keyboard navigation, infinite scroll, and TMDB enrichment.
 *
 * We test all render states: loading skeleton, error/retry, empty states
 * (no EPG data, no channels match, no search results), and the normal
 * rendering state with channel rows + favorites interaction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Guide from "@/pages/Guide";
import type { ChannelGroup, Programme } from "@/lib/api";

// ── Mock useGuideData ──────────────────────────────────────────
const mockLoadPage = vi.fn();
const mockUseGuideData = vi.fn();

vi.mock("@/hooks/useGuideData", () => ({
  default: () => mockUseGuideData(),
  useGuideData: () => mockUseGuideData(),
  formatTime: (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
  parseXmltvTime: vi.fn(),
}));

// ── Mock useChannelFavorites ────────────────────────────────────
const mockToggleFavorite = vi.fn();
const mockIsFavorite = vi.fn();
const mockUseChannelFavorites = vi.fn();

vi.mock("@/hooks/useChannelFavorites", () => ({
  useChannelFavorites: () => mockUseChannelFavorites(),
}));

// ── Mock SettingsContext ─────────────────────────────────────────
const mockUpdateSettings = vi.fn();
const mockResetSettings = vi.fn();
const mockSettings = {
  languages: [],
  hiddenCategories: [],
  showAdult: false,
  services: [],
};

vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({
    settings: mockSettings,
    update: mockUpdateSettings,
    reset: mockResetSettings,
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Mock react-router ───────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Sample data ─────────────────────────────────────────────────
const sampleProgrammes: Programme[] = [
  {
    start: "20260627060000 +0200",
    stop: "20260627080000 +0200",
    title: "Morning News",
    subtitle: "National headlines",
    desc: "Comprehensive morning news coverage.",
    category: "News",
    is_live: true,
  },
  {
    start: "20260627080000 +0200",
    stop: "20260627100000 +0200",
    title: "Weather Today",
    subtitle: "Regional forecast",
    desc: "Local weather updates.",
    category: "Weather",
    is_live: false,
  },
];

const sampleChannels: ChannelGroup[] = [
  {
    channel_id: "bbc1.uk",
    channel_name: "BBC One",
    channel_icon: "/logos/bbc-one.png",
    stream_id: 1001,
    programmes: sampleProgrammes,
  },
  {
    channel_id: "cnn.us",
    channel_name: "CNN",
    channel_icon: "/logos/cnn.png",
    stream_id: 1002,
    programmes: [
      { ...sampleProgrammes[0], title: "CNN This Morning" },
      { ...sampleProgrammes[1], title: "Newsroom" },
    ],
  },
  {
    channel_id: "sky.uk",
    channel_name: "Sky News",
    channel_icon: "",
    stream_id: 1003,
    programmes: [],
  },
];

const baseTimeSlots = [
  new Date("2026-06-27T06:00:00"),
  new Date("2026-06-27T06:30:00"),
  new Date("2026-06-27T07:00:00"),
  new Date("2026-06-27T07:30:00"),
  new Date("2026-06-27T08:00:00"),
  new Date("2026-06-27T08:30:00"),
  new Date("2026-06-27T09:00:00"),
  new Date("2026-06-27T09:30:00"),
  new Date("2026-06-27T10:00:00"),
];

function defaultGuideData(overrides: Record<string, unknown> = {}) {
  return {
    filteredChannels: sampleChannels,
    allData: sampleChannels,
    totalChannels: sampleChannels.length,
    loading: false,
    loadingMore: false,
    error: null,
    sentinelRef: { current: null },
    timeSlots: baseTimeSlots,
    now: new Date("2026-06-27T07:30:00"),
    nowPct: 37.5,
    loadPage: mockLoadPage,
    ...overrides,
  };
}

function defaultFavorites(overrides: Record<string, unknown> = {}) {
  return {
    favorites: new Set<number>(),
    toggleFavorite: mockToggleFavorite,
    isFavorite: mockIsFavorite,
    ...overrides,
  };
}

// ── Helper ──────────────────────────────────────────────────────
function renderGuide() {
  return render(
    <MemoryRouter>
      <Guide />
    </MemoryRouter>,
  );
}

// ── Tests ───────────────────────────────────────────────────────
describe("Guide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGuideData.mockReturnValue(defaultGuideData());
    mockUseChannelFavorites.mockReturnValue(defaultFavorites());
    mockIsFavorite.mockReturnValue(false);
  });

  // ── Loading state ──────────────────────────────────────────
  describe("loading state", () => {
    beforeEach(() => {
      mockUseGuideData.mockReturnValue(defaultGuideData({ loading: true }));
    });

    it("renders skeleton placeholders while loading data", () => {
      renderGuide();
      // Skeletons use inline style with shimmer animation
      const skeletons = document.querySelectorAll('[style*="shimmer"]');
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });

    it("does NOT render the TV Guide heading when loading", () => {
      renderGuide();
      expect(screen.queryByText("TV Guide")).not.toBeInTheDocument();
    });

    it("does NOT render channel names when loading", () => {
      renderGuide();
      expect(screen.queryByText("BBC One")).not.toBeInTheDocument();
    });

    it("does NOT render search input when loading", () => {
      renderGuide();
      expect(screen.queryByPlaceholderText("Search programmes...")).not.toBeInTheDocument();
    });
  });

  // ── Error state ────────────────────────────────────────────
  describe("error state", () => {
    beforeEach(() => {
      mockUseGuideData.mockReturnValue(
        defaultGuideData({ error: "Failed to fetch EPG data", loading: false }),
      );
    });

    it("shows error message text", () => {
      renderGuide();
      expect(screen.getByText("Failed to fetch EPG data")).toBeInTheDocument();
    });

    it("shows retry button with RotateCcw icon", () => {
      renderGuide();
      const retryBtn = screen.getByText("Retry");
      expect(retryBtn).toBeInTheDocument();
      expect(retryBtn.closest("button")).toBeInTheDocument();
    });

    it("calls loadPage(0) when retry button is clicked", () => {
      renderGuide();
      const retryBtn = screen.getByText("Retry");
      fireEvent.click(retryBtn);
      expect(mockLoadPage).toHaveBeenCalledWith(0);
    });

    it("shows TV Guide heading even with error", () => {
      renderGuide();
      expect(screen.getByText("TV Guide")).toBeInTheDocument();
    });

    it("shows channel count even with error (from previous data)", () => {
      renderGuide();
      // totalChannels=3, filteredChannels still has data
      // Text is split across elements by React rendering
      expect(screen.getByText((content) => content.includes("3 channels"))).toBeInTheDocument();
    });
  });

  // ── Empty state: no EPG data ───────────────────────────────
  describe("empty state — no EPG data", () => {
    beforeEach(() => {
      mockUseGuideData.mockReturnValue(
        defaultGuideData({
          filteredChannels: [],
          allData: [],
          totalChannels: 0,
          loading: false,
        }),
      );
    });

    it('shows "No EPG data available" message', () => {
      renderGuide();
      expect(screen.getByText("No EPG data available")).toBeInTheDocument();
    });

    it("shows hint about XMLTV feed source", () => {
      renderGuide();
      expect(
        screen.getByText("Guide data is loaded from the IPTV provider's XMLTV feed"),
      ).toBeInTheDocument();
    });

    it("does NOT show channel list when empty", () => {
      renderGuide();
      expect(screen.queryByText("BBC One")).not.toBeInTheDocument();
    });
  });

  // ── Empty state: no channels match settings ────────────────
  describe("empty state — filtered out by settings", () => {
    beforeEach(() => {
      mockUseGuideData.mockReturnValue(
        defaultGuideData({
          filteredChannels: [],
          allData: sampleChannels,
          totalChannels: 3,
          loading: false,
        }),
      );
    });

    it('shows "No channels match your settings" message', () => {
      renderGuide();
      expect(screen.getByText("No channels match your settings")).toBeInTheDocument();
    });

    it("shows channel count available in allData", () => {
      renderGuide();
      // Text "3 channels available" is split across elements
      expect(
        screen.getByText((content) => content.includes("channels available")),
      ).toBeInTheDocument();
    });

    it("does NOT show channel names", () => {
      renderGuide();
      expect(screen.queryByText("BBC One")).not.toBeInTheDocument();
    });
  });

  // ── Empty state: search yields no results ──────────────────
  describe("empty state — search with no results", () => {
    beforeEach(() => {
      mockUseGuideData.mockReturnValue(defaultGuideData());
    });

    it('shows "No programmes matching" when search has no matches', () => {
      renderGuide();
      const input = screen.getByPlaceholderText("Search programmes...");
      fireEvent.change(input, { target: { value: "zzzznotfound" } });
      expect(
        screen.getByText(/No programmes matching/),
      ).toBeInTheDocument();
      expect(screen.getByText(/zzzznotfound/)).toBeInTheDocument();
    });

    it('shows "Clear search" button when search has no matches', () => {
      renderGuide();
      const input = screen.getByPlaceholderText("Search programmes...");
      fireEvent.change(input, { target: { value: "zzzznotfound" } });
      expect(screen.getByText("Clear search")).toBeInTheDocument();
    });

    it('clears search when "Clear search" is clicked', () => {
      renderGuide();
      const input = screen.getByPlaceholderText("Search programmes...");
      fireEvent.change(input, { target: { value: "zzzznotfound" } });

      // Should show empty state
      expect(screen.getByText(/No programmes matching/)).toBeInTheDocument();

      // Click "Clear search"
      fireEvent.click(screen.getByText("Clear search"));

      // After clearing, channel names should reappear
      expect(screen.getByText("BBC One")).toBeInTheDocument();
      expect(screen.queryByText(/No programmes matching/)).not.toBeInTheDocument();
    });

    it("shows clear (X) button in search input when query is non-empty", () => {
      renderGuide();
      const input = screen.getByPlaceholderText("Search programmes...");
      // Initially no X button
      expect(screen.queryByRole("button", { name: "" })).toBeNull();

      fireEvent.change(input, { target: { value: "test" } });

      // Now there should be an X button
      const clearBtn = input.parentElement?.querySelector("button");
      expect(clearBtn).toBeInTheDocument();
    });

    it("clears search when X button is clicked", () => {
      renderGuide();
      const input = screen.getByPlaceholderText("Search programmes...");
      fireEvent.change(input, { target: { value: "test" } });

      // Click the X button
      const clearBtn = input.parentElement?.querySelector("button")!;
      fireEvent.click(clearBtn);

      // Search should be cleared, channels visible
      expect((input as HTMLInputElement).value).toBe("");
      expect(screen.getByText("BBC One")).toBeInTheDocument();
    });
  });

  // ── Normal rendering ───────────────────────────────────────
  describe("normal rendering", () => {
    it("shows TV Guide heading", () => {
      renderGuide();
      expect(screen.getByText("TV Guide")).toBeInTheDocument();
    });

    it("shows channel count in header", () => {
      renderGuide();
      // Text is split across elements
      expect(
        screen.getByText((content) => content.includes("channels") && content.includes("·")),
      ).toBeInTheDocument();
    });

    it("shows showing count with formatted number", () => {
      renderGuide();
      expect(
        screen.getByText((content) => content.includes("showing")),
      ).toBeInTheDocument();
    });

    it("renders all channel names", () => {
      renderGuide();
      expect(screen.getByText("BBC One")).toBeInTheDocument();
      expect(screen.getByText("CNN")).toBeInTheDocument();
      expect(screen.getByText("Sky News")).toBeInTheDocument();
    });

    it("renders programme titles for each channel", () => {
      renderGuide();
      expect(screen.getByText("Morning News")).toBeInTheDocument();
      expect(screen.getByText("Weather Today")).toBeInTheDocument();
      expect(screen.getByText("CNN This Morning")).toBeInTheDocument();
      expect(screen.getByText("Newsroom")).toBeInTheDocument();
    });

    it("renders search input", () => {
      renderGuide();
      expect(
        screen.getByPlaceholderText("Search programmes..."),
      ).toBeInTheDocument();
    });

    it("shows timeline with formatted time slots", () => {
      renderGuide();
      // At least one time slot should be visible
      // formatTime for 6:00 AM, 6:30 AM, etc.
      expect(screen.getByText("6:00 AM")).toBeInTheDocument();
      expect(screen.getByText("6:30 AM")).toBeInTheDocument();
    });

    it("shows LIVE indicator in timeline", () => {
      renderGuide();
      // Multiple LIVE indicators exist (timeline + live programme cards)
      const liveIndicators = screen.getAllByText("LIVE");
      expect(liveIndicators.length).toBeGreaterThanOrEqual(1);
    });

    it("renders channel icons when available", () => {
      renderGuide();
      const images = screen.getAllByRole("img");
      // BBC One and CNN have icons
      const channelIcons = images.filter(
        (img) =>
          img.getAttribute("alt") === "BBC One icon" ||
          img.getAttribute("alt") === "CNN icon",
      );
      expect(channelIcons.length).toBeGreaterThanOrEqual(1);
    });

    it("renders aria-label on channel buttons", () => {
      renderGuide();
      expect(screen.getByLabelText("Watch BBC One")).toBeInTheDocument();
      expect(screen.getByLabelText("Watch CNN")).toBeInTheDocument();
    });

    it("shows language badge when languages filter is active", () => {
      mockSettings.languages = ["EN"];
      renderGuide();
      expect(screen.getByText("EN")).toBeInTheDocument();
      // Reset
      mockSettings.languages = [];
    });

    it("shows search match count badge when search matches", () => {
      renderGuide();
      const input = screen.getByPlaceholderText("Search programmes...");
      fireEvent.change(input, { target: { value: "Morning" } });
      // Text is split across elements by React rendering
      expect(
        screen.getByText((content) => content.includes("programme") && content.includes("2")),
      ).toBeInTheDocument();
    });
  });

  // ── Favorites interaction ──────────────────────────────────
  describe("favorites interaction", () => {
    it("passes isFavorite to ChannelRow for favorited channels", () => {
      mockUseChannelFavorites.mockReturnValue(
        defaultFavorites({
          favorites: new Set([1001]),
        }),
      );
      mockIsFavorite.mockImplementation((id: number) => id === 1001);

      renderGuide();
      // BBC One (stream_id=1001) should be favorited
      const bbcRow = screen.getByLabelText("Watch BBC One");
      expect(bbcRow).toBeInTheDocument();
    });

    it("calls toggleFavorite when favorite star is clicked", () => {
      renderGuide();
      // Find and click a favorite button
      const bbcRow = screen.getByLabelText("Watch BBC One");
      const favBtn = bbcRow
        .closest("div")
        ?.querySelector('[aria-label="Add to favorites"]');
      expect(favBtn).toBeInTheDocument();

      fireEvent.click(favBtn!);
      expect(mockToggleFavorite).toHaveBeenCalledWith(1001);
    });
  });

  // ── Loading more ───────────────────────────────────────────
  describe("loading more", () => {
    it("shows spinner when loadingMore is true", () => {
      mockUseGuideData.mockReturnValue(
        defaultGuideData({ loadingMore: true }),
      );
      renderGuide();
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("does not show spinner when not loading more", () => {
      renderGuide();
      expect(document.querySelector(".animate-spin")).toBeNull();
    });
  });
});
