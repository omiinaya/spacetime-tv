import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router";
import {
  Tv,
  Loader2,
  AlertCircle,
  RotateCcw,
  Search,
  Star,
} from "lucide-react";
import { api } from "@/lib/api";
import { LiveStream } from "@/lib/types";
import { Skeleton, ChannelCardSkeleton } from "@/components/Skeleton";
import { LiveSearchBar } from "@/components/live/LiveSearchBar";
import { CategoryTabs } from "@/components/live/CategoryTabs";
import LiveChannelCard from "@/components/LiveChannelCard";
import { useLiveStreamCache } from "@/hooks/useLiveStreamCache";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useSettings } from "@/context/SettingsContext";
import { filterCategories } from "@/lib/settings";
import { toast } from "sonner";
import { useChannelFavorites } from "@/hooks/useChannelFavorites";
import { useNowPlaying } from "@/hooks/useNowPlaying";

const BATCH = 50;
const ALL_CAT = "__all__";

// ── Main Page ─────────────────────────────────────────────────

export default function LiveTV() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    categories,
    allStreams,
    loading,
    allLoading,
    setLoading,
    setAllLoading,
    setCategories,
    setAllStreams,
  } = useLiveStreamCache();

  const [activeCat, setActiveCat] = useState<string>(ALL_CAT);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchQuery = searchParams.get("q") || "";
  const setSearchQuery = useCallback(
    (q: string) => {
      if (q) setSearchParams({ q });
      else setSearchParams({});
    },
    [setSearchParams],
  );
  const q = searchQuery.toLowerCase().trim();
  const isAllMode = activeCat === ALL_CAT;

  const { visibleItems, sentinelRef, hasMore } = useInfiniteScroll(
    q ? allStreams : isAllMode ? allStreams : streams,
    BATCH,
  );
  const { settings, adultUnlocked } = useSettings();
  const { favorites, toggleFavorite } = useChannelFavorites();
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const nowPlayingStreamIds = useMemo(() => {
    const source = q ? allStreams : isAllMode ? allStreams : streams;
    return source.slice(0, 200).map((s) => s.stream_id);
  }, [q, isAllMode, allStreams, streams]);
  const { getNowPlaying } = useNowPlaying(nowPlayingStreamIds);

  const filteredCategories = useMemo(
    () => filterCategories(categories, settings, true, adultUnlocked),
    [categories, settings, adultUnlocked],
  );

  const searchMatches = useMemo(() => {
    if (!q) return [];
    return allStreams.filter((s) => s.name.toLowerCase().includes(q));
  }, [allStreams, q]);

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
      ? false
      : hasMore;

  useEffect(() => {
    const catCache = sessionStorage.getItem("stv_live_cats");
    if (catCache) {
      try {
        const parsed = JSON.parse(catCache);
        if (parsed.categories && Date.now() - parsed.ts < 900000) {
          setCategories(parsed.categories);
          setLoading(false);
        }
      } catch {} // DOMException: storage quota or disabled
    }
    api.live
      .categories()
      .then((d) => {
        setCategories(d.categories);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    let restored = false;
    const cached = sessionStorage.getItem("stv_live_all_slim");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.a?.length && Date.now() - parsed.ts < 900000) {
          restored = true;
          if (allStreams.length === 0) setAllStreams(parsed.a); // restore from cache
          setAllLoading(false);
        }
      } catch {} // DOMException: storage quota or disabled
    }
    if (!restored) {
      api.live
        .allSlim()
        .then((d) => {
          setAllStreams(d.streams);
        })
        .catch(() => toast.error("Failed to load all streams"))
        .finally(() => setAllLoading(false));
    }
  }, []);

  useEffect(() => {
    if (
      filteredCategories.length > 0 &&
      !filteredCategories.find((c) => c.category_id === activeCat)
    ) {
      setActiveCat(
        activeCat === ALL_CAT ? ALL_CAT : filteredCategories[0].category_id,
      );
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
    <div className="space-y-8 sm:space-y-12">
      {/* Header */}
      {loading ? (
        <div className="flex items-center gap-3 sm:gap-4">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="w-28 h-5" />
            <Skeleton className="w-44 h-3.5" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Tv className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold">Live TV</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
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
        <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
          <button
            onClick={() => {
              setError(null);
              if (activeCat)
                api.live
                  .streams(activeCat)
                  .then((d) => setStreams(d.streams))
                  .catch((e) => setError(e.message));
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
        <LiveSearchBar
          searchQuery={searchQuery}
          allLoading={allLoading}
          allStreamsLength={allStreams.length}
          favoritesSize={favorites.size}
          favoritesOnly={favoritesOnly}
          onSearchChange={setSearchQuery}
          onToggleFavoritesOnly={() => setFavoritesOnly((v) => !v)}
          onClearSearch={() => setSearchQuery("")}
        />
      )}

      {/* Category tabs */}
      {!isSearching && !favoritesOnly && (
        <CategoryTabs
          categories={filteredCategories}
          activeCat={activeCat}
          loading={loading}
          onSelect={setActiveCat}
        />
      )}

      {/* Channel grid */}
      {(isSearching || isAllMode) && allLoading ? (
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
          {/* Favorites section */}
          {!isSearching && !favoritesOnly && favorites.size > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                Favorites
                <span className="text-[10px] text-muted-foreground/50 font-normal bg-muted px-1.5 py-0.5 rounded-md">
                  {favorites.size}
                </span>
              </h2>
              <div className="channel-grid">
                {allStreams
                  .filter((s) => favorites.has(s.stream_id))
                  .slice(0, 50)
                  .map((s) => (
                    <LiveChannelCard
                      key={`fav-${s.stream_id}`}
                      stream={s}
                      isFavorite={favorites.has(s.stream_id)}
                      onToggleFavorite={toggleFavorite}
                      getNowPlaying={getNowPlaying}
                    />
                  ))}
              </div>
            </div>
          )}

          {isSearching && searchMatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">
                No channels matching &quot;{searchQuery}&quot; across all{" "}
                {allStreams.length.toLocaleString()} channels
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
                  <LiveChannelCard
                    key={s.stream_id}
                    stream={s}
                    isFavorite={favorites.has(s.stream_id)}
                    onToggleFavorite={toggleFavorite}
                    getNowPlaying={getNowPlaying}
                  />
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

      {!(isSearching || isAllMode) &&
        streams.length === 0 &&
        !streamsLoading &&
        !loading &&
        !isSearching && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">
              No channels in this category
            </p>
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
          <p className="text-sm text-muted-foreground">
            No categories match your filters
          </p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Adjust your language/country settings to see more content
          </p>
        </div>
      )}
    </div>
  );
}
