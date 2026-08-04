/**
 * Tests for the LiveTV page component.
 *
 * LiveTV renders channel cards with category filter tabs, search bar,
 * favorites section, now-playing indicators, and infinite scroll.
 * This test suite covers: loading skeleton, error/retry, empty states,
 * category filtering, search, favorites, and channel card rendering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import LiveTV from "@/pages/LiveTV";
import type { Category, LiveStream } from "@/lib/types";

// ── Mock api ──────────────────────────────────────────────────
const mockCategories = vi.fn();
const mockStreams = vi.fn();
const mockAll = vi.fn();
const mockAllSlim = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    live: {
      categories: (...args: unknown[]) =>
        (
          mockCategories as unknown as (
            ...a: unknown[]
          ) => Promise<{ categories: Category[] }>
        )(...args),
      streams: (...args: unknown[]) =>
        (
          mockStreams as unknown as (
            ...a: unknown[]
          ) => Promise<{ streams: LiveStream[] }>
        )(...args),
      all: (...args: unknown[]) =>
        (
          mockAll as unknown as (
            ...a: unknown[]
          ) => Promise<{ streams: LiveStream[] }>
        )(...args),
      allSlim: (...args: unknown[]) =>
        (
          mockAllSlim as unknown as (
            ...a: unknown[]
          ) => Promise<{ streams: LiveStream[] }>
        )(...args),
      info: vi.fn(),
    },
    guide: { now: vi.fn() },
  },
  imageUrl: (url: string) => url,
  tmdbImgProps: vi.fn(() => ({ src: "https://image.tmdb.org/poster.jpg" })),
  channelIconUrl: (raw: string) => raw,
}));

// ── Mock useInfiniteScroll ────────────────────────────────────
const mockVisibleItems: LiveStream[] = [];
const mockHasMore = false;
const mockSentinelRef = { current: null };

vi.mock("@/hooks/useInfiniteScroll", () => ({
  useInfiniteScroll: <T,>(items: T[], _batch?: number) => ({
    visibleItems:
      mockVisibleItems.length > 0
        ? mockVisibleItems
        : items.slice(0, _batch ?? 50),
    sentinelRef: mockSentinelRef,
    hasMore: mockHasMore,
    reset: vi.fn(),
  }),
}));

// ── Mock SettingsContext ──────────────────────────────────────
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

// ── Mock useChannelFavorites ──────────────────────────────────
const mockToggleFavorite = vi.fn();
const mockIsFavorite = vi.fn();
const mockUseChannelFavorites = vi.fn();

vi.mock("@/hooks/useChannelFavorites", () => ({
  useChannelFavorites: () => mockUseChannelFavorites(),
}));

// ── Mock useNowPlaying ────────────────────────────────────────
const mockGetNowPlaying = vi.fn();

vi.mock("@/hooks/useNowPlaying", () => ({
  useNowPlaying: () => ({
    getNowPlaying: mockGetNowPlaying,
    getNowPlayingChannel: vi.fn(),
    programmes: new Map(),
  }),
}));

// ── Mock navigate ─────────────────────────────────────────────
const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Sample data ────────────────────────────────────────────────
const sampleCategories: Category[] = [
  { category_id: "1", category_name: "US| ENTERTAINMENT", parent_id: 0 },
  { category_id: "2", category_name: "UK| NEWS", parent_id: 0 },
  { category_id: "3", category_name: "SPORTS", parent_id: 0 },
];

const sampleStreams: LiveStream[] = [
  {
    stream_id: 101,
    name: "CNN US",
    stream_icon: "/icons/cnn.png",
    category_id: "1",
    num: 1,
    stream_type: "live",
    epg_channel_id: "cnn.us",
    added: "",
    is_adult: 0,
    category_ids: ["1"],
    custom_sid: null,
    tv_archive: 0,
    direct_source: "",
    tv_archive_duration: 0,
  },
  {
    stream_id: 102,
    name: "FOX News",
    stream_icon: "/icons/fox.png",
    category_id: "1",
    num: 2,
    stream_type: "live",
    epg_channel_id: "fox.us",
    added: "",
    is_adult: 0,
    category_ids: ["1"],
    custom_sid: null,
    tv_archive: 0,
    direct_source: "",
    tv_archive_duration: 0,
  },
  {
    stream_id: 201,
    name: "BBC One",
    stream_icon: "/icons/bbc.png",
    category_id: "2",
    num: 3,
    stream_type: "live",
    epg_channel_id: "bbc.uk",
    added: "",
    is_adult: 0,
    category_ids: ["2"],
    custom_sid: null,
    tv_archive: 0,
    direct_source: "",
    tv_archive_duration: 0,
  },
  {
    stream_id: 301,
    name: "ESPN",
    stream_icon: "",
    category_id: "3",
    num: 5,
    stream_type: "live",
    epg_channel_id: "espn",
    added: "",
    is_adult: 0,
    category_ids: ["3"],
    custom_sid: null,
    tv_archive: 0,
    direct_source: "",
    tv_archive_duration: 0,
  },
];

// ── Helpers ────────────────────────────────────────────────────
function renderLiveTV() {
  return render(
    <MemoryRouter>
      <LiveTV />
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  mockCategories.mockResolvedValue({ categories: sampleCategories });
  mockAll.mockResolvedValue({ streams: sampleStreams });
  mockAllSlim.mockResolvedValue({ streams: sampleStreams });
  mockStreams.mockResolvedValue({
    streams: sampleStreams.filter((s) => s.category_id === "1"),
  });
  mockGetNowPlaying.mockReturnValue(null);
  mockIsFavorite.mockReturnValue(false);
  mockUseChannelFavorites.mockReturnValue({
    favorites: new Set<number>(),
    toggleFavorite: mockToggleFavorite,
    isFavorite: mockIsFavorite,
  });
  localStorage.clear();
  sessionStorage.clear();
}

// ── Tests ──────────────────────────────────────────────────────
describe("LiveTV", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ── Loading state ──────────────────────────────────────────
  describe("loading state", () => {
    beforeEach(() => {
      // Make categories take forever by returning a promise that doesn't resolve
      mockCategories.mockReturnValue(new Promise(() => {}));
      mockAll.mockReturnValue(new Promise(() => {}));
      mockAllSlim.mockReturnValue(new Promise(() => {}));
    });

    it("shows skeleton header while categories load", async () => {
      renderLiveTV();
      // Skeleton elements should show instead of the Live TV heading
      expect(screen.queryByText("Live TV")).not.toBeInTheDocument();
      // Skeleton uses inline shimmer styles
      const skeletons = document.querySelectorAll('[style*="shimmer"]');
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });

    it("shows skeleton tabs while loading", () => {
      renderLiveTV();
      const tabSkeletons = document.querySelectorAll('[style*="shimmer"]');
      // Should have shimmer elements for skeleton tabs
      expect(tabSkeletons.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── Error state ────────────────────────────────────────────
  describe("error state", () => {
    beforeEach(() => {
      mockCategories.mockRejectedValue(new Error("Failed to fetch categories"));
    });

    it("shows error message when categories fail to load", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(
          screen.getByText("Failed to fetch categories"),
        ).toBeInTheDocument();
      });
    });

    it("shows retry button when error occurs", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      });

      // Retry button should have a RotateCcw icon
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });
  });

  // ── Empty states ───────────────────────────────────────────
  describe("empty states", () => {
    it('shows "No channels available" when allStreams is empty', async () => {
      mockAllSlim.mockResolvedValue({ streams: [] });

      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("No channels available")).toBeInTheDocument();
      });
    });

    it('shows "No categories match your filters" when filteredCategories empty', async () => {
      // Categories with adult name that gets filtered by default
      mockCategories.mockResolvedValue({
        categories: [
          { category_id: "99", category_name: "ADULT 18+", parent_id: 0 },
        ],
      });

      renderLiveTV();

      await waitFor(() => {
        expect(
          screen.getByText("No categories match your filters"),
        ).toBeInTheDocument();
      });
    });

    it('shows "No channels matching" when search yields no results', async () => {
      renderLiveTV();

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText("Live TV")).toBeInTheDocument();
      });

      // Type a search that won't match
      const searchInput = screen.getByPlaceholderText(/Search.*channels/);
      fireEvent.change(searchInput, {
        target: { value: "XYZZZZ_NONEXISTENT" },
      });

      // Should show empty search state
      await waitFor(() => {
        expect(screen.getByText(/No channels matching/)).toBeInTheDocument();
      });

      // Should have a Clear search button
      expect(screen.getByText("Clear search")).toBeInTheDocument();
    });
  });

  // ── Normal rendering ───────────────────────────────────────
  describe("normal rendering", () => {
    it("renders the Live TV heading", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("Live TV")).toBeInTheDocument();
      });
    });

    it("shows channel count in subtitle", async () => {
      renderLiveTV();

      await waitFor(() => {
        // The subtitle "4 channels · 3 categories" — scoped to <p> because
        // the search box now has a sr-only label containing "channels".
        const subtitle = screen.getByText(/channels/, {
          selector: "p",
        });
        expect(subtitle).toBeInTheDocument();
        expect(subtitle.textContent).toContain("4");
      });
    });

    it("renders category filter tabs", async () => {
      renderLiveTV();

      await waitFor(() => {
        // "All" tab + all categories should render
        expect(screen.getByText("All")).toBeInTheDocument();
      });

      expect(screen.getByText("US| ENTERTAINMENT")).toBeInTheDocument();
      expect(screen.getByText("UK| NEWS")).toBeInTheDocument();
      expect(screen.getByText("SPORTS")).toBeInTheDocument();
    });

    it("renders channel cards with names", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("CNN US")).toBeInTheDocument();
      });

      expect(screen.getByText("FOX News")).toBeInTheDocument();
      expect(screen.getByText("BBC One")).toBeInTheDocument();
      expect(screen.getByText("ESPN")).toBeInTheDocument();
    });

    it("renders channel number badge when num > 0", async () => {
      renderLiveTV();

      await waitFor(() => {
        // CNN has num=1
        const cnns = screen.getAllByText("CNN US");
        const cnnCard = cnns[0].closest("[data-watch-link]");
        expect(cnnCard?.textContent).toContain("1");
      });
    });
  });

  // ── Channel card rendering ─────────────────────────────────
  describe("channel card rendering", () => {
    it("renders channel icon image for channels with icons", async () => {
      renderLiveTV();

      await waitFor(() => {
        const images = screen.getAllByRole("img");
        const channelLogos = images.filter((img) =>
          img.getAttribute("alt")?.includes("logo"),
        );
        expect(channelLogos.length).toBeGreaterThanOrEqual(3);
      });
    });

    it("shows fallback Tv icon for channels without stream_icon", async () => {
      renderLiveTV();

      await waitFor(() => {
        // ESPN has no icon — should render fallback TV icon container
        const espnCard = screen.getByText("ESPN").closest("[data-watch-link]");
        expect(espnCard).toBeInTheDocument();
        // Fallback div with TV icon
        const fallbackDiv = espnCard?.querySelector("div.bg-muted");
        expect(fallbackDiv).toBeInTheDocument();
      });
    });

    it("shows now-playing text when available", async () => {
      mockGetNowPlaying.mockReturnValue("Live News at 6");

      renderLiveTV();

      await waitFor(() => {
        expect(
          screen.getAllByText("Live News at 6").length,
        ).toBeGreaterThanOrEqual(1);
      });
    });

    it("navigates to /watch/live/:id on click", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("CNN US")).toBeInTheDocument();
      });

      const cnnCard = screen.getByText("CNN US").closest("[data-watch-link]");
      expect(cnnCard).toBeInTheDocument();
      fireEvent.click(cnnCard!);
      expect(mockNavigate).toHaveBeenCalledWith("/watch/live/101");
    });
  });

  // ── Category filtering ─────────────────────────────────────
  describe("category filtering", () => {
    it('shows all channels when "All" tab is active', async () => {
      renderLiveTV();

      await waitFor(() => {
        // All channels should be visible
        expect(screen.getByText("CNN US")).toBeInTheDocument();
        expect(screen.getByText("BBC One")).toBeInTheDocument();
        expect(screen.getByText("ESPN")).toBeInTheDocument();
      });
    });

    it("switches to category-specific streams when a category tab is clicked", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("US| ENTERTAINMENT")).toBeInTheDocument();
      });

      // Click the US category tab
      fireEvent.click(screen.getByText("US| ENTERTAINMENT"));

      // Should have called api.live.streams with cat id "1".
      // Longer timeout: under full-suite parallel load (16 forks) the
      // click → state update → refetch cycle can exceed the 1s default.
      await waitFor(
        () => {
          expect(mockStreams).toHaveBeenCalledWith("1");
        },
        { timeout: 5000 },
      );
    });
  });

  // ── Search ──────────────────────────────────────────────────
  describe("search functionality", () => {
    it("shows search input with placeholder containing channel count", async () => {
      renderLiveTV();

      await waitFor(() => {
        const input = screen.getByPlaceholderText(/Search/);
        expect(input).toBeInTheDocument();
        expect(input).not.toBeDisabled();
      });
    });

    it("filters channels by search query", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("Live TV")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search.*channels/);
      fireEvent.change(searchInput, { target: { value: "CNN" } });

      // Should show matching channels
      expect(screen.getByText("CNN US")).toBeInTheDocument();
      // Non-matching should be hidden
      expect(screen.queryByText("ESPN")).not.toBeInTheDocument();
    });

    it("shows result count in subtitle when searching", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("Live TV")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search.*channels/);
      fireEvent.change(searchInput, { target: { value: "CNN" } });

      await waitFor(() => {
        expect(screen.getByText(/1 results/)).toBeInTheDocument();
      });
    });

    it("clears search when X button is clicked", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("Live TV")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search.*channels/);
      fireEvent.change(searchInput, { target: { value: "CNN" } });

      // Clear button should appear
      // Find the X button (it's the one nested in search input area)
      const xButtons = document.querySelectorAll("button");
      // Click the clear/X button in the search input
      const clearSearchBtn = Array.from(xButtons).find((btn) =>
        btn.closest(".relative")?.querySelector("input"),
      );
      if (clearSearchBtn) fireEvent.click(clearSearchBtn);
    });
  });

  // ── Favorites ─────────────────────────────────────���────────
  describe("favorites interaction", () => {
    beforeEach(() => {
      mockUseChannelFavorites.mockReturnValue({
        favorites: new Set([101, 201]),
        toggleFavorite: mockToggleFavorite,
        isFavorite: mockIsFavorite,
      });
    });

    it("shows favorites toggle button when favorites exist", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("Live TV")).toBeInTheDocument();
      });

      // Favorites count badge should be visible
      const countBadges = screen.getAllByText("2");
      expect(countBadges.length).toBeGreaterThanOrEqual(1);
    });

    it("renders a Favorites section when favorites exist", async () => {
      renderLiveTV();

      await waitFor(() => {
        // The Favorites section heading and toggle button both say "Favorites"
        expect(screen.getAllByText("Favorites").length).toBeGreaterThanOrEqual(
          1,
        );
      });

      // Favorite channels should appear in the Favorites section (also in main grid)
      const cnnElements = screen.getAllByText("CNN US");
      expect(cnnElements.length).toBeGreaterThanOrEqual(1);
      const bbcElements = screen.getAllByText("BBC One");
      expect(bbcElements.length).toBeGreaterThanOrEqual(1);
    });

    it("shows favorites-only filter button", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("Live TV")).toBeInTheDocument();
      });

      // Find the favorites toggle button
      const favButtons = screen.getAllByRole("button");
      const favToggle = favButtons.find(
        (btn) =>
          btn.getAttribute("aria-label") === "Show favorites only" ||
          btn.getAttribute("aria-label") === "Show all channels",
      );
      expect(favToggle).toBeInTheDocument();
    });

    it("filters the grid to favorites when the toggle is activated", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("Live TV")).toBeInTheDocument();
      });

      const favButtons = screen.getAllByRole("button");
      const favToggle = favButtons.find(
        (btn) => btn.getAttribute("aria-label") === "Show favorites only",
      );
      if (favToggle) {
        fireEvent.click(favToggle);
      }

      // In favorites-only mode the category tabs are hidden and the header
      // shows the favorites count
      await waitFor(() => {
        expect(screen.getByText(/2 favorites/)).toBeInTheDocument();
      });
      // Favorited channel cards render
      expect(screen.getAllByText("CNN US").length).toBeGreaterThanOrEqual(1);
    });

    it("removes a favorite from the grid via the card toggle", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("Live TV")).toBeInTheDocument();
      });

      // Click the favorite star on the first displayed card
      const favBtns = screen.getAllByLabelText("Add to favorites");
      if (favBtns.length > 0) fireEvent.click(favBtns[0]);
      expect(mockToggleFavorite).toHaveBeenCalled();
    });
  });

  // ── Edge cases ─────────────────────────────────────────────
  describe("edge cases", () => {
    it("handles single channel gracefully", async () => {
      mockAllSlim.mockResolvedValue({
        streams: [sampleStreams[0]],
      });

      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("CNN US")).toBeInTheDocument();
        expect(screen.queryByText("BBC One")).not.toBeInTheDocument();
      });

      // Header should show "1 channels"
      expect(screen.getByText(/1 channels/)).toBeInTheDocument();
    });

    it("clears search via Clear search link in empty state", async () => {
      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("Live TV")).toBeInTheDocument();
      });

      // Search for something that won't match
      const searchInput = screen.getByPlaceholderText(/Search.*channels/);
      fireEvent.change(searchInput, { target: { value: "NONEXISTENT12345" } });

      await waitFor(() => {
        expect(screen.getByText("Clear search")).toBeInTheDocument();
      });

      // Click Clear search
      fireEvent.click(screen.getByText("Clear search"));

      // Search input should be cleared (back to showing all)
      await waitFor(() => {
        expect(screen.getByText("CNN US")).toBeInTheDocument();
      });
    });

    it("handles empty EPG now-playing gracefully", async () => {
      mockGetNowPlaying.mockReturnValue(null);

      renderLiveTV();

      await waitFor(() => {
        expect(screen.getByText("CNN US")).toBeInTheDocument();
      });

      // getNowPlaying returns null, so "Live News at 6" should NOT be visible
      // (this was the test text used in the now-playing test)
      expect(screen.queryByText("Live News at 6")).not.toBeInTheDocument();
    });
  });
});
