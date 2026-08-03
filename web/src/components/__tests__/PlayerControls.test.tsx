/**
 * Tests for PlayerLoadingOverlay + PlayerProgressBar — the player
 * loading/probing overlay and the seek timeline.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PlayerLoadingOverlay from "@/components/PlayerLoadingOverlay";
import PlayerProgressBar from "@/components/PlayerProgressBar";

describe("PlayerLoadingOverlay", () => {
  it("renders nothing outside loading/probing phases", () => {
    const { container } = render(
      <PlayerLoadingOverlay
        phase="playing"
        loadingStep={null}
        errorMsg={null}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows loading step text when provided", () => {
    render(
      <PlayerLoadingOverlay
        phase="loading"
        loadingStep="Connecting…"
        errorMsg={null}
      />,
    );
    expect(screen.getByText("Connecting…")).toBeTruthy();
  });

  it("falls back to default loading text", () => {
    render(
      <PlayerLoadingOverlay
        phase="loading"
        loadingStep={null}
        errorMsg={null}
      />,
    );
    expect(screen.getByText(/Loading/)).toBeTruthy();
  });

  it("shows probing default text", () => {
    render(
      <PlayerLoadingOverlay
        phase="probing"
        loadingStep={null}
        errorMsg={null}
      />,
    );
    expect(screen.getByText(/Detecting video format/)).toBeTruthy();
  });

  it("shows error message when provided", () => {
    render(
      <PlayerLoadingOverlay
        phase="loading"
        loadingStep="Retrying…"
        errorMsg="Stream failed"
      />,
    );
    expect(screen.getByText("Stream failed")).toBeTruthy();
  });
});

describe("PlayerProgressBar", () => {
  const base = {
    isLive: false,
    isVod: true,
    liveSeekableStart: 0,
    liveSeekableEnd: 0,
    currentTime: 30,
    duration: 120,
    progressPct: 25,
    bufferedPct: 50,
    secondsBehindLive: 0,
    onSeekTo: vi.fn(),
    onShowControls: vi.fn(),
    fmtTime: (t: number) =>
      `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`,
  };

  it("renders nothing for live without a DVR buffer", () => {
    const { container } = render(
      <PlayerProgressBar {...base} isVod={false} isLive liveSeekableEnd={0} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows for live with DVR buffer", () => {
    render(
      <PlayerProgressBar
        {...base}
        isVod={false}
        isLive
        liveSeekableStart={100}
        liveSeekableEnd={5000}
        currentTime={4900}
        secondsBehindLive={100}
      />,
    );
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuetext")).toContain("100s behind live");
  });

  it("shows VOD time in aria-valuetext", () => {
    render(<PlayerProgressBar {...base} />);
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuetext")).toContain("0:30 of 2:00");
  });

  it("seeks to a clicked fraction on VOD", () => {
    const onSeekTo = vi.fn();
    const { container } = render(
      <PlayerProgressBar {...base} onSeekTo={onSeekTo} />,
    );
    const bar = container.querySelector('[role="slider"]')!;
    // Simulate a click at 50% of a 200px bar
    vi.spyOn(bar as HTMLElement, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 200,
      top: 0,
      bottom: 0,
      right: 200,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.click(bar, { clientX: 100 });
    expect(onSeekTo).toHaveBeenCalledWith(60); // 0.5 * 120
    expect(base.onShowControls).toHaveBeenCalledWith(true);
  });

  it("seeks within the DVR window on live", () => {
    const onSeekTo = vi.fn();
    const { container } = render(
      <PlayerProgressBar
        {...base}
        isVod={false}
        isLive
        liveSeekableStart={100}
        liveSeekableEnd={2100}
        duration={0}
        onSeekTo={onSeekTo}
      />,
    );
    const bar = container.querySelector('[role="slider"]')!;
    vi.spyOn(bar as HTMLElement, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 200,
      top: 0,
      bottom: 0,
      right: 200,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.click(bar, { clientX: 100 });
    expect(onSeekTo).toHaveBeenCalledWith(1100); // 100 + 0.5*2000
  });
});
