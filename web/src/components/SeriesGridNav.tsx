import { Tv2, ArrowLeft } from "lucide-react";
import type { Series } from "@/lib/api";
import { Pagination } from "@/components/Pagination";
import { PosterCardSkeleton } from "@/components/Skeleton";
import SeriesCard from "@/components/SeriesCard";

interface SeriesGridNavProps {
  catId: string | null;
  catName: string;
  series: Series[];
  total: number;
  page: number;
  loading: boolean;
  pageSize: number;
  onBack: () => void;
  onPageChange: (page: number) => void;
  onSelectSeries: (s: Series) => void;
  onToggleWatchlist: (seriesId: number) => void;
}

export default function SeriesGridNav({
  catId,
  catName,
  series,
  total,
  page,
  loading,
  pageSize,
  onBack,
  onPageChange,
  onSelectSeries,
  onToggleWatchlist,
}: SeriesGridNavProps) {
  if (!catId) return null;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to categories
      </button>

      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Tv2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{catName}</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} series
          </p>
        </div>
      </div>

      {loading && series.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: pageSize }).map((_, i) => (
            <div key={i} className="shrink-0 w-[170px] sm:w-[185px]">
              <PosterCardSkeleton />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {series.map((s) => (
            <SeriesCard
              key={s.series_id}
              series={s}
              onSelect={onSelectSeries}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </div>
      )}

      {!loading && total > 0 && (
        <Pagination
          currentPage={page}
          totalPages={Math.max(1, Math.ceil(total / pageSize))}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
