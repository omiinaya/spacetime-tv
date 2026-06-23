import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Film,
  Loader2,
  AlertCircle,
  RotateCcw,
  Star,
  Play,
  Search,
  X,
} from "lucide-react";
import { api, Category, Movie } from "@/lib/api";
import ContentRow from "@/components/ContentRow";
import MovieOverlay from "@/components/MovieOverlay";
import { Skeleton } from "@/components/Skeleton";
import { useSettings } from "@/context/SettingsContext";
import { filterCategories } from "@/lib/settings";

const ROWS_PER_PAGE = 12;
const MOVIES_PER_ROW = 20;

interface RowState {
  cat: Category;
  movies: Movie[];
  total: number;
  loading: boolean;
  loaded: boolean;
}

export default function Movies() {
  const navigate = useNavigate();

  // ── Cache helper ───────────────────────────────────────────────
  const loadCache = <T,>(key: string, field: string, ttl = 900000): T | null => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed[field] && Date.now() - parsed.ts < ttl) return parsed[field];
    } catch {}
    return null;
  };

  const [categories, setCategories] = useState<Category[]>(
    () => loadCache("stv_movies_cats", "categories") ?? []
  );
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());
  const [visibleRows, setVisibleRows] = useState(ROWS_PER_PAGE);
  const [loading, setLoading] = useState(() => !loadCache("stv_movies_cats", "categories"));
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef<Set<string>>(new Set());

  const { settings } = useSettings();

  // Filter categories by settings
  const filteredCatsBySettings = useMemo(
    () => filterCategories(categories, settings, false),
    [categories, settings]
  );

  // Section search (persisted in URL so Back button restores it)
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";
  const setSearchQuery = useCallback(
    (q: string) => {
      if (q) setSearchParams({ q });
      else setSearchParams({});
    },
    [setSearchParams]
  );

  // Overlay state
  const [overlayMovie, setOverlayMovie] = useState<Movie | null>(null);

  // Load categories (with 15-min sessionStorage cache)
  useEffect(() => {
    const cached = sessionStorage.getItem("stv_movies_cats");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.categories && Date.now() - parsed.ts < 900000) {
          setCategories(parsed.categories);
          setLoading(false);
        }
      } catch {}
    }
    api.movies
      .categories()
      .then((d) => {
        setCategories(d.categories);
        sessionStorage.setItem("stv_movies_cats", JSON.stringify({ categories: d.categories, ts: Date.now() }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Lazy-load more category rows as you scroll down
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visibleRows >= filteredCatsBySettings.length) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisibleRows((v) => Math.min(v + ROWS_PER_PAGE, filteredCatsBySettings.length));
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
      if (current.movies.length >= current.total) return;
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

  // Lazy-fetch rows as they become visible (after settings filter)
  const visibleCats = filteredCatsBySettings.slice(0, visibleRows);
  useEffect(() => {
    for (const cat of visibleCats) {
      const existing = rows.get(cat.category_id);
      if (!existing || (!existing.loaded && !existing.loading)) {
        fetchRow(cat);
      }
    }
  }, [visibleCats, rows, fetchRow]);

  // Filter categories+movies by search query
  const q = searchQuery.toLowerCase().trim();
  const filteredCats = useMemo(() => {
    if (!q) return visibleCats;
    return visibleCats.filter((cat) => {
      const row = rows.get(cat.category_id);
      // If row hasn't loaded yet, show it (user might be searching within it)
      if (!row || !row.loaded) return true;
      // Check if category name matches
      if (cat.category_name.toLowerCase().includes(q)) return true;
      // Check if any movie in the row matches
      return row.movies.some((m) => m.name.toLowerCase().includes(q));
    });
  }, [visibleCats, rows, q]);

  // Filter movies within a row
  const filterMovies = useCallback(
    (movies: Movie[]) => {
      if (!q) return movies;
      return movies.filter((m) => m.name.toLowerCase().includes(q));
    },
    [q]
  );

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


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Film className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Movies</h1>
          <p className="text-sm text-muted-foreground">
            {filteredCatsBySettings.length > 0
              ? `${filteredCatsBySettings.length.toLocaleString()} categories`
              : ""}
          </p>
        </div>
      </div>

      {/* Section search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter movies..."
          className="w-full h-9 pl-9 pr-8 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
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

      {/* Filtered rows */}
      {q && filteredCats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            No movies matching "{searchQuery}"
          </p>
          <button
            onClick={() => setSearchQuery("")}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredCats.map((cat) => {
            const row = rows.get(cat.category_id);
            const movies = row?.movies || [];
            const loadingRow = row?.loading && movies.length === 0;
            const hasMore = row ? row.movies.length < row.total : true;
            const filtered = filterMovies(movies);

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

            // If filtering and no matches in this row, skip it
            if (q && filtered.length === 0 && !cat.category_name.toLowerCase().includes(q)) {
              return null;
            }

            return (
              <ContentRow
                key={cat.category_id}
                title={cat.category_name}
                itemCount={q ? filtered.length : row.total}
                loading={row.loading && movies.length > 0}
                onScrollEnd={q ? undefined : hasMore ? () => loadMore(cat) : undefined}
              >
                {filtered.map((m) => (
                  <button
                    key={m.stream_id}
                    onClick={() => setOverlayMovie(m)}
                    className="group shrink-0 w-[170px] sm:w-[185px] flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 text-left"
                  >
                    {/* Poster */}
                    <div className="relative w-full aspect-[2/3] bg-muted overflow-hidden">
                      {m.stream_icon ? (
                        <img
                          src={m.stream_icon}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                          <Film className="h-8 w-8 text-white/10" />
                        </div>
                      )}
                      {/* Bottom gradient for title readability */}
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                      {/* Play button on hover */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                        <div className="p-3 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                          <Play className="h-5 w-5 fill-white" />
                        </div>
                      </div>
                      {/* Rating badge */}
                      {m.rating && (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
                          <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                          {m.rating}
                        </div>
                      )}
                      {/* Format badge */}
                      {m.container_extension && (
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/60">
                          {m.container_extension.toUpperCase()}
                        </div>
                      )}
                    </div>
                    {/* Title */}
                    <div className="p-2.5 flex-1">
                      <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {m.name}
                      </p>
                    </div>
                  </button>
                ))}
              </ContentRow>
            );
          })}
        </div>
      )}

      {/* Sentinel for infinite scroll of categories */}
      <div ref={sentinelRef} className="h-1" />
      {!q && visibleRows < filteredCatsBySettings.length && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {filteredCatsBySettings.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Film className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No categories match your filters</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Adjust your language or service settings to see more content
          </p>
        </div>
      )}

      {/* Movie overlay */}
      {overlayMovie && (
        <MovieOverlay
          movie={overlayMovie}
          onClose={() => setOverlayMovie(null)}
        />
      )}
    </div>
  );
}
