import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Film, Loader2, AlertCircle, RotateCcw, Star, Play } from "lucide-react";
import { api, Category, Movie } from "@/lib/api";
import ContentRow from "@/components/ContentRow";
import { Skeleton } from "@/components/Skeleton";

const ROWS_PER_PAGE = 12; // categories shown at a time
const MOVIES_PER_ROW = 20; // initial movies per row

interface RowState {
  cat: Category;
  movies: Movie[];
  total: number;
  loading: boolean;
  loaded: boolean; // true once first fetch done
}

export default function Movies() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());
  const [visibleRows, setVisibleRows] = useState(ROWS_PER_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef<Set<string>>(new Set());

  // Load categories
  useEffect(() => {
    api.movies
      .categories()
      .then((d) => {
        setCategories(d.categories);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Lazy-load more category rows as you scroll down
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

  // Fetch movies for a category row
  const fetchRow = useCallback(
    async (cat: Category) => {
      const key = cat.category_id;
      if (fetchingRef.current.has(key)) return;
      fetchingRef.current.add(key);
      setRows((prev) => {
        const next = new Map(prev);
        next.set(key, {
          cat,
          movies: prev.get(key)?.movies || [],
          total: prev.get(key)?.total || 0,
          loading: true,
          loaded: prev.get(key)?.loaded || false,
        });
        return next;
      });
      try {
        const d = await api.movies.list(key, MOVIES_PER_ROW, 0);
        setRows((prev) => {
          const next = new Map(prev);
          next.set(key, {
            cat,
            movies: d.movies,
            total: d.total,
            loading: false,
            loaded: true,
          });
          return next;
        });
      } catch {
        setRows((prev) => {
          const next = new Map(prev);
          next.set(key, {
            cat,
            movies: prev.get(key)?.movies || [],
            total: prev.get(key)?.total || 0,
            loading: false,
            loaded: true,
          });
          return next;
        });
      } finally {
        fetchingRef.current.delete(key);
      }
    },
    []
  );

  // Load more movies for a row (scroll-right pagination)
  const loadMore = useCallback(
    async (cat: Category) => {
      const key = cat.category_id;
      const current = rows.get(key);
      if (!current || fetchingRef.current.has(key)) return;
      if (current.movies.length >= current.total) return; // all loaded
      fetchingRef.current.add(key);
      try {
        const d = await api.movies.list(key, MOVIES_PER_ROW, current.movies.length);
        setRows((prev) => {
          const next = new Map(prev);
          const existing = next.get(key)!;
          next.set(key, {
            ...existing,
            movies: [...existing.movies, ...d.movies],
            total: d.total,
          });
          return next;
        });
      } finally {
        fetchingRef.current.delete(key);
      }
    },
    [rows]
  );

  // Lazy-fetch rows as they become visible
  const visibleCats = categories.slice(0, visibleRows);
  useEffect(() => {
    for (const cat of visibleCats) {
      const existing = rows.get(cat.category_id);
      if (!existing || (!existing.loaded && !existing.loading)) {
        fetchRow(cat);
      }
    }
  }, [visibleCats, rows, fetchRow]);

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
              {Array.from({ length: 8 }).map((_, j) => (
                <Skeleton key={j} className="w-[160px] aspect-[2/3] shrink-0 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const totalMovies = Array.from(rows.values()).reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Film className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Movies</h1>
          <p className="text-sm text-muted-foreground">
            {totalMovies > 0
              ? `${totalMovies.toLocaleString()} movies · ${categories.length} categories`
              : `${categories.length} categories`}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
          <button
            onClick={() => {
              setError(null);
              window.location.reload();
            }}
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
          const movies = row?.movies || [];
          const loadingRow = row?.loading && movies.length === 0;
          const hasMore = row ? row.movies.length < row.total : true;

          // Show skeleton for rows that haven't loaded yet
          if (!row || loadingRow) {
            return (
              <div key={cat.category_id} className="space-y-2">
                <div className="flex items-baseline gap-2 px-1">
                  <Skeleton className="w-40 h-4" />
                </div>
                <div className="flex gap-2 overflow-hidden">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <Skeleton
                      key={j}
                      className="w-[160px] aspect-[2/3] shrink-0 rounded"
                    />
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
              loading={row.loading && movies.length > 0}
              onScrollEnd={hasMore ? () => loadMore(cat) : undefined}
            >
              {movies.map((m) => (
                <button
                  key={m.stream_id}
                  onClick={() => navigate(`/watch/movie/${m.stream_id}`)}
                  className="group shrink-0 w-[160px] bg-card rounded-lg border border-border overflow-hidden hover:border-primary/30 transition-all"
                >
                  <div className="aspect-[2/3] bg-muted relative overflow-hidden">
                    {m.stream_icon ? (
                      <img
                        src={m.stream_icon}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'><rect fill='%231a1a2e' width='2' height='3'/></svg>";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Play className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-medium line-clamp-2 leading-tight mb-1">
                      {m.name}
                    </p>
                    {m.rating && (
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                        <span className="text-[10px] text-muted-foreground">
                          {m.rating}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </ContentRow>
          );
        })}
      </div>

      {/* Sentinel for infinite scroll of categories */}
      <div ref={sentinelRef} className="h-1" />
      {visibleRows < categories.length && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {categories.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Film className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No categories available</p>
        </div>
      )}
    </div>
  );
}
