import { useState, useMemo } from "react";
import { EyeOff, Search, Check } from "lucide-react";

interface HiddenCategoriesSectionProps {
  categories: { id: string; name: string; type: string }[];
  hiddenIds: string[];
  onToggle: (id: string) => void;
}

export default function HiddenCategoriesSection({
  categories,
  hiddenIds,
  onToggle,
}: HiddenCategoriesSectionProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <EyeOff className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Hidden Categories</h2>
        {hiddenIds.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {hiddenIds.length} hidden
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Individually hide specific categories you never want to see.
      </p>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories..."
          className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No categories found
          </div>
        ) : (
          filtered.slice(0, 100).map((cat) => {
            const hidden = hiddenIds.includes(cat.id);
            return (
              <label
                key={`${cat.type}-${cat.id}`}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer"
              >
                <button
                  onClick={() => onToggle(cat.id)}
                  className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    hidden
                      ? "bg-destructive/20 border-destructive/30 text-destructive"
                      : "border-border text-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  {hidden && <Check className="h-2.5 w-2.5" />}
                </button>
                <span className="text-[10px] text-muted-foreground/60 w-14 shrink-0">
                  {cat.type}
                </span>
                <span
                  className={`text-[11px] truncate ${hidden ? "text-muted-foreground/40 line-through" : ""}`}
                >
                  {cat.name}
                </span>
              </label>
            );
          })
        )}
        {filtered.length > 100 && (
          <div className="p-2 text-center text-[10px] text-muted-foreground/50">
            Showing first 100 of {filtered.length}. Narrow your search.
          </div>
        )}
      </div>
    </section>
  );
}
