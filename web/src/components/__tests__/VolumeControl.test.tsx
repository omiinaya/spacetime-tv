import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VolumeControl from "@/components/VolumeControl";

describe("VolumeControl", () => {
  it("renders volume button", () => {
    render(
      <VolumeControl muted={false} volume={0.5} onToggleMute={vi.fn()} onSetVolume={vi.fn()} />,
    );
    expect(screen.getByLabelText("Mute")).toBeTruthy();
  });

  it("shows unmute label when muted", () => {
    render(
      <VolumeControl muted={true} volume={0} onToggleMute={vi.fn()} onSetVolume={vi.fn()} />,
    );
    expect(screen.getByLabelText("Unmute")).toBeTruthy();
  });

  it("shows unmute label when volume is 0", () => {
    render(
      <VolumeControl muted={false} volume={0} onToggleMute={vi.fn()} onSetVolume={vi.fn()} />,
    );
    expect(screen.getByLabelText("Unmute")).toBeTruthy();
  });

  it("shows volume slider popup on click", () => {
    render(
      <VolumeControl muted={false} volume={0.5} onToggleMute={vi.fn()} onSetVolume={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Mute"));
    expect(screen.getByLabelText("Volume")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("calls onToggleMute when mute button clicked in popup", () => {
    const onToggleMute = vi.fn();
    render(
      <VolumeControl muted={false} volume={0.5} onToggleMute={onToggleMute} onSetVolume={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Mute"));
    const muteBtns = screen.getAllByRole("button");
    // The mute button inside the popup
    fireEvent.click(muteBtns[1]);
    expect(onToggleMute).toHaveBeenCalled();
  });

  it("calls onSetVolume when slider is changed", () => {
    const onSetVolume = vi.fn();
    render(
      <VolumeControl muted={false} volume={0.5} onToggleMute={vi.fn()} onSetVolume={onSetVolume} />,
    );
    fireEvent.click(screen.getByLabelText("Mute"));
    const slider = screen.getByLabelText("Volume");
    fireEvent.change(slider, { target: { value: "0.8" } });
    expect(onSetVolume).toHaveBeenCalledWith(0.8);
  });

  it("shows 0% when muted", () => {
    render(
      <VolumeControl muted={true} volume={0.5} onToggleMute={vi.fn()} onSetVolume={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Unmute"));
    expect(screen.getByText("0%")).toBeTruthy();
  });
});
