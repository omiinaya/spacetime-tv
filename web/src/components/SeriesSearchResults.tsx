import { useNavigate } from "react-router";
import { Tv2, Loader2, ChevronDown, Star } from "lucide-react";
import type { Series, TmdbEnrichData } from "@/lib/types";
import { tmdbImageUrl, tmdbSrcset } from "@/lib/api";

interface SeriesSearchResultsProps {
  series: Series[];
  enrichData?: Record<string, TmdbEnrichData> | null;
  totalCount: number;
  loadingMore: boolean;
  onLoadMore: () => void;
  showLoadMore: boolean;
}

export default function SeriesSearchResults({
  series,
  enrichData,
  totalCount,
  loadingMore,
  onLoadMore,
  showLoadMore,
}: SeriesSearchResultsProps) {
  const navigate = useNavigate();

  if (series.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Tv2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Series ({series.length})</h2>
      </div>
      <div className="poster-grid">
        {series.map((s) => {
          const enr = enrichData?.[String(s.series_id)];
          const posterSrc = enr?.poster
            ? tmdbImageUrl(enr.poster)
            : s.cover || null;
          const posterSrcset = enr?.poster ? tmdbSrcset(enr.poster) : undefined;
          const tmdbRating = enr?.rating ? (enr.rating / 2).toFixed(1) : null;
          return (
            <button
              key={s.series_id}
              onClick={() => navigate("/series", { state: { openSeries: s } })}
              className="group bg-card rounded-lg border border-border overflow-hidden hover:border-primary/30 transition-all text-left"
            >
              <div className="aspect-[2/3] bg-muted relative">
                {posterSrc ? (
                  <img
                    src={posterSrc}
                    srcSet={posterSrcset}
                    sizes={
                      posterSrcset
                        ? "(max-width: 640px) 342px, 500px"
                        : undefined
                    }
                    alt={s.name ? `${s.name} poster` : ""}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Tv2 className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                {tmdbRating && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-medium text-yellow-400">
                    <Star className="h-2.5 w-2.5 fill-yellow-400" />
                    {tmdbRating}
                  </div>
                )}
              </div>
              <div className="p-2.5 space-y-1">
                <p className="text-xs font-medium line-clamp-2 leading-tight">
                  {s.name}
                </p>
                {enr?.genres && enr.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {enr.genres.slice(0, 2).map((g) => (
                      <span
                        key={g}
                        className="px-1.5 py-0.5 rounded bg-primary/10 text-[10px] text-primary/80 leading-tight"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {showLoadMore && totalCount > series.length && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Load more series ({series.length} of {totalCount})
          </button>
        </div>
      )}
    </section>
  );
}
