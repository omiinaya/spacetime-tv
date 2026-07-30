import { Search } from "lucide-react";
import { fmtTime } from "@/pages/AdminDashboard";

interface RecentSearchesSectionProps {
  searches: { total: number; recent: { ts: number; query: string }[] };
}

export default function RecentSearchesSection({ searches }: RecentSearchesSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Search className="h-4 w-4 text-blue-400" />
        <h2 className="text-sm font-semibold">
          Recent Searches ({searches.total} total)
        </h2>
      </div>
      {searches.recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No search queries yet.</p>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
          {searches.recent.map((s, i) => (
            <div
              key={i}
              className="px-4 py-2 border-b border-border/30 last:border-0 text-xs flex items-center gap-2"
            >
              <span className="text-muted-foreground shrink-0 w-16">
                {fmtTime(s.ts)}
              </span>
              <span className="font-mono">"{s.query}"</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
