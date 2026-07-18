import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ContentRowProps {
  title: string;
  itemCount?: number;
  children: React.ReactNode;
  onScrollEnd?: () => void; // fired when scrolled near the end
  loading?: boolean;
  action?: { label: string; onClick: () => void };
}

export default function ContentRow({
  title,
  itemCount,
  children,
  onScrollEnd,
  loading,
  action,
}: ContentRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateArrows = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => el.removeEventListener("scroll", updateArrows);
  }, [children, updateArrows]);

  // Fire onScrollEnd when near the end
  const handleScroll = useCallback(() => {
    updateArrows();
    const el = rowRef.current;
    if (!el || !onScrollEnd) return;
    const nearEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 200;
    if (nearEnd) onScrollEnd();
  }, [updateArrows, onScrollEnd]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || !onScrollEnd) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, onScrollEnd]);

  // Keyboard navigation: arrow keys move focus between [data-row-idx] cards
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      const cards = row.querySelectorAll<HTMLElement>("[data-row-idx]");
      if (cards.length === 0) return;

      // Find currently focused card
      let currentIdx = -1;
      for (let i = 0; i < cards.length; i++) {
        if (cards[i] === document.activeElement) {
          currentIdx = i;
          break;
        }
      }
      if (currentIdx === -1) return;

      e.preventDefault();
      let nextIdx = currentIdx;
      if (e.key === "ArrowRight") {
        nextIdx = Math.min(currentIdx + 1, cards.length - 1);
      } else {
        nextIdx = Math.max(currentIdx - 1, 0);
      }

      cards[nextIdx].focus();

      // Scroll to keep the card visible
      const cardRect = cards[nextIdx].getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      if (cardRect.right > rowRect.right) {
        row.scrollBy({
          left: cardRect.right - rowRect.right + 16,
          behavior: "smooth",
        });
      } else if (cardRect.left < rowRect.left) {
        row.scrollBy({
          left: cardRect.left - rowRect.left - 16,
          behavior: "smooth",
        });
      }
    };

    row.addEventListener("keydown", handleKeyDown);
    return () => row.removeEventListener("keydown", handleKeyDown);
  }, []);

  const scroll = (dir: "left" | "right") => {
    const el = rowRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <div className="group/row relative">
      {/* Row header */}
      <div className="flex items-baseline gap-2 mb-2 px-1">
        <h2 className="text-sm font-semibold text-foreground truncate">
          {title}
        </h2>
        {itemCount !== undefined && (
          <span className="text-[11px] text-muted-foreground shrink-0">
            {itemCount.toLocaleString()}
          </span>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="ml-auto text-[11px] font-medium text-muted-foreground/60 hover:text-primary transition-colors shrink-0"
          >
            {action.label}
          </button>
        )}
      </div>

      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-10 w-10 flex items-center justify-center
                     opacity-0 group-hover/row:opacity-100 pointer-events-none group-hover/row:pointer-events-auto transition-opacity
                     bg-gradient-to-r from-background/90 to-transparent"
        >
          <ChevronLeft className="h-5 w-5 text-white drop-shadow" />
        </button>
      )}

      {/* Scrollable row */}
      <div
        ref={rowRef}
        className="flex gap-2 overflow-x-auto scrollbar-none scroll-smooth pb-1 pr-4 md:pr-0"
        style={{ touchAction: "manipulation" }}
      >
        {children}

        {/* Loading indicator at end */}
        {loading && (
          <div className="flex items-center gap-2 shrink-0 px-2 min-w-[120px]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="w-[160px] aspect-[2/3] rounded bg-muted animate-pulse shrink-0"
              />
            ))}
          </div>
        )}
      </div>

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-10 w-10 flex items-center justify-center
                     opacity-0 group-hover/row:opacity-100 pointer-events-none group-hover/row:pointer-events-auto transition-opacity
                     bg-gradient-to-l from-background/90 to-transparent"
        >
          <ChevronRight className="h-5 w-5 text-white drop-shadow" />
        </button>
      )}
    </div>
  );
}
