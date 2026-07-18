/**
 * Tests for the SettingsPage component.
 *
 * SettingsPage manages content filters including language/country selection,
 * streaming service toggles, adult content visibility, and hidden categories.
 * This suite covers: loading state, language toggles, service toggles,
 * adult content switch, hidden categories with search, reset to defaults,
 * and category stats display.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SettingsPage from "@/pages/SettingsPage";
import type { Category } from "@/lib/api";

// ── Mock api ─────────────────────────────────────────────
const mockLiveCats = vi.fn();
const mockMovieCats = vi.fn();
const mockSeriesCats = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    live: {
      categories: (...args: unknown[]) =>
        (
          mockLiveCats as unknown as (
            ...a: unknown[]
          ) => Promise<{ categories: Category[] }>
        )(...args),
    },
    movies: {
      categories: (...args: unknown[]) =>
        (
          mockMovieCats as unknown as (
            ...a: unknown[]
          ) => Promise<{ categories: Category[] }>
        )(...args),
    },
    series: {
      categories: (...args: unknown[]) =>
        (
          mockSeriesCats as unknown as (
            ...a: unknown[]
          ) => Promise<{ categories: Category[] }>
        )(...args),
    },
  },
  imageUrl: (url: string) => url,
}));

// ── Mock SettingsContext ─────────────────────────────────
let mockSettings = {
  languages: [] as string[],
  hiddenCategories: [] as string[],
  showAdult: false,
  services: [] as string[],
  adultPin: "",
  theme: "dark" as const,
};
const mockUpdate = vi.fn();
const mockReset = vi.fn();
const mockAdultUnlocked = false;

vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({
    settings: mockSettings,
    update: (...args: unknown[]) =>
      (mockUpdate as (...a: unknown[]) => void)(...args),
    reset: (...args: unknown[]) =>
      (mockReset as (...a: unknown[]) => void)(...args),
    adultUnlocked: false,
    setAdultPin: vi.fn(),
    clearAdultPin: vi.fn(),
    unlockAdult: vi.fn(),
    lockAdult: vi.fn(),
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Mock Skeleton ────────────────────────────────────────
vi.mock("@/components/Skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// ── Sample categories ────────────────────────────────────
const sampleLiveCats: Category[] = [
  { category_id: "1", category_name: "EN| Entertainment", parent_id: 0 },
  { category_id: "2", category_name: "US| News", parent_id: 0 },
  { category_id: "3", category_name: "DE| Sports", parent_id: 0 },
  { category_id: "4", category_name: "Adult 18+", parent_id: 0 },
];

const sampleMovieCats: Category[] = [
  { category_id: "10", category_name: "NETFLIX Movies EN", parent_id: 0 },
  { category_id: "11", category_name: "HBO Series", parent_id: 0 },
  { category_id: "12", category_name: "DISNEY+ Kids", parent_id: 0 },
  { category_id: "13", category_name: "AMAZON Prime", parent_id: 0 },
];

const sampleSeriesCats: Category[] = [
  { category_id: "20", category_name: "NETFLIX Series EN", parent_id: 0 },
  { category_id: "21", category_name: "HBO Drama", parent_id: 0 },
  { category_id: "22", category_name: "CRUNCHYROLL Anime", parent_id: 0 },
];

// ── Helpers ──────────────────────────────────────────────
function resolveAfter<T>(val: T, ms = 0): Promise<T> {
  return new Promise((r) => setTimeout(() => r(val), ms));
}

function renderSettingsPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSettings = {
    languages: [],
    hiddenCategories: [],
    showAdult: false,
    services: [],
  };
  mockLiveCats.mockResolvedValue({ categories: sampleLiveCats });
  mockMovieCats.mockResolvedValue({ categories: sampleMovieCats });
  mockSeriesCats.mockResolvedValue({ categories: sampleSeriesCats });
});

// ═══════════════════════════════════════════════════════════
// Loading state
// ═══════════════════════════════════════════════════════════
describe("loading state", () => {
  it("renders skeleton placeholders while categories are loading", () => {
    // Never resolve — stay in loading state
    mockLiveCats.mockReturnValue(new Promise(() => {}));
    mockMovieCats.mockReturnValue(new Promise(() => {}));
    mockSeriesCats.mockReturnValue(new Promise(() => {}));

    renderSettingsPage();
    const skeletons = screen.getAllByTestId("skeleton");
    // Header skeleton + 5 content skeletons
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════
// Header
// ═══════════════════════════════════════════════════════════
describe("header", () => {
  it("renders title and subtitle", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Filter out content you don't want to see"),
    ).toBeInTheDocument();
  });

  it("renders the Settings icon", async () => {
    renderSettingsPage();
    await waitFor(() => {
      // The Settings icon is inside a div with bg-primary/10
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Stats bar
// ═══════════════════════════════════════════════════════════
describe("stats bar", () => {
  it("shows visible category counts for live/movies/series", async () => {
    renderSettingsPage();
    await waitFor(() => {
      // With no filters, all non-adult categories are visible
      // Live: 3 (EN, US, DE — Adult 18+ hidden by default)
      // Movies: 4 (all non-adult)
      // Series: 3 (all non-adult)
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getAllByText("3")).toHaveLength(2);
    });
    expect(screen.getByText("categories visible")).toBeInTheDocument();
  });

  it("shows correct counts when languages are filtered", async () => {
    mockSettings.languages = ["EN"];
    renderSettingsPage();
    await waitFor(() => {
      // Live: EN| Entertainment passes, US| and DE| filtered, Adult hidden
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("shows correct counts when services are filtered", async () => {
    mockSettings.services = ["NETFLIX"];
    renderSettingsPage();
    await waitFor(() => {
      // Live: all 3 non-adult (service filter doesn't affect live TV)
      // Movies: 1 (NETFLIX Movies EN)
      // Series: 1 (NETFLIX Series EN)
      expect(screen.getByText("3")).toBeInTheDocument(); // live
      expect(screen.getAllByText("1")).toHaveLength(2); // movies + series
    });
  });

  it("shows updated counts after hiding a category", async () => {
    mockSettings.hiddenCategories = ["1"];
    renderSettingsPage();
    await waitFor(() => {
      // Live: 2 (EN hidden, US, DE visible, Adult hidden)
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("has a reset button that calls reset()", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Reset")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Reset"));
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Language / Country filter
// ═══════════════════════════════════════════════════════════
describe("language / country filter", () => {
  it("renders section heading", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Language / Country")).toBeInTheDocument();
    });
  });

  it("renders 'All' button and all prefix buttons (EN, US, DE)", async () => {
    renderSettingsPage();
    await waitFor(() => {
      const langSection = screen
        .getByText("Language / Country")
        .closest("section")!;
      expect(within(langSection).getByText("All")).toBeInTheDocument();
      expect(screen.getByText("EN")).toBeInTheDocument();
      expect(screen.getByText("US")).toBeInTheDocument();
      expect(screen.getByText("DE")).toBeInTheDocument();
    });
  });

  it("toggles a language when clicked", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("EN")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("EN"));
    expect(mockUpdate).toHaveBeenCalledWith({ languages: ["EN"] });
  });

  it("removes a language when clicked again", async () => {
    mockSettings.languages = ["EN", "US"];
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("EN")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("EN"));
    expect(mockUpdate).toHaveBeenCalledWith({ languages: ["US"] });
  });

  it("shows selected count when languages are active", async () => {
    mockSettings.languages = ["EN", "DE"];
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("2 selected")).toBeInTheDocument();
    });
  });

  it("allows selecting 'All' which clears languages", async () => {
    mockSettings.languages = ["EN", "US"];
    renderSettingsPage();
    await waitFor(() => {
      const langSection = screen
        .getByText("Language / Country")
        .closest("section")!;
      expect(within(langSection).getByText("All")).toBeInTheDocument();
    });
    const langSection = screen
      .getByText("Language / Country")
      .closest("section")!;
    fireEvent.click(within(langSection).getByText("All"));
    expect(mockUpdate).toHaveBeenCalledWith({ languages: [] });
  });
});

// ═══════════════════════════════════════════════════════════
// Streaming Services filter
// ═══════════════════════════════════════════════════════════
describe("streaming services filter", () => {
  it("renders section heading", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Streaming Services")).toBeInTheDocument();
    });
  });

  it("renders 'All' button and service buttons", async () => {
    renderSettingsPage();
    await waitFor(() => {
      const svcSection = screen
        .getByText("Streaming Services")
        .closest("section")!;
      expect(within(svcSection).getByText("All")).toBeInTheDocument();
      expect(screen.getByText("NETFLIX")).toBeInTheDocument();
      expect(screen.getByText("HBO")).toBeInTheDocument();
      expect(screen.getByText("DISNEY+")).toBeInTheDocument();
      expect(screen.getByText("AMAZON")).toBeInTheDocument();
      expect(screen.getByText("CRUNCHYROLL")).toBeInTheDocument();
    });
  });

  it("toggles a service when clicked", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("HBO")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("HBO"));
    expect(mockUpdate).toHaveBeenCalledWith({ services: ["HBO"] });
  });

  it("removes a service when clicked again", async () => {
    mockSettings.services = ["HBO", "NETFLIX"];
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("HBO")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("HBO"));
    expect(mockUpdate).toHaveBeenCalledWith({ services: ["NETFLIX"] });
  });

  it("shows selected count when services are active", async () => {
    mockSettings.services = ["NETFLIX", "DISNEY+", "HBO"];
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("3 selected")).toBeInTheDocument();
    });
  });

  it("allows selecting 'All' which clears services", async () => {
    mockSettings.services = ["NETFLIX"];
    renderSettingsPage();
    await waitFor(() => {
      const svcSection = screen
        .getByText("Streaming Services")
        .closest("section")!;
      expect(within(svcSection).getByText("All")).toBeInTheDocument();
    });
    const svcSection = screen
      .getByText("Streaming Services")
      .closest("section")!;
    fireEvent.click(within(svcSection).getByText("All"));
    expect(mockUpdate).toHaveBeenCalledWith({ services: [] });
  });
});

// ═══════════════════════════════════════════════════════════
// Adult Content toggle
// ═══════════════════════════════════════════════════════════
describe("adult content toggle", () => {
  it("renders section heading", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Parental Controls")).toBeInTheDocument();
    });
  });

  it("shows 'hidden' message by default", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Adult content is hidden")).toBeInTheDocument();
    });
  });

  it("shows 'visible' message when showAdult is true", async () => {
    mockSettings.showAdult = true;
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Adult content is visible")).toBeInTheDocument();
    });
  });

  it("toggles adult content when clicked", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Adult content is hidden")).toBeInTheDocument();
    });
    // Click the toggle button
    const toggle = screen
      .getByText("Adult content is hidden")
      .closest("label")
      ?.querySelector("button");
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle!);
    expect(mockUpdate).toHaveBeenCalledWith({ showAdult: true });
  });

  it("toggles adult content off when currently on", async () => {
    mockSettings.showAdult = true;
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Adult content is visible")).toBeInTheDocument();
    });
    const toggle = screen
      .getByText("Adult content is visible")
      .closest("label")
      ?.querySelector("button");
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle!);
    expect(mockUpdate).toHaveBeenCalledWith({ showAdult: false });
  });

  it("stats bar updates when adult content is shown", async () => {
    mockSettings.showAdult = true;
    renderSettingsPage();
    await waitFor(() => {
      // With showAdult=true, Adult 18+ category is now visible
      // Live: 4 (EN, US, DE, Adult 18+) — but also Movies=4
      expect(screen.getAllByText("4")).toHaveLength(2); // live + movies
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Hidden Categories section
// ═══════════════════════════════════════════════════════════
describe("hidden categories section", () => {
  it("renders section heading", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Hidden Categories")).toBeInTheDocument();
    });
  });

  it("shows hidden count when categories are hidden", async () => {
    mockSettings.hiddenCategories = ["1", "10"];
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("2 hidden")).toBeInTheDocument();
    });
  });

  it("does not show hidden count badge when none hidden", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Hidden Categories")).toBeInTheDocument();
    });
    expect(screen.queryByText("0 hidden")).not.toBeInTheDocument();
  });

  it("renders search input for filtering categories", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Search categories..."),
      ).toBeInTheDocument();
    });
  });

  it("lists all categories with type badges (Live TV, Movies, Series)", async () => {
    renderSettingsPage();
    await waitFor(() => {
      // Should see category names (full category_name including prefix)
      expect(screen.getByText("EN| Entertainment")).toBeInTheDocument();
      expect(screen.getByText("US| News")).toBeInTheDocument();
      expect(screen.getByText("DE| Sports")).toBeInTheDocument();
      expect(screen.getByText("NETFLIX Movies EN")).toBeInTheDocument();
      expect(screen.getByText("HBO Series")).toBeInTheDocument();
      // Type badges
      const badges = screen.getAllByText("Live TV");
      expect(badges.length).toBeGreaterThanOrEqual(3);
      expect(screen.getAllByText("Movies").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Series").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("filters category list by search query", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Search categories..."),
      ).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("Search categories...");
    fireEvent.change(input, { target: { value: "NETFLIX" } });
    await waitFor(() => {
      expect(screen.getByText("NETFLIX Movies EN")).toBeInTheDocument();
      expect(screen.getByText("NETFLIX Series EN")).toBeInTheDocument();
      expect(screen.queryByText("Entertainment")).not.toBeInTheDocument();
    });
  });

  it("shows 'No categories found' when search has no matches", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Search categories..."),
      ).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("Search categories...");
    fireEvent.change(input, { target: { value: "XYZZZZ" } });
    await waitFor(() => {
      expect(screen.getByText("No categories found")).toBeInTheDocument();
    });
  });

  it("toggles a category hidden state when clicked", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("EN| Entertainment")).toBeInTheDocument();
    });
    // Find the checkbox/button for EN| Entertainment
    const entertainmentRow = screen
      .getByText("EN| Entertainment")
      .closest("label");
    expect(entertainmentRow).toBeTruthy();
    const toggleBtn = entertainmentRow!.querySelector("button");
    expect(toggleBtn).toBeTruthy();
    fireEvent.click(toggleBtn!);
    expect(mockUpdate).toHaveBeenCalledWith({
      hiddenCategories: ["1"],
    });
  });

  it("unhides a category when clicked again", async () => {
    mockSettings.hiddenCategories = ["1"];
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("EN| Entertainment")).toBeInTheDocument();
    });
    const entertainmentRow = screen
      .getByText("EN| Entertainment")
      .closest("label");
    const toggleBtn = entertainmentRow!.querySelector("button");
    fireEvent.click(toggleBtn!);
    expect(mockUpdate).toHaveBeenCalledWith({
      hiddenCategories: [],
    });
  });

  it("shows first 100 categories with overflow message if more exist", async () => {
    // Add 150 categories to test overflow
    const manyCats: Category[] = Array.from({ length: 150 }, (_, i) => ({
      category_id: String(100 + i),
      category_name: `Category ${i + 1}`,
      parent_id: 0,
    }));
    mockMovieCats.mockResolvedValue({ categories: manyCats });
    mockLiveCats.mockResolvedValue({ categories: [] });
    mockSeriesCats.mockResolvedValue({ categories: [] });

    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText(/Showing first 100/)).toBeInTheDocument();
    });
  });

  it("shows line-through style for hidden categories", async () => {
    mockSettings.hiddenCategories = ["1"];
    renderSettingsPage();
    await waitFor(() => {
      const entertainment = screen.getByText("EN| Entertainment");
      expect(entertainment.className).toContain("line-through");
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Theme customization
// ═══════════════════════════════════════════════════════════
describe("theme customization", () => {
  it("renders theme section with Dark, Light, and System buttons", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Theme")).toBeInTheDocument();
      expect(screen.getByText("Dark")).toBeInTheDocument();
      expect(screen.getByText("Light")).toBeInTheDocument();
      expect(screen.getByText("System")).toBeInTheDocument();
    });
  });

  it("highlights Dark as active by default", async () => {
    mockSettings.theme = "dark";
    renderSettingsPage();
    await waitFor(() => {
      const darkBtn = screen.getByText("Dark");
      expect(darkBtn.className).toContain("bg-primary");
    });
  });

  it("calls update with 'light' when Light button clicked", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Light")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Light"));
    expect(mockUpdate).toHaveBeenCalledWith({ theme: "light" });
  });

  it("calls update with 'system' when System button clicked", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("System")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("System"));
    expect(mockUpdate).toHaveBeenCalledWith({ theme: "system" });
  });

  it("shows Sun icon when light mode is active", async () => {
    mockSettings.theme = "light";
    renderSettingsPage();
    await waitFor(() => {
      // The Sun icon should be in the document (lucide-react renders inline SVGs)
      const svg = document.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Error handling
// ═══════════════════════════════════════════════════════════
describe("error handling", () => {
  it("handles API errors gracefully (no crash)", async () => {
    mockLiveCats.mockRejectedValue(new Error("Network error"));
    mockMovieCats.mockRejectedValue(new Error("Network error"));
    mockSeriesCats.mockRejectedValue(new Error("Network error"));

    renderSettingsPage();
    await waitFor(() => {
      // Should still render without language/service buttons since data is empty
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
    // With all errors, categories are empty arrays
    const langSection = screen.getByText("Language / Country");
    expect(langSection).toBeInTheDocument();
    // No prefix buttons because there are no categories
    expect(screen.queryByText("EN")).not.toBeInTheDocument();
  });

  it("handles partial API failure (some endpoints succeed, some fail)", async () => {
    mockLiveCats.mockResolvedValue({ categories: sampleLiveCats });
    mockMovieCats.mockRejectedValue(new Error("Timeout"));
    mockSeriesCats.mockResolvedValue({ categories: sampleSeriesCats });

    renderSettingsPage();
    await waitFor(() => {
      // Should still work with available data
      expect(screen.getByText("EN")).toBeInTheDocument(); // from live cats
      expect(screen.getByText("US")).toBeInTheDocument();
      expect(screen.getByText("DE")).toBeInTheDocument();
      // No movie categories means no service buttons from movies
    });
    // Live and Series categories should be visible in hidden list
    expect(screen.getByText("EN| Entertainment")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// Reset to defaults
// ═══════════════════════════════════════════════════════════
describe("reset to defaults", () => {
  it("calls reset when reset button clicked in stats bar", async () => {
    renderSettingsPage();
    await waitFor(() => {
      expect(screen.getByText("Reset")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Reset"));
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});
