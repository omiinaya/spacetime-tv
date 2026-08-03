import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import PlayerTopBar from "@/components/PlayerTopBar";

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    controlsVisible: true,
    phase: "playing",
    isPiPActive: false,
    onBack: vi.fn(),
    onEnterPiP: vi.fn(),
    onExitPiP: vi.fn(),
    ...overrides,
  } as Parameters<typeof PlayerTopBar>[0];
}

describe("PlayerTopBar", () => {
  it("navigates back on the Back button", () => {
    const onBack = vi.fn();
    render(<PlayerTopBar {...makeProps({ onBack })} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to browsing" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("enters PiP when not active", () => {
    const onEnterPiP = vi.fn();
    render(<PlayerTopBar {...makeProps({ isPiPActive: false, onEnterPiP })} />);
    fireEvent.click(screen.getByRole("button", { name: "Picture in Picture" }));
    expect(onEnterPiP).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Exit Picture in Picture" }),
    ).not.toBeInTheDocument();
  });

  it("exits PiP when active and shows the exit label", () => {
    const onExitPiP = vi.fn();
    render(<PlayerTopBar {...makeProps({ isPiPActive: true, onExitPiP })} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Exit Picture in Picture" }),
    );
    expect(onExitPiP).toHaveBeenCalled();
  });

  it("hides controls when not visible and playing", () => {
    render(
      <PlayerTopBar
        {...makeProps({ controlsVisible: false, phase: "playing" })}
      />,
    );
    const root = screen
      .getByRole("button", { name: "Back to browsing" })
      .closest("div.absolute") as HTMLElement;
    expect(root.className).toContain("opacity-0");
    expect(root.className).toContain("pointer-events-none");
  });
});
