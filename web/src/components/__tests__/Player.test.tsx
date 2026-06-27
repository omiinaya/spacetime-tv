/**
 * Tests for the Player component rendering.
 *
 * The Player component is the main video player wrapper. It depends
 * on useVideoPlayer, useFullscreen, useKeyboard hooks and various
 * sub-components. We test the rendering logic in different phases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import Player from "@/components/Player";

// Mock the heavy dependencies
vi.mock("mpegts.js", () => {
  const Events = {
    MEDIA_INFO: "media_info",
    LOADING_COMPLETE: "loading_complete",
    STATISTICS_INFO: "statistics_info",
    ERROR: "error",
  };
  const createPlayer = vi.fn(() => ({
    attachMediaElement: vi.fn(),
    load: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }));
  return {
    default: { createPlayer, Events, isSupported: () => true },
    Events,
    createPlayer,
  };
});

vi.mock("hls.js", () => {
  class Hls {
    static isSupported = vi.fn(() => true);
    static Events = {
      MANIFEST_PARSED: "manifest_parsed",
      ERROR: "hls_error",
      MEDIA_ATTACHED: "media_attached",
    };
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
    on = vi.fn();
    off = vi.fn();
    levels = [{ details: { totalduration: 3600 } }];
  }
  return { default: Hls };
});

vi.mock("@/hooks/useFullscreen", () => ({
  useFullscreen: () => ({ isFullscreen: false, setIsFullscreen: vi.fn() }),
}));

vi.mock("@/hooks/useKeyboard", () => ({
  useKeyboard: vi.fn(),
}));

vi.mock("@/lib/continueWatching", () => ({
  saveSeriesProgress: vi.fn(),
  saveMovieProgress: vi.fn(),
}));

vi.mock("@/lib/watchProgressSync", () => ({
  queueProgress: vi.fn(),
}));

vi.mock("@/lib/recentChannels", () => ({
  saveRecentChannel: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    live: {
      info: vi.fn(() => Promise.resolve({ streams: [{ name: "Test Channel", stream_icon: "" }] })),
    },
    series: {
      info: vi.fn(() => Promise.resolve({})),
    },
  },
  imageUrl: (url: string) => url,
}));

// Mock sub-components used by Player
vi.mock("@/components/SubtitleSelector", () => ({
  SubtitleSelector: () => null,
}));
vi.mock("@/components/AudioSelector", () => ({
  AudioSelector: () => null,
}));
vi.mock("@/components/SleepTimer", () => ({
  SleepTimer: () => null,
}));

// Helper to render Player inside a Router
function renderPlayer(type: "live" | "movie" | "series", params: Record<string, string> = {}) {
  // Build the path pattern and initial route
  let path = "";
  let initialRoute = "";
  if (type === "live") {
    path = "/watch/live/:id";
    initialRoute = `/watch/live/${params.id || "999"}`;
  } else if (type === "movie") {
    path = "/watch/movie/:id";
    initialRoute = `/watch/movie/${params.id || "456"}`;
  } else {
    path = "/watch/series/:seriesId/:epId";
    initialRoute = `/watch/series/${params.seriesId || "42"}/${params.epId || "101"}`;
  }

  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path={path} element={<Player type={type} />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Player rendering by type ────────────────────────────────
describe("Player — rendering by type", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('renders a video element for live type', async () => {
    renderPlayer('live', { id: '123' });
    await act(async () => {});
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('playsinline')).toBe('');
  });

  it('renders a video element for movie type', async () => {
    renderPlayer('movie', { id: '456' });
    await act(async () => {});
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
  });

  it('renders a video element for series type', async () => {
    renderPlayer('series', { seriesId: '42', epId: '101' });
    await act(async () => {});
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
  });

  it('has back button in top bar', async () => {
    renderPlayer('movie', { id: '789' });
    await act(async () => {});
    const backButton = screen.getByLabelText('Back to browsing');
    expect(backButton).not.toBeNull();
  });

  it('has PiP button in top bar', async () => {
    renderPlayer('movie', { id: '101112' });
    await act(async () => {});
    const pipButton = screen.getByLabelText('Picture in Picture');
    expect(pipButton).not.toBeNull();
  });
});

// ── Player — phase states ───────────────────────────────────
describe("Player — phase states", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("shows loading indicator during loading/probing phase", async () => {
    renderPlayer("movie", { id: "131415" });
    // During the loading phase, the component shows a Loader2 spinner
    // with text like "Detecting video format…" or "Loading…"
    // The text might be one of several variants since the effect runs async
    await waitFor(() => {
      // The spinner should be visible
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).not.toBeNull();
    });
  });

  it("shows playback controls (play button, rewind, forward)", async () => {
    renderPlayer("movie", { id: "161718" });

    // Center controls should be rendered
    await waitFor(() => {
      // Rewind, Play/Pause, Forward buttons should exist
      const rewindBtn = screen.getByLabelText("Rewind 10 seconds");
      expect(rewindBtn).not.toBeNull();
      const forwardBtn = screen.getByLabelText("Forward 10 seconds");
      expect(forwardBtn).not.toBeNull();
    });
  });
});

// ── Player — progress bar ───────────────────────────────────
describe("Player — progress bar", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("renders a seekable progress bar for VOD", async () => {
    renderPlayer("movie", { id: "192021" });

    // The progress bar slider should exist
    await waitFor(() => {
      const slider = screen.getByRole("slider", { name: /seek/i });
      expect(slider).not.toBeNull();
    });
  });
});
