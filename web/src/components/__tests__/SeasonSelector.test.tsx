import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SeasonSelector from "@/components/SeasonSelector";

const baseSeasons = [
  { season_number: 1, episode_count: 10, name: "Season 1" },
  { season_number: 2, episode_count: 8, name: "Season 2" },
];

describe("SeasonSelector", () => {
  it("returns null when only one season tab", () => {
    const { container } = render(
      <SeasonSelector
        seasonTabs={[1]}
        activeSeason={1}
        onSeasonChange={vi.fn()}
        seasons={[{ season_number: 1 }]}
        tmdb={null}
        seasonWatched={new Map()}
        bodyRef={{ current: null } as React.RefObject<HTMLDivElement | null>}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders season tabs for multiple seasons", () => {
    render(
      <SeasonSelector
        seasonTabs={[1, 2]}
        activeSeason={1}
        onSeasonChange={vi.fn()}
        seasons={baseSeasons}
        tmdb={null}
        seasonWatched={new Map()}
        bodyRef={{ current: null } as React.RefObject<HTMLDivElement | null>}
      />,
    );
    expect(screen.getByText("Season 1")).toBeTruthy();
    expect(screen.getByText("Season 2")).toBeTruthy();
  });

  it("highlights active season", () => {
    const { container } = render(
      <SeasonSelector
        seasonTabs={[1, 2]}
        activeSeason={2}
        onSeasonChange={vi.fn()}
        seasons={baseSeasons}
        tmdb={null}
        seasonWatched={new Map()}
        bodyRef={{ current: null } as React.RefObject<HTMLDivElement | null>}
      />,
    );
    const buttons = container.querySelectorAll("button");
    const season2Btn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Season 2"),
    );
    expect(season2Btn?.className).toContain("bg-white text-black");
  });

  it("calls onSeasonChange when a season is clicked", () => {
    const onChange = vi.fn();
    render(
      <SeasonSelector
        seasonTabs={[1, 2]}
        activeSeason={1}
        onSeasonChange={onChange}
        seasons={baseSeasons}
        tmdb={null}
        seasonWatched={new Map()}
        bodyRef={{ current: null } as React.RefObject<HTMLDivElement | null>}
      />,
    );
    fireEvent.click(screen.getByText("Season 2"));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("shows watched count badge", () => {
    const watched = new Map<number, number>([[1, 5]]);
    render(
      <SeasonSelector
        seasonTabs={[1, 2]}
        activeSeason={1}
        onSeasonChange={vi.fn()}
        seasons={baseSeasons}
        tmdb={null}
        seasonWatched={watched}
        bodyRef={{ current: null } as React.RefObject<HTMLDivElement | null>}
      />,
    );
    expect(screen.getByText("✓5")).toBeTruthy();
  });

  it("renders episode count per season", () => {
    render(
      <SeasonSelector
        seasonTabs={[1, 2]}
        activeSeason={1}
        onSeasonChange={vi.fn()}
        seasons={baseSeasons}
        tmdb={null}
        seasonWatched={new Map()}
        bodyRef={{ current: null } as React.RefObject<HTMLDivElement | null>}
      />,
    );
    expect(screen.getByText("10ep")).toBeTruthy();
    expect(screen.getByText("8ep")).toBeTruthy();
  });
});
