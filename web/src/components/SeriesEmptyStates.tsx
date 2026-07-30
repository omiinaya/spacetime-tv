import { Search, Tv2 } from "lucide-react";

interface SeriesEmptySearchStateProps {
  query: string;
  onClear: () => void;
}

export function SeriesEmptySearchState({
  query,
  onClear,
}: SeriesEmptySearchStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
      <p className="text-sm text-muted-foreground">
        No series matching &quot;{query}&quot;
      </p>
      <button
        onClick={onClear}
        className="mt-2 text-xs text-primary hover:underline"
      >
        Clear search
      </button>
    </div>
  );
}

export function SeriesFilterEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Tv2 className="h-10 w-10 text-muted-foreground/20 mb-3" />
      <p className="text-sm text-muted-foreground">
        No categories match your filters
      </p>
      <p className="text-xs text-muted-foreground/50 mt-1">
        Adjust your language or service settings to see more content
      </p>
    </div>
  );
}
