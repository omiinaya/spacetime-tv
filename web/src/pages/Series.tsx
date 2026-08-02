import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { toggleSeriesWatchlist as toggleSeriesWl } from "@/lib/watchlist";
import { api } from "@/lib/api";
import { Category, Series } from "@/lib/types";
import ContentRow from "@/components/ContentRow";
import SeriesOverlay from "@/components/SeriesOverlay";
import SeriesWatchingSection from "@/components/SeriesWatchingSection";
import SeriesGridNav from "@/components/SeriesGridNav";
import SeriesCard from "@/components/SeriesCard";
import TrendingSeriesRow from "@/components/TrendingSeriesRow";
import SeriesSearchInput from "@/components/SeriesSearchInput";
import SeriesHeader from "@/components/SeriesHeader";
import SeriesPageSkeleton from "@/components/SeriesPageSkeleton";
import SeriesRowSkeleton from "@/components/SeriesRowSkeleton";
import ErrorBanner from "@/components/ErrorBanner";
import {
  SeriesEmptySearchState,
  SeriesFilterEmptyState,
} from "@/components/SeriesEmptyStates";
import { useSettings } from "@/context/SettingsContext";
import { filterCategories } from "@/lib/settings";

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
    setV((v) => v + 1);
  }, []);
}

export default function SeriesPage() {
  const navigate = useNavigate();
  const toggleSeriesWatchlist = useSeriesWatchlistToggle();

  // Cache helper
  const loadCache = <T,>(
    key: string,
    field: string,
    ttl = 900000,
  ): T | null => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed[field] && Date.now() - parsed.ts < ttl) return parsed[field];
    } catch {}
    return null;
  };

  const [categories, setCategories] = useState<Category[]>(
    () => loadCache("stv_series_cats", "categories") ?? [],
  );
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());
  const [visibleRows, setVisibleRows] = useState(ROWS_PER_PAGE);
  const [loading, setLoading] = useState(
    () => !loadCache("stv_series_cats", "categories"),
  );
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef<Set<string>>(new Set());

  // Search (URL-persisted)
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";
  const setSearchQuery = useCallback(
    (q: string) => {
      if (q) setSearchParams({ q });
      else setSearchParams({});
    },
    [setSearchParams],
  );

  // Show All mode
  const [showAllCatId, setShowAllCatId] = useState<string | null>(null);
  const [showAllCatName, setShowAllCatName] = useState("");
  const [showAllSeries, setShowAllSeries] = useState<Series[]>([]);
  const [showAllTotal, setShowAllTotal] = useState(0);
  const [showAllPage, setShowAllPage] = useState(1);
  const [showAllLoading, setShowAllLoading] = useState(false);

  // Overlay
  const [overlaySeries, setOverlaySeries] = useState<Series | null>(null);
  const location = useLocation();

  // Open series from search page (location.state) or URL param (?open=)
  useEffect(() => {
    const state = location.state as { openSeries?: Series } | null;
    if (state?.openSeries) {
      setOverlaySeries(state.openSeries);
      window.history.replaceState({}, document.title);
      return;
    }
    const openId = searchParams.get("open");
    if (openId) {
      const id = Number(openId);
      if (isNaN(id)) return;
      for (const [, row] of rows) {
        const found = row.series.find((s) => s.series_id === id);
        if (found) {
          setOverlaySeries(found);
          return;
        }
      }
      setSearchParams({}, { replace: true });
    }
  }, [location.state, searchParams, rows, setSearchParams]);

  const { settings, adultUnlocked } = useSettings();

  const filteredCatsBySettings = useMemo(
    () => filterCategories(categories, settings, false, adultUnlocked),
    [categories, settings, adultUnlocked],
  );

  // Load categories (15-min cache)
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
        sessionStorage.setItem(
          "stv_series_cats",
          JSON.stringify({ categories: d.categories, ts: Date.now() }),
        );
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
          setVisibleRows((v) =>
            Math.min(v + ROWS_PER_PAGE, filteredCatsBySettings.length),
          );
        }
      },
      { rootMargin: "400px" },
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
        next.set(key, {
          cat,
          series: d.series,
          total: d.total,
          loading: false,
          loaded: true,
        });
        return next;
      });
    } catch {
      setRows((prev) => {
        const next = new Map(prev);
        const cur = prev.get(key);
        next.set(key, {
          cat,
          series: cur?.series || [],
          total: cur?.total || 0,
          loading: false,
          loaded: true,
        });
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
        const d = await api.series.list(
          key,
          SERIES_PER_ROW,
          current.series.length,
        );
        setRows((prev) => {
          const next = new Map(prev);
          const existing = next.get(key)!;
          next.set(key, {
            ...existing,
            series: [...existing.series, ...d.series],
            total: d.total,
          });
          return next;
        });
      } finally {
        fetchingRef.current.delete(key);
      }
    },
    [rows],
  );

  // Show All fetch + pagination
  const fetchShowAll = useCallback(async (catId: string, page: number) => {
    setShowAllLoading(true);
    const offset = (page - 1) * SHOW_ALL_PAGE_SIZE;
    try {
      const d = await api.series.list(catId, SHOW_ALL_PAGE_SIZE, offset);
      setShowAllSeries(d.series);
      setShowAllTotal(d.total);
      setShowAllPage(page);
    } catch {
    } finally {
      setShowAllLoading(false);
    }
  }, []);

  const openShowAll = useCallback(
    (cat: Category) => {
      setShowAllCatId(cat.category_id);
      setShowAllCatName(cat.category_name);
      fetchShowAll(cat.category_id, 1);
    },
    [fetchShowAll],
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
    [showAllCatId, fetchShowAll],
  );

  // Lazy-fetch visible rows. Memoized: a fresh .slice() identity every render
  // made this array an unstable effect dep, re-running the fetch effect and
  // re-evaluating filteredCats (with per-row .some() over series) on every
  // render — including watchlist-triggered re-renders.
  const visibleCats = useMemo(
    () => filteredCatsBySettings.slice(0, visibleRows),
    [filteredCatsBySettings, visibleRows],
  );
  useEffect(() => {
    for (const cat of visibleCats) {
      const existing = rows.get(cat.category_id);
      if (!existing || (!existing.loaded && !existing.loading)) {
        fetchRow(cat);
      }
    }
  }, [visibleCats, rows, fetchRow]);

  // Row filtering by search query
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
    [q],
  );

  if (loading) return <SeriesPageSkeleton />;

  return (
    <div className="space-y-8 sm:space-y-12">
      <SeriesHeader categoryCount={filteredCatsBySettings.length} />
      <SeriesWatchingSection navigate={navigate} />
      <TrendingSeriesRow />
      <SeriesSearchInput value={searchQuery} onChange={setSearchQuery} />

      {error && (
        <ErrorBanner
          message={error}
          onRetry={() => {
            setError(null);
            window.location.reload();
          }}
        />
      )}

      {/* Rows or Show All grid */}
      {showAllCatId ? (
        <SeriesGridNav
          catId={showAllCatId}
          catName={showAllCatName}
          series={showAllSeries}
          total={showAllTotal}
          page={showAllPage}
          loading={showAllLoading}
          pageSize={SHOW_ALL_PAGE_SIZE}
          onBack={closeShowAll}
          onPageChange={goToShowAllPage}
          onSelectSeries={(s) => setOverlaySeries(s)}
          onToggleWatchlist={toggleSeriesWatchlist}
        />
      ) : q && filteredCats.length === 0 ? (
        <SeriesEmptySearchState
          query={searchQuery}
          onClear={() => setSearchQuery("")}
        />
      ) : (
        <div className="space-y-6">
          {filteredCats.map((cat) => {
            const row = rows.get(cat.category_id);
            const seriesList = row?.series || [];
            const loadingRow = row?.loading && seriesList.length === 0;
            const hasMore = row ? row.series.length < row.total : true;
            const filtered = filterSeries(seriesList);

            if (!row || loadingRow)
              return <SeriesRowSkeleton key={cat.category_id} />;

            if (
              q &&
              filtered.length === 0 &&
              !cat.category_name.toLowerCase().includes(q)
            ) {
              return null;
            }

            return (
              <ContentRow
                key={cat.category_id}
                title={cat.category_name}
                itemCount={q ? filtered.length : row.total}
                loading={row.loading && seriesList.length > 0}
                onScrollEnd={
                  q ? undefined : hasMore ? () => loadMore(cat) : undefined
                }
                action={
                  !q && row.total > SERIES_PER_ROW
                    ? { label: "Show All", onClick: () => openShowAll(cat) }
                    : undefined
                }
              >
                {filtered.map((s) => (
                  <SeriesCard
                    key={s.series_id}
                    series={s}
                    onSelect={setOverlaySeries}
                    onToggleWatchlist={toggleSeriesWatchlist}
                  />
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
        <SeriesFilterEmptyState />
      )}

      {overlaySeries && (
        <SeriesOverlay
          series={overlaySeries}
          onClose={() => setOverlaySeries(null)}
        />
      )}
    </div>
  );
}
