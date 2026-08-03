import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/components/SleepTimer", () => ({
  SleepTimer: () => <div data-testid="sleep-timer" />,
}));
vi.mock("@/components/AudioSelector", () => ({
  AudioSelector: () => <div data-testid="audio-selector" />,
}));
vi.mock("@/components/SubtitleSelector", () => ({
  SubtitleSelector: () => <div data-testid="subtitle-selector" />,
}));

import MobileMoreMenu from "@/components/MobileMoreMenu";
import { QUALITIES } from "@/hooks/useVideoPlayer";

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    isVod: true,
    isLive: false,
    isRecording: false,
    qualityIdx: 0,
    type: "movie",
    id: "42",
    epId: undefined,
    videoRef: { current: null },
    onRecordToggle: vi.fn(),
    onSetQuality: vi.fn(),
    switchAudioTrack: vi.fn(),
    ...overrides,
  } as Parameters<typeof MobileMoreMenu>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MobileMoreMenu", () => {
  it("is closed by default and opens on the More button", () => {
    render(<MobileMoreMenu {...makeProps()} />);
    // Menu content hidden until opened.
    expect(screen.queryByText("Download")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByText("Download")).toBeInTheDocument();
  });

  it("shows a download link for VOD with the right path", () => {
    render(<MobileMoreMenu {...makeProps({ type: "series", epId: "9" })} />);
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    const link = screen.getByRole("link", { name: /Download/ });
    expect(link.getAttribute("href")).toBe("/api/download/series/9");
  });

  it("triggers record toggle for live streams", () => {
    const onRecordToggle = vi.fn();
    render(
      <MobileMoreMenu
        {...makeProps({
          isLive: true,
          isVod: false,
          type: "live",
          onRecordToggle,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(onRecordToggle).toHaveBeenCalled();
  });

  it("dispatches the shortcuts custom event", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(<MobileMoreMenu {...makeProps({ isVod: false, isLive: false })} />);
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: /Shortcuts/ }));
    const dispatched = dispatchSpy.mock.calls.find(
      ([e]) => (e as CustomEvent).type === "stv:toggle-shortcuts",
    );
    expect(dispatched).toBeTruthy();
  });

  it("lists quality options for live streams and applies a selection", async () => {
    const onSetQuality = vi.fn();
    render(
      <MobileMoreMenu
        {...makeProps({
          isLive: true,
          isVod: false,
          type: "live",
          onSetQuality,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    const qLabel = QUALITIES[2].label;
    fireEvent.click(screen.getByRole("button", { name: qLabel }));
    expect(onSetQuality).toHaveBeenCalledWith(2);
    // Menu closes after selection.
    await waitFor(() =>
      expect(screen.queryByText("Quality")).not.toBeInTheDocument(),
    );
  });
});
