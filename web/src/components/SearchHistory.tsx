import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Clock } from "lucide-react";
import {
  getSearchHistory,
  addSearchHistory,
  clearSearchHistory,
} from "@/lib/searchHistory";

interface SearchHistoryProps {
  onSelect: (query: string) => void;
  /** Only show when input is focused and empty (or user clicked to see history) */
  show: boolean;
  onClose: () => void;
}

export function SearchHistory({ onSelect, show, onClose }: SearchHistoryProps) {
  const [history, setHistory] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Reload history whenever dropdown opens
  useEffect(() => {
    if (show) setHistory(getSearchHistory());
  }, [show]);

  // Close on outside click
  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [show, onClose]);

  const handleSelect = useCallback(
    (q: string) => {
      addSearchHistory(q); // move to top
      onSelect(q);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleClear = useCallback(() => {
    clearSearchHistory();
    setHistory([]);
  }, []);

  if (!show || history.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Recent Searches
        </span>
        <button
          onClick={handleClear}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {history.map((q, i) => (
          <button
            key={`${q}-${i}`}
            onClick={() => handleSelect(q)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors"
          >
            <Clock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <span className="truncate">{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Call after a user submits a search to save it to history */
export { addSearchHistory };
