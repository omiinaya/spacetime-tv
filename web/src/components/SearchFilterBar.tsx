import { ArrowUpDown, ArrowUpAZ, TrendingUp, Star } from "lucide-react";

type FilterTab = "all" | "live" | "movies" | "series" | "epg";
type SortBy = "relevance" | "name" | "rating";

interface SearchFilterBarProps {
  filter: FilterTab;
  sortBy: SortBy;
  onFilterChange: (tab: FilterTab) => void;
  onSortChange: (sort: SortBy) => void;
  total: number;
  liveCount: number;
  movieCount: number;
  seriesCount: number;
  epgCount: number;
}

export default function SearchFilterBar({
  filter,
  sortBy,
  onFilterChange,
  onSortChange,
  total,
  liveCount,
  movieCount,
  seriesCount,
  epgCount,
}: SearchFilterBarProps) {
  return (
    <>
      {/* Category filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin" style={{ touchAction: "manipulation" }}>
        {[
          { key: "all" as FilterTab, label: "All", count: total },
          { key: "live" as FilterTab, label: "Live", count: liveCount },
          { key: "movies" as FilterTab, label: "Movies", count: movieCount },
          { key: "series" as FilterTab, label: "Series", count: seriesCount },
          { key: "epg" as FilterTab, label: "EPG", count: epgCount },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => onFilterChange(tab.key)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === tab.key
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="text-[10px] opacity-60">{tab.count.toLocaleString()}</span>
            )}
          </button>
        ))}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground/60 font-medium flex items-center gap-1">
          <ArrowUpDown className="h-3 w-3" />
          Sort
        </span>
        <div className="flex gap-1">
          {[
            { key: "relevance" as SortBy, label: "Relevance", icon: TrendingUp },
            { key: "name" as SortBy, label: "Name A–Z", icon: ArrowUpAZ },
            { key: "rating" as SortBy, label: "Rating", icon: Star },
          ].map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                onClick={() => onSortChange(opt.key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                  sortBy === opt.key
                    ? "bg-primary/10 text-primary border border-primary/15"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                <Icon className="h-3 w-3" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
