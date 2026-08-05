import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInfiniteScroll } from "../useInfiniteScroll";

/**
 * Minimal IntersectionObserver mock that records observers and lets tests
 * fire an "intersecting" callback. This is REQUIRED for the infinite-scroll
 * regression tests — without it, jsdom has no IO and the sentinel can't
 * trigger batch growth.
 */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observed: Element[] = [];

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((o) => o !== el);
  }
  disconnect() {
    this.observed = [];
  }
  takeRecords() {
    return [];
  }

  /** Simulate the sentinel entering the viewport (isIntersecting=true). */
  fire() {
    for (const el of this.observed) {
      const entry = {
        isIntersecting: true,
        target: el,
      } as IntersectionObserverEntry;
      this.callback([entry], this as unknown as IntersectionObserver);
    }
  }
}

describe("useInfiniteScroll", () => {
  const allItems = Array.from({ length: 100 }, (_, i) => `item-${i}`);

  beforeEach(() => {
    // Create a <main> element for the IntersectionObserver root
    const main = document.createElement("main");
    document.body.appendChild(main);
    // Install the IO mock (jsdom has no native IntersectionObserver)
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    MockIntersectionObserver.instances = [];
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("shows first batch of items initially", () => {
    const { result } = renderHook(() => useInfiniteScroll(allItems, 40));
    expect(result.current.visibleItems).toHaveLength(40);
    expect(result.current.visibleItems[0]).toBe("item-0");
    expect(result.current.visibleItems[39]).toBe("item-39");
  });

  it("hasMore is true when there are more items", () => {
    const { result } = renderHook(() => useInfiniteScroll(allItems, 40));
    expect(result.current.hasMore).toBe(true);
  });

  it("hasMore is false when all items visible", () => {
    const { result } = renderHook(() => useInfiniteScroll(allItems, 200));
    expect(result.current.hasMore).toBe(false);
  });

  it("hasMore is false for empty list", () => {
    const { result } = renderHook(() => useInfiniteScroll([], 40));
    expect(result.current.hasMore).toBe(false);
  });

  it("returns empty visibleItems for empty list", () => {
    const { result } = renderHook(() => useInfiniteScroll([], 40));
    expect(result.current.visibleItems).toEqual([]);
  });

  it("uses default batch size of 40", () => {
    const items = Array.from({ length: 50 }, (_, i) => `x-${i}`);
    const { result } = renderHook(() => useInfiniteScroll(items));
    expect(result.current.visibleItems).toHaveLength(40);
  });

  it("shows all items when batch size exceeds list length", () => {
    const { result } = renderHook(() => useInfiniteScroll(allItems, 200));
    expect(result.current.visibleItems).toHaveLength(100);
  });

  it("sentry ref is a RefObject", () => {
    const { result } = renderHook(() => useInfiniteScroll(allItems, 40));
    // ref exists as an object (current is null since no JSX attaches it in test)
    expect(result.current.sentinelRef).toHaveProperty("current");
  });

  it("reset returns to initial batch", () => {
    const { result } = renderHook(() => useInfiniteScroll(allItems, 40));
    expect(result.current.visibleItems).toHaveLength(40);
    act(() => {
      result.current.reset();
    });
    expect(result.current.visibleItems).toHaveLength(40);
  });

  it("updates when source items change", () => {
    const { result, rerender } = renderHook(
      ({ items }) => useInfiniteScroll(items, 30),
      { initialProps: { items: allItems } },
    );
    expect(result.current.visibleItems).toHaveLength(30);

    const smaller = allItems.slice(0, 10);
    rerender({ items: smaller });
    expect(result.current.visibleItems).toHaveLength(10);
    expect(result.current.hasMore).toBe(false);
  });

  it("initial batch size matches smaller list", () => {
    const { result } = renderHook(() => useInfiniteScroll(["only-one"], 40));
    expect(result.current.visibleItems).toEqual(["only-one"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("grows the batch when the sentinel intersects", () => {
    const { result, rerender } = renderHook(() =>
      useInfiniteScroll(allItems, 10),
    );

    // Wire the ref to a real element (renderHook can't render the ref div,
    // so simulate what React does: assign ref.current then re-render so the
    // observer effect picks up the fresh element).
    const sentinel = document.createElement("div");
    result.current.sentinelRef.current = sentinel;
    act(() => rerender());

    // Find the observer that observed our sentinel and fire it.
    const obs = MockIntersectionObserver.instances.find((o) =>
      o.observed.includes(sentinel),
    );
    expect(obs).toBeDefined();

    act(() => {
      obs!.fire();
    });
    expect(result.current.visibleItems).toHaveLength(20); // one batch grown

    act(() => {
      obs!.fire();
    });
    expect(result.current.visibleItems).toHaveLength(30); // grows again
  });

  it("REGRESSION: already-visible sentinel does NOT ratchet to full length (exploding tab)", () => {
    // The bug: LiveTV favorites-only renders a short filtered list while the
    // hook's source is the FULL catalogue (48k channels). The sentinel is
    // immediately in the viewport, so if the observer were re-created on every
    // visibleCount change it would fire repeatedly and ratchet to items.length.
    const big = Array.from({ length: 10000 }, (_, i) => `ch-${i}`);
    const { result, rerender } = renderHook(() => useInfiniteScroll(big, 50));

    const sentinel = document.createElement("div");
    result.current.sentinelRef.current = sentinel;
    act(() => rerender());

    // The observer that observed the sentinel must be STABLE across count
    // increments. With the old implementation every increment created a new
    // observer and immediately re-fired for an already-visible sentinel,
    // looping visibleCount to 10000. With the fix, one observer is created
    // and fired N times advances exactly N batches (no runaway).
    const obs = MockIntersectionObserver.instances.find((o) =>
      o.observed.includes(sentinel),
    );
    expect(obs).toBeDefined();
    const observerCountAfterMount = MockIntersectionObserver.instances.length;

    // Simulate the observer firing 5 times (viewport re-intersections).
    for (let i = 0; i < 5; i++) {
      act(() => obs!.fire());
    }

    // With a stable observer this advances exactly 5 batches (initial 50
    // + 5×50 = 300), NOT the full 10000. The old code would hit 10000 and
    // freeze the tab.
    expect(result.current.visibleItems).toHaveLength(300);
    expect(result.current.visibleItems).not.toHaveLength(10000);
    // No new observers were spawned by the count increments (the old code
    // re-created the observer on every setVisibleCount).
    expect(MockIntersectionObserver.instances.length).toBe(
      observerCountAfterMount,
    );
  });

  it("REGRESSION: observer is not re-created on every count increment", () => {
    const big = Array.from({ length: 1000 }, (_, i) => `ch-${i}`);
    const { result, rerender } = renderHook(() => useInfiniteScroll(big, 50));

    const sentinel = document.createElement("div");
    result.current.sentinelRef.current = sentinel;
    act(() => rerender());

    const obs = MockIntersectionObserver.instances.find((o) =>
      o.observed.includes(sentinel),
    );
    expect(obs).toBeDefined();

    // Grow the count (real state change), then reset — neither must spawn
    // a new observer, because the sentinel element never changed identity.
    const before = MockIntersectionObserver.instances.length;
    act(() => obs!.fire());
    act(() => result.current.reset());
    act(() => result.current.reset());

    expect(MockIntersectionObserver.instances.length).toBe(before);
  });
});
