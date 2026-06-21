import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tv, Loader2, AlertCircle, RotateCcw, Search, X } from "lucide-react";
import { api, Category, LiveStream } from "@/lib/api";
import { Skeleton, ChannelCardSkeleton, TabSkeleton } from "@/components/Skeleton";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useSettings } from "@/context/SettingsContext";
import { filterCategories } from "@/lib/settings";

const BATCH = 50;

export default function LiveTV() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string>("");
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [allStreams, setAllStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [allLoading, setAllLoading] = useState(true);
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

  const { visibleItems, sentinelRef, hasMore } = useInfiniteScroll(
    q ? allStreams : streams, BATCH
  );
  const { settings } = useSettings();

  const filteredCategories = useMemo(
    () => filterCategories(categories, settings, true),
    [categories, settings]
  );

  const filteredItems = useMemo(() => {
    if (!q) return visibleItems;
    return visibleItems.filter((s) => s.name.toLowerCase().includes(q));
  }, [visibleItems, q]);

  useEffect(() => {
    api.live
      .categories()
      .then((d) => setCategories(d.categories))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    api.live
      .all()
      .then((d) => setAllStreams(d.streams))
      .catch(() => {})
      .finally(() => setAllLoading(false));
  }, []);

  useEffect(() => {
    if (filteredCategories.length > 0 && !filteredCategories.find((c) => c.category_id === activeCat)) {
      setActiveCat(filteredCategories[0].category_id);
    }
  }, [filteredCategories, activeCat]);

  useEffect(() => {
    if (!activeCat || q) return;
    setError(null);
    setStreamsLoading(true);
    api.live
      .streams(activeCat)
      .then((d) => setStreams(d.streams))
      .catch((e) => setError(e.message))
      .finally(() => setStreamsLoading(false));
  }, [activeCat, q]);

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
                ? `${filteredItems.length.toLocaleString()} results · ${allStreams.length.toLocaleString()} channels`
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

      {/* Search bar */}
      {!loading && (
        <div className="relative max-w-md">
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
      )}

      {/* Category tabs (hidden when searching) */}
      {!isSearching && (
        loading ? (
          <div className="flex gap-1.5 pb-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <TabSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
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
      {isSearching && allLoading ? (
        <div className="channel-grid">
          {Array.from({ length: 20 }).map((_, i) => (
            <ChannelCardSkeleton key={i} />
          ))}
        </div>
      ) : !isSearching && streamsLoading ? (
        <div className="channel-grid">
          {Array.from({ length: 20 }).map((_, i) => (
            <ChannelCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {isSearching && filteredItems.length === 0 ? (
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
                    className="channel-card bg-card rounded-lg border border-border p-3 text-left hover:border-primary/30"
                  >
                    {s.stream_icon ? (
                      <img
                        src={`/api/iptv/${s.stream_icon.replace("http://", "").replace("https://", "")}`}
                        alt=""
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
                  </button>
                ))}
              </div>

              <div ref={sentinelRef} className="h-1" />
              {hasMore && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </>
      )}

      {streams.length === 0 && !streamsLoading && !loading && !isSearching && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No channels in this category</p>
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
