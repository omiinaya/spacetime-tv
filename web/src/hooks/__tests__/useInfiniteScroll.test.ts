import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInfiniteScroll } from "../useInfiniteScroll";

describe("useInfiniteScroll", () => {
  const allItems = Array.from({ length: 100 }, (_, i) => `item-${i}`);

  beforeEach(() => {
    // Create a <main> element for the IntersectionObserver root
    const main = document.createElement("main");
    document.body.appendChild(main);
  });

  afterEach(() => {
    document.body.innerHTML = "";
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
});
