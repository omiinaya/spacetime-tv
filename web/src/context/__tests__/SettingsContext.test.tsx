/**
 * Tests for the SettingsContext provider and hook.
 *
 * SettingsProvider loads settings from localStorage on mount and provides
 * update and reset functions via the SettingsContext.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";

// Mock the settings lib
const mockLoadSettings = vi.fn();
const mockSaveSettings = vi.fn();
const defaultSettings = {
  languages: [],
  hiddenCategories: [],
  showAdult: false,
  services: [],
  quality: "auto",
  playbackSpeed: 1,
  subtitleLanguage: "eng",
  audioLanguage: "eng",
  theme: "dark",
};

vi.mock("@/lib/settings", () => ({
  loadSettings: () => mockLoadSettings(),
  saveSettings: (s: unknown) => mockSaveSettings(s),
  DEFAULT_SETTINGS: {
    languages: [],
    hiddenCategories: [],
    showAdult: false,
    services: [],
    quality: "auto",
    playbackSpeed: 1,
    subtitleLanguage: "eng",
    audioLanguage: "eng",
    theme: "dark",
  },
  AppSettings: {},
}));

// Test component that uses the context
function TestConsumer() {
  const { settings, update, reset } = useSettings();
  return (
    <div>
      <p data-testid="quality">{settings.quality}</p>
      <p data-testid="showAdult">{String(settings.showAdult)}</p>
      <p data-testid="hiddenCount">
        {String(settings.hiddenCategories.length)}
      </p>
      <button
        data-testid="update-quality"
        onClick={() => update({ quality: "high" })}
      >
        Set High Quality
      </button>
      <button
        data-testid="update-adult"
        onClick={() => update({ showAdult: true })}
      >
        Show Adult
      </button>
      <button data-testid="reset-btn" onClick={() => reset()}>
        Reset
      </button>
    </div>
  );
}

describe("SettingsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockReturnValue({ ...defaultSettings });
  });

  function renderWithProvider() {
    return render(
      <SettingsProvider>
        <TestConsumer />
      </SettingsProvider>,
    );
  }

  it("provides default settings at start", async () => {
    renderWithProvider();
    expect(screen.getByTestId("quality").textContent).toBe("auto");
    expect(screen.getByTestId("showAdult").textContent).toBe("false");
  });

  it("loads settings from lib on mount", async () => {
    mockLoadSettings.mockReturnValue({
      ...defaultSettings,
      quality: "high",
      showAdult: true,
    });
    renderWithProvider();
    expect(screen.getByTestId("quality").textContent).toBe("high");
    expect(screen.getByTestId("showAdult").textContent).toBe("true");
  });

  it("update merges partial settings and saves", async () => {
    renderWithProvider();
    expect(screen.getByTestId("quality").textContent).toBe("auto");

    fireEvent.click(screen.getByTestId("update-quality"));

    expect(screen.getByTestId("quality").textContent).toBe("high");
    // saveSettings should have been called with merged settings
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ quality: "high" }),
    );
  });

  it("update preserves other settings when merging", async () => {
    mockLoadSettings.mockReturnValue({
      ...defaultSettings,
      showAdult: true,
      hiddenCategories: ["sports"],
    });
    renderWithProvider();

    fireEvent.click(screen.getByTestId("update-quality"));

    // showAdult should still be true
    expect(screen.getByTestId("showAdult").textContent).toBe("true");
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        quality: "high",
        showAdult: true,
        hiddenCategories: ["sports"],
      }),
    );
  });

  it("reset restores default settings", async () => {
    mockLoadSettings.mockReturnValue({
      ...defaultSettings,
      quality: "high",
      showAdult: true,
    });
    renderWithProvider();

    expect(screen.getByTestId("quality").textContent).toBe("high");

    fireEvent.click(screen.getByTestId("reset-btn"));

    expect(screen.getByTestId("quality").textContent).toBe("auto");
    expect(screen.getByTestId("showAdult").textContent).toBe("false");
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ quality: "auto", showAdult: false }),
    );
  });

  it("calls loadSettings once on mount", async () => {
    renderWithProvider();
    expect(mockLoadSettings).toHaveBeenCalledTimes(1);
  });

  it("returns defaults when useSettings is called outside provider", async () => {
    // useSettings returns the default context values when no provider is present
    const { container } = render(<TestConsumer />);
    expect(
      container.querySelector('[data-testid="quality"]')?.textContent,
    ).toBe("auto");
    expect(
      container.querySelector('[data-testid="showAdult"]')?.textContent,
    ).toBe("false");
  });
});

describe("SettingsContext — theme application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockReturnValue({ ...defaultSettings });
    // Ensure clean document state
    document.documentElement.classList.remove("dark", "light");
  });

  function renderWithProvider() {
    return render(
      <SettingsProvider>
        <TestConsumer />
      </SettingsProvider>,
    );
  }

  it("applies dark class to html element by default", async () => {
    renderWithProvider();
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.classList.contains("light")).toBe(false);
    });
  });

  it("applies light class when theme is light", async () => {
    mockLoadSettings.mockReturnValue({ ...defaultSettings, theme: "light" });
    renderWithProvider();
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("updates html classes when theme setting changes via update", async () => {
    // Render a consumer that can update theme
    function ThemeConsumer() {
      const { update } = useSettings();
      return (
        <div>
          <button
            data-testid="set-light"
            onClick={() => update({ theme: "light" })}
          >
            Set Light
          </button>
          <button
            data-testid="set-dark"
            onClick={() => update({ theme: "dark" })}
          >
            Set Dark
          </button>
        </div>
      );
    }
    render(
      <SettingsProvider>
        <ThemeConsumer />
      </SettingsProvider>,
    );
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    fireEvent.click(screen.getByTestId("set-light"));
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    fireEvent.click(screen.getByTestId("set-dark"));
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.classList.contains("light")).toBe(false);
    });
  });
});
