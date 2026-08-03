import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock heavy child components to test the control logic in isolation.
vi.mock("@/components/PlayerProgressBar", () => ({
  default: ({ onSeekTo }: { onSeekTo?: (t: number) => void }) => (
    <div data-testid="progress-bar" onClick={() => onSeekTo?.(42)} />
  ),
}));
vi.mock("@/components/ConnectionIndicator", () => ({
  default: () => <div data-testid="connection-indicator" />,
}));
vi.mock("@/components/VolumeControl", () => ({
  default: () => <div data-testid="volume-control" />,
}));
vi.mock("@/components/MobileMoreMenu", () => ({
  default: () => <div data-testid="mobile-more-menu" />,
}));
vi.mock("@/components/SleepTimer", () => ({
  SleepTimer: () => <div data-testid="sleep-timer" />,
}));
vi.mock("@/components/AudioSelector", () => ({
  AudioSelector: () => <div data-testid="audio-selector" />,
}));
vi.mock("@/components/SubtitleSelector", () => ({
  SubtitleSelector: () => <div data-testid="subtitle-selector" />,
}));

import PlayerBottomControls from "@/components/PlayerBottomControls";
import { SPEEDS } from "@/hooks/useVideoPlayer";

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    controlsVisible: true,
    phase: "playing",
    isLive: false,
    isVod: true,
    isFullscreen: false,
    isRecording: false,
    muted: false,
    volume: 1,
    playbackRate: 1,
    qualityIdx: 0,
    currentTime: 65,
    duration: 300,
    progressPct: 20,
    bufferedPct: 40,
    isBehindLive: false,
    secondsBehindLive: 0,
    liveSeekableStart: 0,
    liveSeekableEnd: 0,
    transcoding: false,
    connectionQuality: "good",
    downloadSpeed: 8,
    stallCount: 0,
    frameRate: { videoFps: 0, displayHz: 60, label: "" },
    suggestLowerQuality: false,
    type: "movie",
    id: "123",
    epId: undefined,
    videoRef: { current: null },
    fullscreenBtnRef: { current: null },
    onTogglePlay: vi.fn(),
    onSeekTo: vi.fn(),
    onToggleMute: vi.fn(),
    onSetVolume: vi.fn(),
    onSetSpeed: vi.fn(),
    onSetQuality: vi.fn(),
    onSeekToLive: vi.fn(),
    onRecordToggle: vi.fn(),
    onShowControls: vi.fn(),
    onToggleFullscreen: vi.fn(),
    fmtTime: (t: number) =>
      `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`,
    switchAudioTrack: vi.fn(),
    ...overrides,
  } as Parameters<typeof PlayerBottomControls>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlayerBottomControls", () => {
  it("shows VOD time display and download link for movies", () => {
    render(<PlayerBottomControls {...makeProps()} />);
    expect(screen.getByText("1:05 / 5:00")).toBeInTheDocument();
    const download = screen.getByRole("link", { name: "Download for offline" });
    expect(download.getAttribute("href")).toBe("/api/download/movie/123");
  });

  it("shows a LIVE badge and Go Live button when behind live", () => {
    const onSeekToLive = vi.fn();
    render(
      <PlayerBottomControls
        {...makeProps({
          isLive: true,
          isVod: false,
          isBehindLive: true,
          secondsBehindLive: 90,
          onSeekToLive,
        })}
      />,
    );
    expect(screen.getByText("-90s")).toBeInTheDocument();
    const goLive = screen.getByRole("button", { name: "Return to live" });
    fireEvent.click(goLive);
    expect(onSeekToLive).toHaveBeenCalled();
  });

  it("renders a record toggle for live streams", () => {
    const onRecordToggle = vi.fn();
    render(
      <PlayerBottomControls
        {...makeProps({
          isLive: true,
          isVod: false,
          type: "live",
          onRecordToggle,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    expect(onRecordToggle).toHaveBeenCalled();
  });

  it("toggles the playback speed menu and applies a speed", () => {
    const onSetSpeed = vi.fn();
    render(<PlayerBottomControls {...makeProps({ onSetSpeed })} />);
    fireEvent.click(screen.getByRole("button", { name: "Playback speed 1x" }));
    // Menu lists all SPEEDS.
    for (const s of SPEEDS) {
      expect(screen.getByRole("button", { name: `${s}x` })).toBeInTheDocument();
    }
    fireEvent.click(
      screen.getByRole("button", { name: `${SPEEDS[SPEEDS.length - 1]}x` }),
    );
    expect(onSetSpeed).toHaveBeenCalledWith(SPEEDS[SPEEDS.length - 1]);
  });

  it("shows the lower-quality suggestion and applies the next tier", () => {
    const onSetQuality = vi.fn();
    render(
      <PlayerBottomControls
        {...makeProps({
          suggestLowerQuality: true,
          qualityIdx: 1,
          connectionQuality: "poor",
          onSetQuality,
        })}
      />,
    );
    const lower = screen.getByRole("button", {
      name: "Lower video quality for smoother playback",
    });
    fireEvent.click(lower);
    expect(onSetQuality).toHaveBeenCalledWith(2);
  });

  it("uses aria-label for fullscreen toggle matching state", () => {
    const { rerender } = render(
      <PlayerBottomControls {...makeProps({ isFullscreen: false })} />,
    );
    expect(
      screen.getByRole("button", { name: "Enter fullscreen" }),
    ).toBeInTheDocument();
    rerender(<PlayerBottomControls {...makeProps({ isFullscreen: true })} />);
    expect(
      screen.getByRole("button", { name: "Exit fullscreen" }),
    ).toBeInTheDocument();
  });

  it("hides controls when not visible and playing", () => {
    render(
      <PlayerBottomControls
        {...makeProps({ controlsVisible: false, phase: "playing" })}
      />,
    );
    // The root div gets opacity-0 pointer-events-none.
    const root = screen
      .getByTestId("progress-bar")
      .closest("div.absolute") as HTMLElement;
    expect(root.className).toContain("opacity-0");
    expect(root.className).toContain("pointer-events-none");
  });
});
