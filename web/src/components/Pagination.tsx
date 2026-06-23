import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number; // 1-indexed
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const [jumpValue, setJumpValue] = useState("");

  const handleJump = useCallback(() => {
    const n = parseInt(jumpValue, 10);
    if (n >= 1 && n <= totalPages) {
      onPageChange(n);
      setJumpValue("");
    }
  }, [jumpValue, totalPages, onPageChange]);

  if (totalPages <= 1) return null;

  // Build visible page numbers: show first, last, and a window around current
  const pages: (number | "...")[] = [];
  const range = 2; // pages on each side of current
  const start = Math.max(2, currentPage - range);
  const end = Math.min(totalPages - 1, currentPage + range);

  pages.push(1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push("...");
  if (totalPages > 1) pages.push(totalPages);

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[36px] h-9 px-2 rounded-lg text-sm font-medium transition-colors ${
              p === currentPage
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors"
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Jump to page */}
      <div className="flex items-center gap-1 ml-4">
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJump()}
          placeholder={`1–${totalPages}`}
          className="w-16 h-9 px-2 rounded-lg border border-border bg-card text-sm text-center placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          aria-label="Jump to page"
        />
        <button
          onClick={handleJump}
          className="px-2 h-9 rounded-lg text-xs font-medium bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
        >
          Go
        </button>
      </div>
    </div>
  );
}
