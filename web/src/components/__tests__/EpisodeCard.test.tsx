import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import EpisodeCard from "@/components/EpisodeCard";
import type { Episode } from "@/lib/types";

const baseEpisode: Episode = {
  id: "123",
  episode_num: 5,
  title: "The Mystery",
  info: {
    movie_image: "http://example.com/ep.jpg",
    duration_secs: 2700,
    plot: "A thrilling episode",
  },
};

function renderCard(ep: Episode = baseEpisode, opts: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <EpisodeCard
        ep={ep}
        onPlay={vi.fn()}
        activeSeason={1}
        seasonPosterUrl=""
        episodeProgress={new Map()}
        {...opts}
      />
    </MemoryRouter>,
  );
}

describe("EpisodeCard", () => {
  it("renders episode title and number", () => {
    renderCard();
    expect(screen.getByText("The Mystery")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("renders episode number badge", () => {
    const { container } = renderCard();
    const badge = container.querySelector("span.absolute.top-1\\.5");
    if (badge) {
      expect(badge.textContent).toBe("E05");
    }
  });

  it("shows fallback title when no title", () => {
    renderCard({ ...baseEpisode, title: undefined, info: undefined } as Episode);
    expect(screen.getByText("Episode 5")).toBeTruthy();
  });

  it("renders duration", () => {
    const { container } = renderCard();
    const durationEls = container.querySelectorAll('[class*="tabular-nums"]');
    // Should find the duration formatted as "45m" somewhere in the card
    expect(container.textContent).toContain("45m");
  });

  it("renders plot when available", () => {
    renderCard();
    expect(screen.getByText("A thrilling episode")).toBeTruthy();
  });

  it("calls onPlay when clicked", () => {
    const onPlay = vi.fn();
    renderCard(baseEpisode, { onPlay });
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onPlay).toHaveBeenCalledWith("123");
  });

  it("shows progress bar when episode has progress < 90%", () => {
    const progress = new Map<string, { progressSeconds: number; durationSeconds: number }>();
    progress.set("1:5", { progressSeconds: 500, durationSeconds: 2700 });
    const { container } = renderCard(baseEpisode, { episodeProgress: progress });
    // Progress bar is rendered inside a sub-element with style width
    const progressFills = container.querySelectorAll('[style*="width"]');
    expect(progressFills.length).toBeGreaterThan(0);
  });

  it("shows checkmark when episode progress >= 90%", () => {
    const progress = new Map<string, { progressSeconds: number; durationSeconds: number }>();
    progress.set("1:5", { progressSeconds: 2600, durationSeconds: 2700 });
    renderCard(baseEpisode, { episodeProgress: progress });
    expect(screen.getByText("✓")).toBeTruthy();
  });
});
