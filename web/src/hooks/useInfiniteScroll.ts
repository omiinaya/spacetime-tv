import { useState, useEffect, useRef, useCallback, type RefObject } from "react";

/**
 * Client-side infinite scroll — renders items in batches from an already-fetched array.
 * As the sentinel element enters the viewport, the next batch is revealed.
 */
export function useInfiniteScroll<T>(
  items: T[],
  batchSize = 40
): {
  visibleItems: T[];
  sentinelRef: RefObject<HTMLDivElement>;
  hasMore: boolean;
  reset: () => void;
} {
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const sentinelRef = useRef<HTMLDivElement>(null!);

  // Reset when the source array identity changes
  useEffect(() => {
    setVisibleCount(batchSize);
  }, [items]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Content scrolls inside <main> (not the viewport), so the sentinel
    // must be observed relative to that container. Default root=null
    // (viewport) never fires because the sentinel is clipped by main.
    const root = document.querySelector("main");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && visibleCount < items.length) {
          setVisibleCount((prev) =>
            Math.min(prev + batchSize, items.length)
          );
        }
      },
      { root, rootMargin: "300px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, items.length, batchSize]);

  const reset = useCallback(() => setVisibleCount(batchSize), [batchSize]);

  return {
    visibleItems: items.slice(0, visibleCount),
    sentinelRef,
    hasMore: visibleCount < items.length,
    reset,
  };
}
