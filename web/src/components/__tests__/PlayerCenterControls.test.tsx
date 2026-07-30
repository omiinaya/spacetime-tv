import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlayerCenterControls from "@/components/PlayerCenterControls";

describe("PlayerCenterControls", () => {
  const defaultProps = {
    controlsVisible: true,
    phase: "paused",
    onTogglePlay: vi.fn(),
    onSeek: vi.fn(),
    onCenterTouch: vi.fn(),
  };

  it("renders play/pause and seek buttons", () => {
    const { container } = render(<PlayerCenterControls {...defaultProps} />);
    const btns = container.querySelectorAll("button");
    expect(btns.length).toBe(3); // rewind, play/pause, forward
  });

  it("shows Play icon when phase is paused", () => {
    render(<PlayerCenterControls {...defaultProps} phase="paused" />);
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("shows Pause icon when phase is playing", () => {
    render(<PlayerCenterControls {...defaultProps} phase="playing" />);
    expect(screen.getByLabelText("Pause")).toBeInTheDocument();
  });

  it("shows controls when controlsVisible is true even if phase is playing", () => {
    const { container } = render(
      <PlayerCenterControls
        {...defaultProps}
        controlsVisible={true}
        phase="playing"
      />,
    );
    const outer = container.firstElementChild;
    expect(outer?.className).toContain("opacity-100");
  });

  it("hides controls when not visible and phase is playing", () => {
    const { container } = render(
      <PlayerCenterControls
        {...defaultProps}
        controlsVisible={false}
        phase="playing"
      />,
    );
    const outer = container.firstElementChild;
    expect(outer?.className).toContain("opacity-0");
  });

  it("shows controls when phase is paused even if controlsVisible is false", () => {
    const { container } = render(
      <PlayerCenterControls
        {...defaultProps}
        controlsVisible={false}
        phase="paused"
      />,
    );
    const outer = container.firstElementChild;
    expect(outer?.className).toContain("opacity-100");
  });

  it("calls onTogglePlay when play/pause button clicked", async () => {
    const onTogglePlay = vi.fn();
    render(
      <PlayerCenterControls {...defaultProps} onTogglePlay={onTogglePlay} />,
    );
    await userEvent.click(screen.getByLabelText("Play"));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("calls onSeek(-10) when rewind button clicked", async () => {
    const onSeek = vi.fn();
    render(<PlayerCenterControls {...defaultProps} onSeek={onSeek} />);
    await userEvent.click(screen.getByLabelText("Rewind 10 seconds"));
    expect(onSeek).toHaveBeenCalledWith(-10);
  });

  it("calls onSeek(10) when forward button clicked", async () => {
    const onSeek = vi.fn();
    render(<PlayerCenterControls {...defaultProps} onSeek={onSeek} />);
    await userEvent.click(screen.getByLabelText("Forward 10 seconds"));
    expect(onSeek).toHaveBeenCalledWith(10);
  });

  it("hides controls when phase is error", () => {
    const { container } = render(
      <PlayerCenterControls {...defaultProps} phase="error" />,
    );
    const outer = container.firstElementChild;
    expect(outer?.className).toContain("opacity-0");
  });

  it("hides controls when phase is loading", () => {
    const { container } = render(
      <PlayerCenterControls {...defaultProps} phase="loading" />,
    );
    const outer = container.firstElementChild;
    expect(outer?.className).toContain("opacity-0");
  });
});
