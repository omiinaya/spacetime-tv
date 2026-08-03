import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import PlayerResumePrompt from "@/components/PlayerResumePrompt";

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    showResumePrompt: true,
    resumePos: 120,
    onResume: vi.fn(),
    onStartOver: vi.fn(),
    fmtTime: (t: number) =>
      `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`,
    ...overrides,
  } as Parameters<typeof PlayerResumePrompt>[0];
}

describe("PlayerResumePrompt", () => {
  it("renders nothing when not shown or no position", () => {
    const { container } = render(
      <PlayerResumePrompt {...makeProps({ showResumePrompt: false })} />,
    );
    expect(container.firstChild).toBeNull();
    const { container: c2 } = render(
      <PlayerResumePrompt {...makeProps({ resumePos: null })} />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it("shows the resume position and both actions", () => {
    render(<PlayerResumePrompt {...makeProps()} />);
    expect(
      screen.getByRole("dialog", { name: "Resume playback" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Resume from 2:00?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start Over" }),
    ).toBeInTheDocument();
  });

  it("fires onResume and onStartOver", () => {
    const onResume = vi.fn();
    const onStartOver = vi.fn();
    render(<PlayerResumePrompt {...makeProps({ onResume, onStartOver })} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start Over" }));
    expect(onStartOver).toHaveBeenCalled();
  });
});
