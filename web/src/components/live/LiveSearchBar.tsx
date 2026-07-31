import { Search, X, Star } from "lucide-react";

interface LiveSearchBarProps {
  searchQuery: string;
  allLoading: boolean;
  allStreamsLength: number;
  favoritesSize: number;
  favoritesOnly: boolean;
  onSearchChange: (q: string) => void;
  onToggleFavoritesOnly: () => void;
  onClearSearch: () => void;
}

export function LiveSearchBar({
  searchQuery,
  allLoading,
  allStreamsLength,
  favoritesSize,
  favoritesOnly,
  onSearchChange,
  onToggleFavoritesOnly,
  onClearSearch,
}: LiveSearchBarProps) {
  return (
    <div className="flex items-center gap-2 max-w-md">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={
            allLoading
              ? "Loading channels..."
              : `Search ${allStreamsLength.toLocaleString()} channels...`
          }
          disabled={allLoading}
          className="w-full h-9 sm:h-10 pl-9 pr-8 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all duration-200 disabled:opacity-50"
        />
        {searchQuery && (
          <button
            onClick={onClearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {favoritesSize > 0 && (
        <button
          onClick={onToggleFavoritesOnly}
          className={`shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors ${
            favoritesOnly
              ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          title={favoritesOnly ? "Show all channels" : "Show favorites only"}
          aria-label={
            favoritesOnly ? "Show all channels" : "Show favorites only"
          }
          aria-pressed={favoritesOnly}
        >
          <Star
            className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-yellow-400" : ""}`}
          />
          <span className="hidden sm:inline">Favorites</span>
          <span className="text-[10px] opacity-60">{favoritesSize}</span>
        </button>
      )}
    </div>
  );
}
