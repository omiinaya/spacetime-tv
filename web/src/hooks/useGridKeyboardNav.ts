import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keyboard navigation for CSS-grid layouts.
 *
 * @param itemCount — total items in the grid
 * @param onSelect — called when Enter/Space is pressed on an item
 * @param containerRef — the grid container element (to compute columns)
 * @param enabled — disable when overlay/dialog is open
 * @returns [focusedIndex, keyDownHandler]
 *
 * Usage: attach the keyDownHandler to each grid cell.
 */
export function useGridKeyboardNav(
  itemCount: number,
  onSelect: (index: number) => void,
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled = true,
): [number, (e: React.KeyboardEvent, idx: number) => void] {
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const colsRef = useRef(6);

  // Determine actual column count from the grid container
  const computeCols = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const template = style.gridTemplateColumns;
    colsRef.current = template.split(/\s+/).length;
  }, [containerRef]);

  // Recompute on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    computeCols();
    const ro = new ResizeObserver(computeCols);
    ro.observe(el);
    return () => ro.disconnect();
  }, [computeCols, containerRef]);

  // Reset focus index when items change significantly
  useEffect(() => {
    setFocusedIdx(-1);
  }, [itemCount]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      if (!enabled) return;
      const cols = colsRef.current;
      if (cols < 1) return;

      let nextIdx = idx;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          nextIdx = Math.min(idx + 1, itemCount - 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          nextIdx = Math.max(idx - 1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          nextIdx = Math.min(idx + cols, itemCount - 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          nextIdx = Math.max(idx - cols, 0);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          onSelect(idx);
          return;
        default:
          return;
      }

      setFocusedIdx(nextIdx);
      // Focus the target element
      const grid = containerRef.current;
      if (grid) {
        const cards = grid.querySelectorAll<HTMLElement>("[data-grid-idx]");
        const target = cards[nextIdx];
        if (target) {
          target.focus();
          target.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    },
    [itemCount, onSelect, enabled, containerRef],
  );

  return [focusedIdx, handleKeyDown];
}

/**
 * Keyboard navigation for horizontal scrollable rows (ContentRow / Series).
 *
 * @param itemCount — total items in the row
 * @param onSelect — called when Enter/Space is pressed
 * @param rowRef — the scrollable container element
 * @param enabled — disable when overlay/dialog is open
 * @returns [focusedIndex, keyDownHandler]
 */
export function useRowKeyboardNav(
  itemCount: number,
  onSelect: (index: number) => void,
  rowRef: React.RefObject<HTMLDivElement | null>,
  enabled = true,
): [number, (e: React.KeyboardEvent, idx: number) => void] {
  const [focusedIdx, setFocusedIdx] = useState(-1);

  useEffect(() => {
    setFocusedIdx(-1);
  }, [itemCount]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      if (!enabled) return;
      let nextIdx = idx;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          nextIdx = Math.min(idx + 1, itemCount - 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          nextIdx = Math.max(idx - 1, 0);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          onSelect(idx);
          return;
        default:
          return;
      }

      setFocusedIdx(nextIdx);
      const row = rowRef.current;
      if (row) {
        const cards = row.querySelectorAll<HTMLElement>("[data-row-idx]");
        const target = cards[nextIdx];
        if (target) {
          target.focus();
          // Scroll the row to make the card visible
          const cardRect = target.getBoundingClientRect();
          const rowRect = row.getBoundingClientRect();
          if (cardRect.right > rowRect.right) {
            row.scrollBy({ left: cardRect.right - rowRect.right + 16, behavior: "smooth" });
          } else if (cardRect.left < rowRect.left) {
            row.scrollBy({ left: cardRect.left - rowRect.left - 16, behavior: "smooth" });
          }
        }
      }
    },
    [itemCount, onSelect, enabled, rowRef],
  );

  return [focusedIdx, handleKeyDown];
}
