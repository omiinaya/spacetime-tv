import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import PlayerErrorOverlay from "@/components/PlayerErrorOverlay";

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    phase: "error",
    errorMsg: "Something broke",
    errorType: null,
    onRetry: vi.fn(),
    ...overrides,
  } as Parameters<typeof PlayerErrorOverlay>[0];
}

describe("PlayerErrorOverlay", () => {
  it("renders nothing when not in error phase", () => {
    const { container } = render(
      <PlayerErrorOverlay {...makeProps({ phase: "playing" })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the error message and a Retry button", () => {
    const onRetry = vi.fn();
    render(<PlayerErrorOverlay {...makeProps({ onRetry })} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something broke")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows retry-exhausted guidance", () => {
    render(
      <PlayerErrorOverlay {...makeProps({ errorType: "retry_exhausted" })} />,
    );
    expect(
      screen.getByText(/may be offline or experiencing high traffic/),
    ).toBeInTheDocument();
  });

  it("shows not-supported guidance", () => {
    render(
      <PlayerErrorOverlay {...makeProps({ errorType: "not_supported" })} />,
    );
    expect(screen.getByText(/switching to transcode mode/)).toBeInTheDocument();
  });

  it("shows empty-stream guidance", () => {
    render(
      <PlayerErrorOverlay {...makeProps({ errorType: "empty_stream" })} />,
    );
    expect(screen.getByText(/CDN edge server/)).toBeInTheDocument();
  });
});
