import { Search, Loader2 } from "lucide-react";
import { SearchHistory } from "@/components/SearchHistory";

interface SearchHeaderProps {
  query: string;
  loading: boolean;
  showHistory: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
  onFocus: () => void;
  onHistorySelect: (q: string) => void;
  onHistoryClose: () => void;
  resultCount?: number;
  totalCount?: number;
  activeFilter?: string;
}

export default function SearchHeader({
  query,
  loading,
  showHistory,
  onQueryChange,
  onSearch,
  onClear,
  onFocus,
  onHistorySelect,
  onHistoryClose,
  resultCount,
  totalCount,
  activeFilter,
}: SearchHeaderProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Search className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Search</h1>
          <p className="text-sm text-muted-foreground">
            {resultCount != null
              ? `${resultCount.toLocaleString()} result${resultCount !== 1 ? "s" : ""} · ${(totalCount ?? 0).toLocaleString()} total` +
                (activeFilter && activeFilter !== "all"
                  ? ` (${activeFilter})`
                  : "")
              : "Search across all live TV channels, movies, and series"}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          onFocus={onFocus}
          placeholder="Search channels, movies, series..."
          aria-label="Search"
          className="w-full h-10 pl-10 pr-20 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <SearchHistory
          show={showHistory}
          onClose={onHistoryClose}
          onSelect={onHistorySelect}
        />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button
              onClick={onClear}
              className="px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
          <button
            onClick={onSearch}
            disabled={loading || query.trim().length < 2}
            className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Search"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
