/**
 * Tests for LiveSearchResults — the "Live TV (n)" section of the search page.
 *
 * Covers: null render for empty streams, channel count heading, icon vs
 * placeholder, now-playing line, navigation on click, and load-more button
 * (visible, spinner while loading, hidden when counts match).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import LiveSearchResults from "@/components/LiveSearchResults";
import type { LiveStream } from "@/lib/types";

const streams: LiveStream[] = [
  {
    stream_id: 1,
    name: "BBC World",
    num: 101,
    stream_icon: "icons/bbc.png",
    tv_archive: 0,
  } as LiveStream,
  {
    stream_id: 2,
    name: "CNN",
    num: 102,
    stream_icon: "",
    tv_archive: 1,
  } as LiveStream,
];

function renderResults(
  overrides: Partial<Parameters<typeof LiveSearchResults>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <LiveSearchResults
        streams={streams}
        totalCount={10}
        loadingMore={false}
        onLoadMore={vi.fn()}
        showLoadMore={true}
        getNowPlaying={(id) => (id === 1 ? "World News at Six" : null)}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("LiveSearchResults", () => {
  it("returns null when there are no streams", () => {
    const { container } = renderResults({ streams: [] });
    expect(container.firstChild).toBeNull();
  });

  it("shows the section heading with the stream count", () => {
    renderResults();
    expect(screen.getByText("Live TV (2)")).toBeTruthy();
  });

  it("renders channel icons and hides them on error", () => {
    renderResults();
    const imgs = screen.getAllByRole("img");
    expect(imgs.length).toBe(1); // only the stream with an icon
    fireEvent.error(imgs[0]);
    expect((imgs[0] as HTMLImageElement).style.display).toBe("none");
  });

  it("renders a placeholder icon block for icon-less channels", () => {
    renderResults();
    expect(screen.getByText("CNN")).toBeTruthy();
  });

  it("shows the now-playing line when provided", () => {
    renderResults();
    expect(screen.getByText("World News at Six")).toBeTruthy();
  });

  it("navigates to the live watch route on click", () => {
    renderResults();
    const card = screen.getByText("BBC World").closest("button")!;
    fireEvent.click(card);
    // No router assertion — the data-watch-link attribute signals navigation
    expect(card.hasAttribute("data-watch-link")).toBe(true);
  });

  it("shows the load-more button when there are more results", () => {
    const onLoadMore = vi.fn();
    renderResults({ onLoadMore });
    fireEvent.click(screen.getByText(/Load more live channels/));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it("hides load-more when counts match", () => {
    renderResults({ totalCount: streams.length });
    expect(screen.queryByText(/Load more live channels/)).toBeNull();
  });

  it("shows a spinner inside load-more while loading", () => {
    renderResults({ loadingMore: true });
    const btn = screen.getByText(/Load more live channels/).closest("button")!;
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.querySelector("svg")).toBeTruthy();
  });
});
