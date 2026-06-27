import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router";
import {
  Tv2,
  Loader2,
  AlertCircle,
  RotateCcw,
  Star,
  Play,
  Search,
  X,
  Heart,
  TrendingUp,
  Check,
  ArrowLeft,
} from "lucide-react";
import { isSeriesInWatchlist, toggleSeriesWatchlist as toggleSeriesWl } from "@/lib/watchlist";
import { api, Category, Series, TmdbTvResult, imageUrl, tmdbImgProps } from "@/lib/api";
import ContentRow from "@/components/ContentRow";
import SeriesOverlay from "@/components/SeriesOverlay";
import { Pagination } from "@/components/Pagination";
import { Skeleton } from "@/components/Skeleton";
import { PosterCardSkeleton } from "@/components/Skeleton";
import { useSettings } from "@/context/SettingsContext";
import { filterCategories } from "@/lib/settings";
import {
  getContinueWatching,
  removeSeriesProgress,
  type SeriesProgress,
} from "@/lib/continueWatching";

const ROWS_PER_PAGE = 10;
const SERIES_PER_ROW = 20;
const SHOW_ALL_PAGE_SIZE = 50;

interface RowState {
  cat: Category;
  series: Series[];
  total: number;
  loading: boolean;
  loaded: boolean;
}

function useSeriesWatchlistToggle() {
  const [, setV] = useState(0);
  return useCallback((seriesId: number) => {
    toggleSeriesWl(seriesId);
    setV(v => v + 1);
  }, []);
}

export default function SeriesPage() {
  const navigate = useNavigate();
  const toggleSeriesWatchlist = useSeriesWatchlistToggle();

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
    () => loadCache("stv_series_cats", "categories") ?? []
  );
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());
  const [visibleRows, setVisibleRows] = useState(ROWS_PER_PAGE);
  const [loading, setLoading] = useState(() => !loadCache("stv_series_cats", "categories"));
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef<Set<string>>(new Set());

  // Section search (persisted in URL so Back button restores it)
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";
  const setSearchQuery = useCallback(
    (q: string) => { if (q) setSearchParams({ q }); else setSearchParams({}); },
    [setSearchParams]
  );

  // ── Trending (TMDB TV) ───────────────────────────────────────────
  const [trending, setTrending] = useState<TmdbTvResult[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingEnabled, setTrendingEnabled] = useState(false);

  // ── "Show All" mode ────────────────────────────────────────────
  const [showAllCatId, setShowAllCatId] = useState<string | null>(null);
  const [showAllCatName, setShowAllCatName] = useState("");
  const [showAllSeries, setShowAllSeries] = useState<Series[]>([]);
  const [showAllTotal, setShowAllTotal] = useState(0);
  const [showAllPage, setShowAllPage] = useState(1);
  const [showAllLoading, setShowAllLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    api.tmdb.tv.trending("week", 1).then((res) => {
      if (cancelled) return;
      setTrending(res.trending || []);
      setTrendingEnabled(res.enabled);
      setTrendingLoading(false);
    }).catch(() => {
      if (!cancelled) setTrendingLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Overlay state
  const [overlaySeries, setOverlaySeries] = useState<Series | null>(null);
  const location = useLocation();

  // Open series from search page (location.state) or URL param (?open=)
  useEffect(() => {
    const state = location.state as { openSeries?: Series } | null;
    if (state?.openSeries) {
      setOverlaySeries(state.openSeries);
      // Clear state so Back from overlay doesn't re-open it
      window.history.replaceState({}, document.title);
      return;
    }
    // Bookmarkable ?open=SERIES_ID — find in loaded rows or fetch details
    const openId = searchParams.get("open");
    if (openId) {
      const id = Number(openId);
      if (isNaN(id)) return;
      // Search loaded rows for the series
      for (const [, row] of rows) {
        const found = row.series.find((s) => s.series_id === id);
        if (found) { setOverlaySeries(found); return; }
      }
      // Not yet loaded — search endpoint can find it (use api.search)
      // Navigate without ?open= to prevent re-triggering
      setSearchParams({}, { replace: true });
    }
  }, [location.state, searchParams, rows, setSearchParams]);

  const { settings } = useSettings();

  // Filter categories by settings
  const filteredCatsBySettings = useMemo(
    () => filterCategories(categories, settings, false),
    [categories, settings]
  );

  // Load categories (with 15-min sessionStorage cache)
  useEffect(() => {
    const cached = sessionStorage.getItem("stv_series_cats");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.categories && Date.now() - parsed.ts < 900000) {
          setCategories(parsed.categories);
          setLoading(false);
        }
      } catch {}
    }
    api.series
      .categories()
      .then((d) => {
        setCategories(d.categories);
        sessionStorage.setItem("stv_series_cats", JSON.stringify({ categories: d.categories, ts: Date.now() }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Lazy-load more rows
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

  // ── "Show All" fetch + pagination ─────────────────────────────
  const fetchShowAll = useCallback(
    async (catId: string, page: number) => {
      setShowAllLoading(true);
      const offset = (page - 1) * SHOW_ALL_PAGE_SIZE;
      try {
        const d = await api.series.list(catId, SHOW_ALL_PAGE_SIZE, offset);
        setShowAllSeries(d.series);
        setShowAllTotal(d.total);
        setShowAllPage(page);
      } catch {
        // silent — empty state handles it
      } finally {
        setShowAllLoading(false);
      }
    },
    []
  );

  const openShowAll = useCallback(
    (cat: Category) => {
      setShowAllCatId(cat.category_id);
      setShowAllCatName(cat.category_name);
      fetchShowAll(cat.category_id, 1);
    },
    [fetchShowAll]
  );

  const closeShowAll = useCallback(() => {
    setShowAllCatId(null);
    setShowAllCatName("");
    setShowAllSeries([]);
    setShowAllTotal(0);
    setShowAllPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const goToShowAllPage = useCallback(
    (page: number) => {
      if (showAllCatId) {
        fetchShowAll(showAllCatId, page);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [showAllCatId, fetchShowAll]
  );

  // Lazy-fetch visible rows (after settings filter)
  const visibleCats = filteredCatsBySettings.slice(0, visibleRows);
  useEffect(() => {
    for (const cat of visibleCats) {
      const existing = rows.get(cat.category_id);
      if (!existing || (!existing.loaded && !existing.loading)) {
        fetchRow(cat);
      }
    }
  }, [visibleCats, rows, fetchRow]);

  // Filter by search query
  const q = searchQuery.toLowerCase().trim();
  const filteredCats = useMemo(() => {
    if (!q) return visibleCats;
    return visibleCats.filter((cat) => {
      const row = rows.get(cat.category_id);
      if (!row || !row.loaded) return true;
      if (cat.category_name.toLowerCase().includes(q)) return true;
      return row.series.some((s) => s.name.toLowerCase().includes(q));
    });
  }, [visibleCats, rows, q]);

  const filterSeries = useCallback(
    (list: Series[]) => {
      if (!q) return list;
      return list.filter((s) => s.name.toLowerCase().includes(q));
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
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className="shrink-0 w-[170px] sm:w-[185px]">
                  <PosterCardSkeleton />
                </div>
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
          <Tv2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Series</h1>
          <p className="text-sm text-muted-foreground">
            {filteredCatsBySettings.length > 0
              ? `${filteredCatsBySettings.length.toLocaleString()} categories`
              : ""}
          </p>
        </div>
      </div>

      {/* Continue Watching */}
      <ContinueWatchingRow navigate={navigate} />

      {/* Recently Completed */}
      <RecentlyCompletedRow navigate={navigate} />

      {/* Trending (TMDB TV proxy) */}
      {!trendingLoading && trendingEnabled && trending.length > 0 && (
        <div>
          <ContentRow title="Trending This Week" itemCount={trending.length}>
            {trending.map((t, idx) => {
              const posterUrl = t.poster_path
                ? `https://image.tmdb.org/t/p/w342${t.poster_path}`
                : "";
              const posterProps = t.poster_path ? tmdbImgProps(t.poster_path) : null;
              const year = t.first_air_date ? t.first_air_date.slice(0, 4) : "";
              return (
                <button
                  key={`trending-${t.id}`}
                  data-row-idx={idx}
                  className="shrink-0 w-[140px] group text-left focus:outline-none"
                  onClick={() => {
                    // Find the matching series by TMDB ID and open its overlay
                    for (const [, row] of rows) {
                      const match = row.series.find(
                        (s) => s.tmdb === String(t.id) || s.name.toLowerCase().includes(t.name.toLowerCase().slice(0, 20))
                      );
                      if (match) {
                        setOverlaySeries(match);
                        break;
                      }
                    }
                  }}
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-0 group-focus:ring-2 group-focus:ring-primary/60 group-focus:ring-offset-2 group-focus:ring-offset-background transition-all">
                    {posterProps ? (
                      <img
                        {...posterProps}
                        alt={`${t.name} poster`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                        <Tv2 className="h-8 w-8 text-white/10" />
                      </div>
                    )}
                    {/* Bottom gradient */}
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
                    {/* Rating badge */}
                    {t.vote_average > 0 && (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
                        <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                        {t.vote_average.toFixed(1)}
                      </div>
                    )}
                    {/* Year badge */}
                    {year && (
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
                        {year}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {t.name}
                  </p>
                  {year && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{year}</p>
                  )}
                </button>
              );
            })}
          </ContentRow>
        </div>
      )}

      {/* Section search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter series..."
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
            onClick={() => { setError(null); window.location.reload(); }}
            className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Filtered rows — or "Show All" grid view */}
      {showAllCatId ? (
        <div className="space-y-6">
          {/* Back button */}
          <button
            onClick={closeShowAll}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to categories
          </button>

          {/* Category header for show-all mode */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Tv2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{showAllCatName}</h2>
              <p className="text-sm text-muted-foreground">
                {showAllLoading
                  ? "Loading..."
                  : `${showAllTotal.toLocaleString()} series`}
              </p>
            </div>
          </div>

          {/* Loading skeleton */}
          {showAllLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {Array.from({ length: 18 }).map((_, i) => (
                <PosterCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!showAllLoading && showAllSeries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Tv2 className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No series in this category</p>
            </div>
          )}

          {/* Series grid */}
          {!showAllLoading && showAllSeries.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {showAllSeries.map((s, sIdx) => (
                <div
                  key={s.series_id}
                  onClick={() => setOverlaySeries(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOverlaySeries(s);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="group flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 text-left focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  {/* Poster */}
                  <div className="relative w-full aspect-[2/3] bg-muted overflow-hidden">
                    {s.cover ? (
                      <img
                        src={s.cover}
                        alt={s.name ? `${s.name} poster` : ""}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                        <Tv2 className="h-8 w-8 text-white/10" />
                      </div>
                    )}
                    {/* Bottom gradient for title readability */}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                    {/* Rating badge */}
                    {s.rating && (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
                        <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                        {parseFloat(s.rating).toFixed(1)}
                      </div>
                    )}
                    {/* Year badge */}
                    {s.releaseDate && (
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
                        {s.releaseDate.slice(0, 4)}
                      </div>
                    )}
                    {/* Watchlist heart */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSeriesWatchlist(s.series_id); }}
                      className="absolute bottom-2 right-2 p-1 rounded-full bg-black/60 backdrop-blur-sm opacity-70 hover:opacity-100 transition-opacity hover:scale-110"
                      aria-label={isSeriesInWatchlist(s.series_id) ? "Remove from watchlist" : "Add to watchlist"}
                    >
                      <Heart
                        className={`h-4 w-4 ${isSeriesInWatchlist(s.series_id) ? "fill-red-500 text-red-500" : "text-white/70"}`}
                      />
                    </button>
                  </div>
                  {/* Title */}
                  <div className="p-2.5 flex-1">
                    <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {s.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!showAllLoading && showAllTotal > 0 && (
            <Pagination
              currentPage={showAllPage}
              totalPages={Math.max(1, Math.ceil(showAllTotal / SHOW_ALL_PAGE_SIZE))}
              onPageChange={goToShowAllPage}
            />
          )}
        </div>
      ) : q && filteredCats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            No series matching "{searchQuery}"
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
            const seriesList = row?.series || [];
            const loadingRow = row?.loading && seriesList.length === 0;
            const hasMore = row ? row.series.length < row.total : true;
            const filtered = filterSeries(seriesList);

            if (!row || loadingRow) {
              return (
                <div key={cat.category_id} className="space-y-2">
                  <div className="flex items-baseline gap-2 px-1">
                    <Skeleton className="w-40 h-4" />
                  </div>
                  <div className="flex gap-2 overflow-hidden">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <div key={j} className="shrink-0 w-[170px] sm:w-[185px]">
                        <PosterCardSkeleton />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            if (q && filtered.length === 0 && !cat.category_name.toLowerCase().includes(q)) {
              return null;
            }

            return (
              <ContentRow
                key={cat.category_id}
                title={cat.category_name}
                itemCount={q ? filtered.length : row.total}
                loading={row.loading && seriesList.length > 0}
                onScrollEnd={q ? undefined : hasMore ? () => loadMore(cat) : undefined}
                action={
                  !q && row.total > SERIES_PER_ROW
                    ? { label: "Show All", onClick: () => openShowAll(cat) }
                    : undefined
                }
              >
                {filtered.map((s, sIdx) => (
                  <div
                    key={s.series_id}
                    data-row-idx={sIdx}
                    onClick={() => setOverlaySeries(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOverlaySeries(s);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="group shrink-0 w-[170px] sm:w-[185px] flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 text-left focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 cursor-pointer"
                  >
                    {/* Poster */}
                    <div className="relative w-full aspect-[2/3] bg-muted overflow-hidden">
                      {s.cover ? (
                        <img
                          src={s.cover}
                          alt={s.name ? `${s.name} poster` : ""}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                          <Tv2 className="h-8 w-8 text-white/10" />
                        </div>
                      )}
                      {/* Bottom gradient for title readability */}
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                      {/* Rating badge */}
                      {s.rating && (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-yellow-400 flex items-center gap-0.5">
                          <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                          {parseFloat(s.rating).toFixed(1)}
                        </div>
                      )}
                      {/* Year badge */}
                      {s.releaseDate && (
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
                          {s.releaseDate.slice(0, 4)}
                        </div>
                      )}
                      {/* Watchlist heart — always visible on mobile, brighter on hover */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSeriesWatchlist(s.series_id); }}
                        className="absolute bottom-2 right-2 p-1 rounded-full bg-black/60 backdrop-blur-sm opacity-70 hover:opacity-100 transition-opacity hover:scale-110"
                        aria-label={isSeriesInWatchlist(s.series_id) ? "Remove from watchlist" : "Add to watchlist"}
                      >
                        <Heart
                          className={`h-4 w-4 ${isSeriesInWatchlist(s.series_id) ? "fill-red-500 text-red-500" : "text-white/70"}`}
                        />
                      </button>
                    </div>
                    {/* Title */}
                    <div className="p-2.5 flex-1">
                      <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {s.name}
                      </p>
                    </div>
                  </div>
                ))}
              </ContentRow>
            );
          })}
        </div>
      )}

      {!showAllCatId && <div ref={sentinelRef} className="h-1" />}
      {!showAllCatId && !q && visibleRows < filteredCatsBySettings.length && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!showAllCatId && filteredCatsBySettings.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv2 className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No categories match your filters</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Adjust your language or service settings to see more content
          </p>
        </div>
      )}

      {/* Series overlay */}
      {overlaySeries && (
        <SeriesOverlay
          series={overlaySeries}
          onClose={() => setOverlaySeries(null)}
        />
      )}
    </div>
  );
}

function ContinueWatchingRow({ navigate }: { navigate: (path: string) => void }) {
  const [items, setItems] = useState<SeriesProgress[]>([]);

  useEffect(() => {
    setItems(getContinueWatching());
  }, []);

  // Only show items where progress < 90% (still in-progress)
  const inProgress = items.filter(
    (i) => i.durationSeconds <= 0 || i.progressSeconds / i.durationSeconds < 0.9
  );

  if (inProgress.length === 0) return null;

  // Enrich items with cached metadata from sessionStorage
  const enriched = inProgress.map((item) => {
    try {
      const raw = sessionStorage.getItem(`stv_series_meta_${item.seriesId}`);
      if (raw) {
        const meta = JSON.parse(raw);
        return {
          ...item,
          seriesName: item.seriesName || meta.name || `Series ${item.seriesId}`,
          cover: item.cover || meta.cover || "",
        };
      }
    } catch {}
    return {
      ...item,
      seriesName: item.seriesName || `Series ${item.seriesId}`,
    };
  });

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold px-1">Continue Watching</h2>
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1" style={{ touchAction: "manipulation" }}>
        {enriched.map((item) => (
          <div
            key={`${item.seriesId}-${item.seasonNumber}-${item.episodeNum}`}
            className="shrink-0 w-[280px] group relative"
          >
          <button
            onClick={() =>
              navigate(`/watch/series/${item.seriesId}/${item.episodeId}`)
            }
            className="w-full text-left"
            aria-label={`Continue ${item.seriesName}, ${item.episodeTitle}`}
          >
            <div className="relative aspect-video bg-[#141420] rounded-lg overflow-hidden mb-2">
              {item.cover ? (
                <img
                  src={imageUrl(item.cover)}
                  alt={item.seriesName ? `${item.seriesName} poster` : ""}
                  className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Play className="h-8 w-8 text-white/10" aria-hidden="true" />
                </div>
              )}
              {item.durationSeconds > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${Math.min(100, (item.progressSeconds / item.durationSeconds) * 100)}%`,
                    }}
                  />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="p-3 rounded-full bg-black/60">
                  <Play className="h-5 w-5 text-white fill-white" aria-hidden="true" />
                </div>
              </div>
            </div>
            <p className="text-xs font-medium text-white/80 line-clamp-1">
              {item.seriesName}
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              S{item.seasonNumber}E{item.episodeNum} · {item.episodeTitle}
              {item.progressSeconds > 0 &&
                ` · ${fmtTime(item.progressSeconds)} remaining`}
            </p>
          </button>
            {/* Dismiss button */}
            <button
              onClick={(e) => { e.stopPropagation(); removeSeriesProgress(item.seriesId); setItems(prev => prev.filter(i => !(i.seriesId === item.seriesId && i.seasonNumber === item.seasonNumber && i.episodeNum === item.episodeNum))); }}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 backdrop-blur-sm text-white/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[11px] z-10"
              aria-label="Remove from continue watching"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentlyCompletedRow({ navigate }: { navigate: (path: string) => void }) {
  const [items, setItems] = useState<SeriesProgress[]>([]);

  useEffect(() => {
    setItems(getContinueWatching());
  }, []);

  // Only show items where progress >= 90%
  const completed = items.filter(
    (i) => i.durationSeconds > 0 && i.progressSeconds / i.durationSeconds >= 0.9
  );

  if (completed.length === 0) return null;

  // Enrich with sessionStorage metadata
  const enriched = completed.map((item) => {
    try {
      const raw = sessionStorage.getItem(`stv_series_meta_${item.seriesId}`);
      if (raw) {
        const meta = JSON.parse(raw);
        return {
          ...item,
          seriesName: item.seriesName || meta.name || `Series ${item.seriesId}`,
          cover: item.cover || meta.cover || "",
        };
      }
    } catch {}
    return {
      ...item,
      seriesName: item.seriesName || `Series ${item.seriesId}`,
    };
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold px-1 flex items-center gap-2">
        <Check className="h-4 w-4 text-green-400" />
        Recently Completed
      </h2>
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1" style={{ touchAction: "manipulation" }}>
        {enriched.map((item) => (
          <div
            key={`done-${item.seriesId}-${item.seasonNumber}-${item.episodeNum}`}
            className="shrink-0 w-[280px] group relative"
          >
          <button
            onClick={() =>
              navigate(`/watch/series/${item.seriesId}/${item.episodeId}`)
            }
            className="w-full text-left"
            aria-label={`Revisit ${item.seriesName}, ${item.episodeTitle}`}
          >
            <div className="relative aspect-video bg-[#141420] rounded-lg overflow-hidden mb-2 ring-1 ring-green-500/20 group-hover:ring-green-500/40 transition-all">
              {item.cover ? (
                <img
                  src={imageUrl(item.cover)}
                  alt={item.seriesName ? `${item.seriesName} poster` : ""}
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Play className="h-8 w-8 text-white/10" aria-hidden="true" />
                </div>
              )}
              {/* Completed check overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="p-2 rounded-full bg-green-500/20 backdrop-blur-sm">
                  <Check className="h-6 w-6 text-green-400" />
                </div>
              </div>
              {/* Progress bar — full */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                <div className="h-full bg-green-500" style={{ width: "100%" }} />
              </div>
            </div>
            <p className="text-xs font-medium text-white/80 line-clamp-1">
              {item.seriesName}
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              S{item.seasonNumber}E{item.episodeNum} · {item.episodeTitle} · Done
            </p>
          </button>
            {/* Dismiss button */}
            <button
              onClick={(e) => { e.stopPropagation(); removeSeriesProgress(item.seriesId); setItems(prev => prev.filter(i => !(i.seriesId === item.seriesId && i.seasonNumber === item.seasonNumber && i.episodeNum === item.episodeNum))); }}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 backdrop-blur-sm text-white/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[11px] z-10"
              aria-label="Remove from recently completed"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
