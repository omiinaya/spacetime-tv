/**
 * Tests for ContentRow — the horizontally-scrollable media carousel.
 *
 * jsdom gives all scroll metrics as 0, so the test patches the row element's
 * scrollWidth/clientWidth/scrollLeft via Object.defineProperty and stubs
 * scrollBy/getBoundingClientRect to exercise the arrow + keyboard logic.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ContentRow from "@/components/ContentRow";

function renderRow(overrides: Partial<Parameters<typeof ContentRow>[0]> = {}) {
  const onScrollEnd = vi.fn();
  const view = render(
    <ContentRow
      title="Trending Now"
      itemCount={42}
      onScrollEnd={onScrollEnd}
      {...overrides}
    >
      <div data-row-idx={0} tabIndex={0}>
        Card A
      </div>
      <div data-row-idx={1} tabIndex={0}>
        Card B
      </div>
      <div data-row-idx={2} tabIndex={0}>
        Card C
      </div>
    </ContentRow>,
  );
  return { onScrollEnd, ...view };
}

function getRowEl(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>(".flex.gap-4")!;
}

function mockMetrics(
  container: HTMLElement,
  opts: {
    scrollWidth?: number;
    clientWidth?: number;
    scrollLeft?: number;
  } = {},
) {
  const el = getRowEl(container);
  const scrollBy = vi.fn();
  Object.defineProperty(el, "scrollWidth", {
    configurable: true,
    value: opts.scrollWidth ?? 2000,
  });
  Object.defineProperty(el, "clientWidth", {
    configurable: true,
    value: opts.clientWidth ?? 500,
  });
  Object.defineProperty(el, "scrollLeft", {
    configurable: true,
    value: opts.scrollLeft ?? 0,
  });
  el.scrollBy = scrollBy;
  return { el, scrollBy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContentRow", () => {
  it("renders the title and item count badge", () => {
    renderRow();
    expect(screen.getByText("Trending Now")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("renders children cards", () => {
    renderRow();
    expect(screen.getByText("Card A")).toBeTruthy();
    expect(screen.getByText("Card C")).toBeTruthy();
  });

  it("hides the count badge when itemCount is absent", () => {
    renderRow({ itemCount: undefined });
    expect(screen.queryByText("42")).toBeNull();
  });

  it("renders the action button and fires its onClick", () => {
    const onClick = vi.fn();
    renderRow({ action: { label: "See all", onClick } });
    fireEvent.click(screen.getByText("See all"));
    expect(onClick).toHaveBeenCalled();
  });

  it("shows the right arrow initially and hides the left", () => {
    const { container } = renderRow();
    mockMetrics(container);
    fireEvent.scroll(getRowEl(container)); // recompute arrows
    expect(screen.queryAllByRole("button").length).toBe(1);
  });

  it("scrolls right by 75% of client width", () => {
    const { container } = renderRow();
    const { scrollBy } = mockMetrics(container);
    fireEvent.scroll(getRowEl(container)); // recompute arrows
    fireEvent.click(screen.getByRole("button"));
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 375, behavior: "smooth" }),
    );
  });

  it("scrolls left when scrolled past the start", () => {
    const { container } = renderRow();
    mockMetrics(container, { scrollLeft: 300 });
    fireEvent.scroll(getRowEl(container)); // recompute arrows
    const buttons = screen.queryAllByRole("button");
    expect(buttons.length).toBe(2);
    const { scrollBy } = mockMetrics(container, { scrollLeft: 300 });
    fireEvent.click(buttons[0]);
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: -375, behavior: "smooth" }),
    );
  });

  it("fires onScrollEnd when near the end", () => {
    const { container, onScrollEnd } = renderRow();
    mockMetrics(container, { scrollLeft: 1400 }); // 1400 + 500 = 1900 >= 1800
    fireEvent.scroll(getRowEl(container));
    expect(onScrollEnd).toHaveBeenCalled();
  });

  it("does not fire onScrollEnd far from the end", () => {
    const { container, onScrollEnd } = renderRow();
    mockMetrics(container, { scrollLeft: 100 });
    fireEvent.scroll(getRowEl(container));
    expect(onScrollEnd).not.toHaveBeenCalled();
  });

  it("does not attach scroll-end listener without onScrollEnd", () => {
    const { container } = renderRow({ onScrollEnd: undefined });
    mockMetrics(container, { scrollLeft: 1400 });
    fireEvent.scroll(getRowEl(container));
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("shows loading placeholders while loading", () => {
    const { container } = renderRow({ loading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBe(3);
  });

  it("moves focus right with ArrowRight and scrolls to keep visible", () => {
    const { container } = renderRow();
    mockMetrics(container);
    const rowEl = getRowEl(container);
    const cards = rowEl.querySelectorAll("[data-row-idx]");
    const scrollBy = vi.fn();
    rowEl.scrollBy = scrollBy;
    (cards[0] as HTMLElement).focus();
    // getBoundingClientRect: card 2 is off the right edge
    const orig = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this === cards[1]) {
          return { right: 900, left: 600, top: 0, bottom: 0 } as DOMRect;
        }
        if (this === rowEl) {
          return { right: 500, left: 0, top: 0, bottom: 0 } as DOMRect;
        }
        return orig.call(this);
      },
    );
    fireEvent.keyDown(rowEl, { key: "ArrowRight" });
    expect((cards[1] as HTMLElement).tabIndex).toBeDefined();
    expect(document.activeElement).toBe(cards[1]);
    expect(scrollBy).toHaveBeenCalled();
  });

  it("moves focus left with ArrowLeft clamped at the first card", () => {
    const { container } = renderRow();
    mockMetrics(container);
    const rowEl = getRowEl(container);
    const cards = rowEl.querySelectorAll("[data-row-idx]");
    (cards[1] as HTMLElement).focus();
    fireEvent.keyDown(rowEl, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cards[0]);
  });

  it("ignores non-arrow keys in the keyboard handler", () => {
    const { container } = renderRow();
    mockMetrics(container);
    const rowEl = getRowEl(container);
    const cards = rowEl.querySelectorAll("[data-row-idx]");
    (cards[1] as HTMLElement).focus();
    fireEvent.keyDown(rowEl, { key: "a" });
    expect(document.activeElement).toBe(cards[1]);
  });
});
