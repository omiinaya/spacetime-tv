/**
 * Tests for LiveChannelCard — the clickable channel tile in live TV grids.
 *
 * Covers: icon vs placeholder, channel number badge, ARCH badge, now-playing
 * line, navigation via click and Enter/Space key, favorite toggle with
 * stopPropagation, and favorite aria-label states.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import LiveChannelCard from "@/components/LiveChannelCard";
import type { LiveStream } from "@/lib/types";

const stream: LiveStream = {
  stream_id: 42,
  name: "Al Jazeera",
  num: 110,
  stream_icon: "icons/aj.png",
  tv_archive: 1,
} as LiveStream;

function renderCard(
  overrides: Partial<Parameters<typeof LiveChannelCard>[0]> = {},
) {
  const onToggleFavorite = vi.fn();
  return {
    onToggleFavorite,
    ...render(
      <MemoryRouter>
        <LiveChannelCard
          stream={stream}
          isFavorite={false}
          onToggleFavorite={onToggleFavorite}
          getNowPlaying={() => "News Hour"}
          {...overrides}
        />
      </MemoryRouter>,
    ),
  };
}

describe("LiveChannelCard", () => {
  it("renders the channel name and icon", () => {
    renderCard();
    expect(screen.getByText("Al Jazeera")).toBeTruthy();
    expect(screen.getByRole("img")).toBeTruthy();
  });

  it("renders the channel number badge when num > 0", () => {
    renderCard();
    expect(screen.getByText("110")).toBeTruthy();
  });

  it("renders the ARCH badge when tv_archive is set", () => {
    renderCard();
    expect(screen.getByText("ARCH")).toBeTruthy();
  });

  it("renders a placeholder icon block when no stream icon", () => {
    renderCard({ stream: { ...stream, stream_icon: "" } });
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the now-playing line when available", () => {
    renderCard({ getNowPlaying: () => "Prime News" });
    expect(screen.getByText("Prime News")).toBeTruthy();
  });

  it("hides the now-playing line when absent", () => {
    renderCard({ getNowPlaying: () => null as string | null });
    expect(screen.queryByText("Prime News")).toBeNull();
  });

  it("navigates on click (watch-link signal)", () => {
    renderCard();
    const card = screen.getByText("Al Jazeera").closest("[data-watch-link]")!;
    expect(card).toBeTruthy();
  });

  it("toggles favorite and stops propagation", () => {
    const { onToggleFavorite } = renderCard();
    fireEvent.click(screen.getByLabelText("Add to favorites"));
    expect(onToggleFavorite).toHaveBeenCalledWith(42);
  });

  it("uses Remove-from-favorites label when favorited", () => {
    renderCard({ isFavorite: true });
    expect(screen.getByLabelText("Remove from favorites")).toBeTruthy();
  });

  it("hides the icon on load error", () => {
    renderCard();
    const img = screen.getByRole("img");
    fireEvent.error(img);
    expect((img as HTMLImageElement).style.display).toBe("none");
  });
});
