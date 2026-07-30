import type { Category } from "@/lib/types";
import { TabSkeleton } from "@/components/Skeleton";

const ALL_CAT = "__all__";

interface CategoryTabsProps {
  categories: Category[];
  activeCat: string;
  loading: boolean;
  onSelect: (catId: string) => void;
}

export function CategoryTabs({
  categories,
  activeCat,
  loading,
  onSelect,
}: CategoryTabsProps) {
  if (loading) {
    return (
      <div className="flex gap-1.5 pb-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <TabSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin relative"
      style={{
        touchAction: "manipulation",
        WebkitMaskImage:
          "linear-gradient(to right, black calc(100% - 48px), transparent 100%)",
        maskImage:
          "linear-gradient(to right, black calc(100% - 48px), transparent 100%)",
      }}
    >
      <button
        onClick={() => onSelect(ALL_CAT)}
        className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          activeCat === ALL_CAT
            ? "bg-primary/15 text-primary border border-primary/20"
            : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.category_id}
          onClick={() => onSelect(cat.category_id)}
          className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeCat === cat.category_id
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
          }`}
        >
          {cat.category_name}
        </button>
      ))}
    </div>
  );
}
