import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tv, Loader2, AlertCircle, RotateCcw, Search, X, Star } from "lucide-react";
import { api, Category, LiveStream } from "@/lib/api";
import { Skeleton, ChannelCardSkeleton, TabSkeleton } from "@/components/Skeleton";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useSettings } from "@/context/SettingsContext";
import { filterCategories } from "@/lib/settings";
import { useChannelFavorites } from "@/hooks/useChannelFavorites";
import { useNowPlaying } from "@/hooks/useNowPlaying";

const BATCH = 50;
const ALL_CAT = "__all__";

// Slim stream format for sessionStorage cache (fields abbreviated to save space)
interface SlimStream { id: number; n: string; c: string; ic?: string }
interface SlimAllCache { a: SlimStream[]; ts: number }

export default function LiveTV() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Cache helpers ──────────────────────────────────────────────
  const loadCache = <T,>(key: string, field: string, ttl = 900000): T | null => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed[field] && Date.now() - parsed.ts < ttl) return parsed[field];
    } catch {}
    return null;
  };

  // Slim allStreams for sessionStorage (full objects are ~17MB — way over quota).
  // Only keep fields needed for search + display: id, name, category_id.
  // Icons are NOT cached (they're long URLs — would add ~3.8MB).
  // Key names abbreviated to save space: id, n, c
  const SLIM_ALL_KEY = "stv_live_all_slim";
  const restoreAllStreams = (): LiveStream[] => {
    try {
      const raw = sessionStorage.getItem(SLIM_ALL_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SlimAllCache;
      if (parsed.a && Date.now() - parsed.ts < 900000) {
        return parsed.a.map((s) => ({
          stream_id: s.id, name: s.n, stream_icon: "",
          category_id: s.c, num: 0, stream_type: "live",
          epg_channel_id: "", added: "", is_adult: 0,
          category_ids: [s.c], custom_sid: null, tv_archive: 0,
          direct_source: "", tv_archive_duration: 0,
        } as LiveStream));
      }
    } catch {}
    return [];
  };

  // Initialize from sessionStorage so the first render has data (no spinner flash)
  const [categories, setCategories] = useState<Category[]>(
    () => loadCache("stv_live_cats", "categories") ?? []
  );
  const [activeCat, setActiveCat] = useState<string>(ALL_CAT);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [allStreams, setAllStreams] = useState<LiveStream[]>(() => restoreAllStreams());
  const [loading, setLoading] = useState(() => !loadCache("stv_live_cats", "categories"));
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [allLoading, setAllLoading] = useState(() => !sessionStorage.getItem(SLIM_ALL_KEY));
  const [error, setError] = useState<string | null>(null);

  const searchQuery = searchParams.get("q") || "";
  const setSearchQuery = useCallback(
    (q: string) => {
      if (q) {
        setSearchParams({ q });
      } else {
        setSearchParams({});
      }
    },
    [setSearchParams]
  );
  const q = searchQuery.toLowerCase().trim();
  const isAllMode = activeCat === ALL_CAT;

  const { visibleItems, sentinelRef, hasMore } = useInfiniteScroll(
    q ? allStreams : (isAllMode ? allStreams : streams), BATCH
  );
  const { settings } = useSettings();
  const { favorites, toggleFavorite, isFavorite } = useChannelFavorites();
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Now-playing EPG data for visible channels
  const nowPlayingStreamIds = useMemo(() => {
    const source = q ? allStreams : (isAllMode ? allStreams : streams);
    return source.slice(0, 200).map((s) => s.stream_id);
  }, [q, isAllMode, allStreams, streams]);
  const { getNowPlaying } = useNowPlaying(nowPlayingStreamIds);

  const filteredCategories = useMemo(
    () => filterCategories(categories, settings, true),
    [categories, settings]
  );

  // Pre-compute full search matches so we can show the total count
  const searchMatches = useMemo(() => {
    if (!q) return [];
    return allStreams.filter((s) => s.name.toLowerCase().includes(q));
  }, [allStreams, q]);

  // Favorites-only filter: when toggle is active, filter streams to favorited only
  const favoritesFiltered = useMemo(() => {
    if (!favoritesOnly || favorites.size === 0) return null;
    return new Set(favorites);
  }, [favoritesOnly, favorites]);

  const filteredItems = useMemo(() => {
    let items = q
      ? searchMatches.slice(0, visibleItems.length || BATCH)
      : visibleItems;
    if (favoritesFiltered) {
      items = items.filter((s) => favoritesFiltered.has(s.stream_id));
    }
    return items;
  }, [visibleItems, q, searchMatches, favoritesFiltered]);

  const searchHasMore = q
    ? filteredItems.length < searchMatches.length
    : favoritesOnly
      ? false // all favorites are already visible (no pagination for favorites mode)
      : hasMore;

  useEffect(() => {
    // Categories — restore from cache if fresh, fetch otherwise
    const catCache = sessionStorage.getItem("stv_live_cats");
    if (catCache) {
      try {
        const parsed = JSON.parse(catCache);
        if (parsed.categories && Date.now() - parsed.ts < 900000) {
          setCategories(parsed.categories);
          setLoading(false);
        }
      } catch {}
    }
    api.live
      .categories()
      .then((d) => {
        setCategories(d.categories);
        sessionStorage.setItem("stv_live_cats", JSON.stringify({ categories: d.categories, ts: Date.now() }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    // Fetch ALL streams for cross-category search (slim sessionStorage cache)
    let restored = false;
    const cached = sessionStorage.getItem(SLIM_ALL_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.a && Date.now() - parsed.ts < 900000) {
          restored = true;
          // Already loaded via useState initializer (restoreAllStreams),
          // but re-set in case the cache was stale and we showed nothing.
          if (allStreams.length === 0) {
            setAllStreams(restoreAllStreams());
          }
          setAllLoading(false);
        }
      } catch {}
    }
    if (!restored) {
      api.live
        .all()
        .then((d) => {
          setAllStreams(d.streams);
          // Slim cache: only id, name, category_id (~3MB vs 17MB)
          try {
            const slim = d.streams.map((s) => ({
              id: s.stream_id, n: s.name, c: s.category_id,
            }));
            sessionStorage.setItem(SLIM_ALL_KEY, JSON.stringify({ a: slim, ts: Date.now() }));
          } catch {}
        })
        .catch(() => {})
        .finally(() => setAllLoading(false));
    }
  }, []);

  useEffect(() => {
    if (filteredCategories.length > 0 && !filteredCategories.find((c) => c.category_id === activeCat)) {
      setActiveCat(activeCat === ALL_CAT ? ALL_CAT : filteredCategories[0].category_id);
    }
  }, [filteredCategories, activeCat]);

  useEffect(() => {
    if (!activeCat || isAllMode || q) return;
    setError(null);
    setStreamsLoading(true);
    api.live
      .streams(activeCat)
      .then((d) => setStreams(d.streams))
      .catch((e) => setError(e.message))
      .finally(() => setStreamsLoading(false));
  }, [activeCat, isAllMode, q]);

  const isSearching = !!q;

  return (
    <div className="space-y-6">
      {/* Header */}
      {loading ? (
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="w-24 h-5" />
            <Skeleton className="w-40 h-3.5" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Tv className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Live TV</h1>
            <p className="text-sm text-muted-foreground">
              {isSearching
                ? `${searchMatches.length.toLocaleString()} results · ${allStreams.length.toLocaleString()} channels`
                : favoritesOnly
                  ? `${favorites.size} favorites · ${allStreams.length.toLocaleString()} total channels`
                  : isAllMode
                    ? `${allStreams.length.toLocaleString()} channels · ${filteredCategories.length} categories`
                    : `${streams.length.toLocaleString()} channels · ${filteredCategories.length} categories`}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
          <button
            onClick={() => {
              setError(null);
              if (activeCat) api.live.streams(activeCat).then(d => setStreams(d.streams)).catch(e => setError(e.message));
            }}
            className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Search bar + Favorites toggle */}
      {!loading && (
        <div className="flex items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={allLoading ? "Loading channels..." : `Search ${allStreams.length.toLocaleString()} channels...`}
              disabled={allLoading}
              className="w-full h-9 pl-9 pr-8 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
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
          {/* Favorites-only toggle */}
          {favorites.size > 0 && (
            <button
              onClick={() => setFavoritesOnly((v) => !v)}
              className={`shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors ${
                favoritesOnly
                  ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={favoritesOnly ? "Show all channels" : "Show favorites only"}
              aria-label={favoritesOnly ? "Show all channels" : "Show favorites only"}
              aria-pressed={favoritesOnly}
            >
              <Star className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-yellow-400" : ""}`} />
              <span className="hidden sm:inline">{favoritesOnly ? "Favorites" : "Favorites"}</span>
              <span className="text-[10px] opacity-60">{favorites.size}</span>
            </button>
          )}
        </div>
      )}

      {/* Category tabs (hidden when searching or in favorites-only mode) */}
      {!isSearching && !favoritesOnly && (
        loading ? (
          <div className="flex gap-1.5 pb-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <TabSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin" style={{ touchAction: "manipulation" }}>
            {/* "All" tab — shows all channels across every category */}
            <button
              onClick={() => setActiveCat(ALL_CAT)}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isAllMode
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              All
            </button>
            {filteredCategories.map((cat) => (
              <button
                key={cat.category_id}
                onClick={() => setActiveCat(cat.category_id)}
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
        )
      )}

      {/* Channel grid */}
      {((isSearching || isAllMode) && allLoading) ? (
        <div className="channel-grid">
          {Array.from({ length: 20 }).map((_, i) => (
            <ChannelCardSkeleton key={i} />
          ))}
        </div>
      ) : !isSearching && !isAllMode && streamsLoading ? (
        <div className="channel-grid">
          {Array.from({ length: 20 }).map((_, i) => (
            <ChannelCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {/* ⭐ Favorites section — only when not searching, not in favoritesOnly mode, and favorites exist */}
          {!isSearching && !favoritesOnly && favorites.size > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                Favorites
                <span className="text-[10px] text-muted-foreground/50 font-normal">{favorites.size}</span>
              </h2>
              <div className="channel-grid">
                {allStreams
                  .filter((s) => favorites.has(s.stream_id))
                  .slice(0, 50)
                  .map((s) => (
                    <button
                      key={`fav-${s.stream_id}`}
                      onClick={() => navigate(`/watch/live/${s.stream_id}`)}
                      data-watch-link
                      className="channel-card bg-card rounded-lg border border-border p-3 text-left hover:border-primary/30 relative group/card"
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(s.stream_id); }}
                        className="absolute top-2 right-2 z-10 opacity-0 group-hover/card:opacity-100 transition-opacity"
                        aria-label={favorites.has(s.stream_id) ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Star
                          className={`h-3.5 w-3.5 ${favorites.has(s.stream_id) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/40"}`}
                        />
                      </button>
                      {/* Channel number badge */}
                      {s.num > 0 && (
                        <span className="absolute top-2 left-2 z-10 text-[9px] font-mono font-semibold text-muted-foreground/40 bg-black/40 px-1 py-0.5 rounded">
                          {s.num}
                        </span>
                      )}
                      {s.stream_icon ? (
                        <img
                          src={`/api/iptv/${s.stream_icon.replace("http://", "").replace("https://", "")}`}
                          alt={s.name ? `${s.name} logo` : ""}
                          className="w-full h-12 object-contain mb-2 rounded opacity-80"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-12 bg-muted rounded mb-2 flex items-center justify-center">
                          <Tv className="h-4 w-4 text-muted-foreground/40" />
                        </div>
                      )}
                      <p className="text-xs font-medium leading-tight line-clamp-2">
                        {s.name}
                      </p>
                      {getNowPlaying(s.stream_id) && (
                        <p className="text-[9px] text-muted-foreground/50 mt-0.5 truncate leading-tight">
                          {getNowPlaying(s.stream_id)}
                        </p>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {isSearching && searchMatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">
                No channels matching "{searchQuery}" across all {allStreams.length.toLocaleString()} channels
              </p>
              <button
                onClick={() => setSearchQuery("")}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
              <div className="channel-grid">
                {filteredItems.map((s) => (
                  <button
                    key={s.stream_id}
                    onClick={() => navigate(`/watch/live/${s.stream_id}`)}
                    data-watch-link
                    className="channel-card bg-card rounded-lg border border-border p-3 text-left hover:border-primary/30 relative group/card"
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(s.stream_id); }}
                      className="absolute top-2 right-2 z-10 opacity-0 group-hover/card:opacity-100 transition-opacity"
                      aria-label={favorites.has(s.stream_id) ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${favorites.has(s.stream_id) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/40"}`}
                      />
                    </button>
                    {s.num > 0 && (
                      <span className="absolute top-2 left-2 z-10 text-[9px] font-mono font-semibold text-muted-foreground/40 bg-black/40 px-1 py-0.5 rounded">
                        {s.num}
                      </span>
                    )}
                    {s.stream_icon ? (
                      <img
                        src={`/api/iptv/${s.stream_icon.replace("http://", "").replace("https://", "")}`}
                        alt={s.name ? `${s.name} logo` : ""}
                        className="w-full h-12 object-contain mb-2 rounded opacity-80"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-12 bg-muted rounded mb-2 flex items-center justify-center">
                        <Tv className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    )}
                    <p className="text-xs font-medium leading-tight line-clamp-2">
                      {s.name}
                    </p>
                    {getNowPlaying(s.stream_id) && (
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5 truncate leading-tight">
                        {getNowPlaying(s.stream_id)}
                      </p>
                    )}
                  </button>
                ))}
              </div>

              <div ref={sentinelRef} className="h-1" />
              {searchHasMore && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </>
      )}

      {!(isSearching || isAllMode) && streams.length === 0 && !streamsLoading && !loading && !isSearching && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No channels in this category</p>
        </div>
      )}

      {isAllMode && allStreams.length === 0 && !allLoading && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No channels available</p>
        </div>
      )}

      {filteredCategories.length === 0 && !loading && !isSearching && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No categories match your filters</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Adjust your language/country settings to see more content
          </p>
        </div>
      )}
    </div>
  );
}
