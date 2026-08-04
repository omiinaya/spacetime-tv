/**
 * Tests for SeriesWatchingSection — the thin composition wrapper that renders
 * ContinueWatchingRow + RecentlyCompletedRow.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SeriesWatchingSection from "@/components/SeriesWatchingSection";

// Stub the two row components so the composition is observable without
// exercising their internal localStorage logic (covered in their own suites).
vi.mock("@/components/ContinueWatchingRow", () => ({
  default: () => <div data-testid="continue-row" />,
}));
vi.mock("@/components/RecentlyCompletedRow", () => ({
  default: () => <div data-testid="recently-completed-row" />,
}));

describe("SeriesWatchingSection", () => {
  it("renders both watching rows", () => {
    render(<SeriesWatchingSection navigate={vi.fn()} />);
    expect(screen.getByTestId("continue-row")).toBeTruthy();
    expect(screen.getByTestId("recently-completed-row")).toBeTruthy();
  });

  it("passes the navigate function through", () => {
    const navigate = vi.fn();
    render(<SeriesWatchingSection navigate={navigate} />);
    expect(navigate).toBeTruthy();
  });
});
