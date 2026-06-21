import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Tv2,
  Loader2,
  AlertCircle,
  RotateCcw,
  Star,
  Play,
  ChevronDown,
} from "lucide-react";
import { api, Category, Series } from "@/lib/api";
import ContentRow from "@/components/ContentRow";
import { Skeleton } from "@/components/Skeleton";

const ROWS_PER_PAGE = 10;
const SERIES_PER_ROW = 20;

interface RowState {
  cat: Category;
  series: Series[];
  total: number;
  loading: boolean;
  loaded: boolean;
}

export default function SeriesPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());
  const [visibleRows, setVisibleRows] = useState(ROWS_PER_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef<Set<string>>(new Set());

  // Episodes state
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<any>(null);
  const [epLoading, setEpLoading] = useState(false);

  // Load categories
  useEffect(() => {
    api.series
      .categories()
      .then((d) => setCategories(d.categories))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Lazy-load more rows
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visibleRows >= categories.length) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisibleRows((v) => Math.min(v + ROWS_PER_PAGE, categories.length));
        }
      },
      { rootMargin: "400px" }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [visibleRows, categories.length]);

  const fetchRow = useCallback(async (cat: Category) => {
    const key = cat.category_id;
    if (fetchingRef.current.has(key)) return;
    fetchingRef.current.add(key);
    setRows((prev) => {
      const next = new Map(prev);
      next.set(key, {
        cat,
        series: prev.get(key)?.series || [],
        total: prev.get(key)?.total || 0,
        loading: true,
        loaded: prev.get(key)?.loaded || false,
      });
      return next;
    });
    try {
      const d = await api.series.list(key, SERIES_PER_ROW, 0);
      setRows((prev) => {
        const next = new Map(prev);
        next.set(key, { cat, series: d.series, total: d.total, loading: false, loaded: true });
        return next;
      });
    } catch {
      setRows((prev) => {
        const next = new Map(prev);
        const cur = prev.get(key);
        next.set(key, { cat, series: cur?.series || [], total: cur?.total || 0, loading: false, loaded: true });
        return next;
      });
    } finally {
      fetchingRef.current.delete(key);
    }
  }, []);

  const loadMore = useCallback(
    async (cat: Category) => {
      const key = cat.category_id;
      const current = rows.get(key);
      if (!current || fetchingRef.current.has(key)) return;
      if (current.series.length >= current.total) return;
      fetchingRef.current.add(key);
      try {
        const d = await api.series.list(key, SERIES_PER_ROW, current.series.length);
        setRows((prev) => {
          const next = new Map(prev);
          const existing = next.get(key)!;
          next.set(key, { ...existing, series: [...existing.series, ...d.series], total: d.total });
          return next;
        });
      } finally {
        fetchingRef.current.delete(key);
      }
    },
    [rows]
  );

  // Lazy-fetch visible rows
  const visibleCats = categories.slice(0, visibleRows);
  useEffect(() => {
    for (const cat of visibleCats) {
      const existing = rows.get(cat.category_id);
      if (!existing || (!existing.loaded && !existing.loading)) {
        fetchRow(cat);
      }
    }
  }, [visibleCats, rows, fetchRow]);

  // Episode toggle
  const toggleEpisodes = async (s: Series) => {
    if (expandedId === s.series_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(s.series_id);
    setEpLoading(true);
    try {
      const d = await api.series.details(s.series_id);
      setEpisodes(d.episodes || d.info?.episodes || {});
    } catch {
      setEpisodes(null);
    }
    setEpLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="w-24 h-5" />
            <Skeleton className="w-40 h-3.5" />
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="w-48 h-4" />
            <div className="flex gap-2">
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton key={j} className="w-[160px] aspect-[2/3] shrink-0 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const totalSeries = Array.from(rows.values()).reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Tv2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Series</h1>
          <p className="text-sm text-muted-foreground">
            {totalSeries > 0
              ? `${totalSeries.toLocaleString()} series · ${categories.length} categories`
              : `${categories.length} categories`}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
          <button
            onClick={() => { setError(null); window.location.reload(); }}
            className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Category rows */}
      <div className="space-y-6">
        {visibleCats.map((cat) => {
          const row = rows.get(cat.category_id);
          const seriesList = row?.series || [];
          const loadingRow = row?.loading && seriesList.length === 0;
          const hasMore = row ? row.series.length < row.total : true;

          if (!row || loadingRow) {
            return (
              <div key={cat.category_id} className="space-y-2">
                <div className="flex items-baseline gap-2 px-1">
                  <Skeleton className="w-40 h-4" />
                </div>
                <div className="flex gap-2 overflow-hidden">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <Skeleton key={j} className="w-[160px] aspect-[2/3] shrink-0 rounded" />
                  ))}
                </div>
              </div>
            );
          }

          return (
            <ContentRow
              key={cat.category_id}
              title={cat.category_name}
              itemCount={row.total}
              loading={row.loading && seriesList.length > 0}
              onScrollEnd={hasMore ? () => loadMore(cat) : undefined}
            >
              {seriesList.map((s) => {
                const isExpanded = expandedId === s.series_id;
                return (
                  <div
                    key={s.series_id}
                    className="shrink-0 w-[160px] bg-card rounded-lg border border-border overflow-hidden"
                  >
                    {/* Poster */}
                    <div className="aspect-[2/3] bg-muted relative overflow-hidden">
                      {s.cover ? (
                        <img
                          src={s.cover}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'><rect fill='%231a1a2e' width='2' height='3'/></svg>";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Tv2 className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* Play overlay on hover */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Play first episode if available, else just navigate
                            navigate(`/watch/series/${s.series_id}/1`);
                          }}
                          className="p-2 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Play className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-2">
                      <p className="text-[11px] font-medium line-clamp-2 leading-tight mb-1">
                        {s.name}
                      </p>
                      <div className="flex items-center gap-2 mb-1.5">
                        {s.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                            <span className="text-[10px] text-muted-foreground">{s.rating}</span>
                          </div>
                        )}
                        {s.releaseDate && (
                          <span className="text-[10px] text-muted-foreground/60">
                            {s.releaseDate.slice(0, 4)}
                          </span>
                        )}
                      </div>

                      {/* Episodes toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleEpisodes(s);
                        }}
                        className="w-full flex items-center justify-center gap-1 py-1 rounded bg-muted hover:bg-muted/80 text-[10px] text-muted-foreground transition-colors"
                      >
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                        Episodes
                      </button>

                      {/* Episode list */}
                      {isExpanded && (
                        <div className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                          {epLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto text-muted-foreground" />
                          ) : episodes ? (
                            Object.entries(episodes).map(([season, eps]: [string, any]) => (
                              <div key={season}>
                                <p className="text-[9px] text-muted-foreground/60 px-1 py-0.5">
                                  S{season}
                                </p>
                                {Array.isArray(eps) &&
                                  eps.slice(0, 6).map((ep: any) => (
                                    <button
                                      key={ep.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/watch/series/${s.series_id}/${ep.id}`);
                                      }}
                                      className="w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-muted text-left group/ep"
                                    >
                                      <Play className="h-2 w-2 text-primary opacity-0 group-hover/ep:opacity-100" />
                                      <span className="text-[10px] truncate">
                                        {ep.title || `Ep ${ep.episode_num || ""}`}
                                      </span>
                                    </button>
                                  ))}
                              </div>
                            ))
                          ) : (
                            <p className="text-[9px] text-muted-foreground/50 text-center py-1">
                              No episode data
                            </p>
                          )}
                        </div>
                      )}

                      {s.genre && (
                        <p className="text-[9px] text-muted-foreground/50 mt-1 line-clamp-1">
                          {s.genre}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </ContentRow>
          );
        })}
      </div>

      {/* Sentinel */}
      <div ref={sentinelRef} className="h-1" />
      {visibleRows < categories.length && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {categories.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv2 className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No categories available</p>
        </div>
      )}
    </div>
  );
}
