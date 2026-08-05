import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from "react";

/**
 * Client-side infinite scroll — renders items in batches from an already-fetched array.
 * As the sentinel element enters the viewport, the next batch is revealed.
 *
 * IMPORTANT (regression 2026-08-05): the sentinel is ALWAYS observed, even when
 * the caller renders a short filtered list (e.g. LiveTV favorites-only mode with
 * `allStreams` as the source). If the IntersectionObserver were re-created on
 * every `visibleCount` change, an already-visible sentinel would immediately
 * re-fire the observer on each fresh observe(), creating a self-sustaining
 * loop that ratchets `visibleCount` up to `items.length` and freezes the tab
 * ("browser exploded" when toggling the Favorites star).
 *
 * Fix: the observer effect keys on the sentinel ELEMENT, not `visibleCount`.
 * React re-mounts the sentinel (new element identity) across loading states,
 * category switches and search toggles — that re-runs the effect and re-observes.
 * But a `visibleCount` increment re-renders WITHOUT re-mounting the sentinel
 * (same element identity), so the effect is NOT re-run and the observer is NOT
 * re-created. The callback reads the count/items through refs, so it always
 * sees current values despite the stable observer closure.
 */
export function useInfiniteScroll<T>(
  items: T[],
  batchSize = 40,
): {
  visibleItems: T[];
  sentinelRef: RefObject<HTMLDivElement>;
  hasMore: boolean;
  reset: () => void;
} {
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const sentinelRef = useRef<HTMLDivElement>(null!);

  // Always-valid snapshots for the observer callback (avoids stale closures).
  const visibleCountRef = useRef(visibleCount);
  visibleCountRef.current = visibleCount;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const batchSizeRef = useRef(batchSize);
  batchSizeRef.current = batchSize;

  // Reset when the source array identity changes.
  useEffect(() => {
    setVisibleCount(batchSize);
  }, [items]);

  // Read the CURRENT mounted element once per render. On `visibleCount`
  // increments the sentinel does NOT re-mount (same element), so this stays
  // stable and the effect below won't re-run. On loading/category/search
  // toggles the sentinel unmounts then remounts (new element identity), which
  // re-runs the effect and re-observes the fresh element.
  const sentinel = sentinelRef.current;

  // Observe the sentinel ONCE per mounted element. Never re-create it on
  // `visibleCount` — that was the exploding-tab bug.
  useEffect(() => {
    if (!sentinel) return;

    // Content scrolls inside <main> (not the viewport), so the sentinel
    // must be observed relative to that container. Default root=null
    // (viewport) never fires because the sentinel is clipped by main.
    const root = document.querySelector("main");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          visibleCountRef.current < itemsRef.current.length
        ) {
          const next = Math.min(
            visibleCountRef.current + batchSizeRef.current,
            itemsRef.current.length,
          );
          if (next !== visibleCountRef.current) setVisibleCount(next);
        }
      },
      { root, rootMargin: "300px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel]);

  const reset = useCallback(() => {
    setVisibleCount(batchSizeRef.current);
  }, []);

  return {
    visibleItems: items.slice(0, visibleCount),
    sentinelRef,
    hasMore: visibleCount < items.length,
    reset,
  };
}
