import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { Tv, Loader2, AlertCircle, RotateCcw, Search, X } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { ChannelRow } from "@/components/ChannelRow";
import { useSettings } from "@/context/SettingsContext";
import { useGuideData, formatTime } from "@/hooks/useGuideData";
import { useChannelFavorites } from "@/hooks/useChannelFavorites";

export default function Guide() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { favorites, toggleFavorite } = useChannelFavorites();
  const {
    filteredChannels,
    allData,
    totalChannels,
    loading,
    loadingMore,
    error,
    sentinelRef,
    timeSlots,
    now,
    nowPct,
    loadPage,
  } = useGuideData();

  // ── Guide search ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const q = searchQuery.toLowerCase().trim();

  const searchedChannels = useMemo(() => {
    if (!q) return filteredChannels;
    return filteredChannels
      .map((ch) => {
        // Filter programmes that match the search query
        const matchingProgs = ch.programmes.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.subtitle.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.desc.toLowerCase().includes(q),
        );
        if (matchingProgs.length === 0) return null;
        return { ...ch, programmes: matchingProgs };
      })
      .filter(Boolean) as typeof filteredChannels;
  }, [filteredChannels, q]);

  const matchCount = useMemo(() => {
    if (!q) return 0;
    return searchedChannels.reduce((acc, ch) => acc + ch.programmes.length, 0);
  }, [searchedChannels, q]);

  const showEmpty =
    !loading && searchedChannels.length === 0 && allData.length > 0;

  const clearSearch = useCallback(() => setSearchQuery(""), []);

  // ── Keyboard navigation ─────────────────────────────────────────
  const guideRef = useRef<HTMLDivElement>(null);
  const [focusedRow, setFocusedRow] = useState(-1);
  const [focusedCol, setFocusedCol] = useState(-1);

  // Focus the element at (focusedRow, focusedCol) on change
  useEffect(() => {
    if (focusedRow < 0 || focusedCol < -1) return;
    const sel =
      focusedCol === -1
        ? `[data-guide-row="${focusedRow}"][data-guide-target="channel"]`
        : `[data-guide-row="${focusedRow}"][data-guide-col="${focusedCol}"]`;
    const el = guideRef.current?.querySelector<HTMLElement>(sel);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedRow, focusedCol]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (focusedRow < 0) return;
      // Don't hijack focus when user is typing in search
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;

      const rowCount = searchedChannels.length;
      if (rowCount === 0) return;

      const maxCol = searchedChannels[focusedRow]?.programmes.length ?? 0;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedRow((prev) => Math.min(prev + 1, rowCount - 1));
          setFocusedCol(-1);
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedRow((prev) => Math.max(prev - 1, 0));
          setFocusedCol(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (focusedCol < maxCol - 1) {
            setFocusedCol((prev) => Math.min(prev + 1, maxCol - 1));
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (focusedCol > -1) {
            setFocusedCol((prev) => Math.max(prev - 1, -1));
          }
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedCol === -1) {
            // Focused on channel name — play
            const ch = searchedChannels[focusedRow];
            if (ch.stream_id) navigate(`/watch/live/${ch.stream_id}`);
          } else {
            // Focused on a programme card — play channel
            const ch = searchedChannels[focusedRow];
            if (ch.stream_id) navigate(`/watch/live/${ch.stream_id}`);
          }
          break;
        case "Escape":
          e.preventDefault();
          setFocusedRow(-1);
          setFocusedCol(-1);
          break;
      }
    },
    [focusedRow, focusedCol, searchedChannels, navigate],
  );

  // Global keydown listener when guide is focused
  useEffect(() => {
    const el = guideRef.current;
    if (!el) return;
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={guideRef}
      className="space-y-6 sm:space-y-8"
      tabIndex={0}
      role="grid"
      aria-label="TV Guide"
    >
      {/* Header */}
      {loading ? (
        <div className="page-header">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="w-28 h-5" />
            <Skeleton className="w-44 h-3.5" />
          </div>
        </div>
      ) : (
        <>
          <div className="page-header">
            <div className="page-header-icon">
              <Tv className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold">TV Guide</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {totalChannels.toLocaleString()} channels · showing{" "}
                {searchedChannels.length.toLocaleString()}
                {settings.languages.length > 0 && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
                    {settings.languages.join(", ")}
                  </span>
                )}
                {q && matchCount > 0 && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                    {matchCount} programme{matchCount !== 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search programmes..."
              className="search-input"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
          <button
            onClick={() => loadPage(0)}
            className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Timeline Header */}
      {!loading && (
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-2 -mx-0">
          <div className="flex items-end h-8 pl-[200px] pr-4 relative">
            {timeSlots.map((slot, i) => (
              <div
                key={i}
                className="flex-1 text-[10px] text-muted-foreground/60 font-medium whitespace-nowrap"
              >
                {formatTime(slot)}
              </div>
            ))}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
              style={{ left: `calc(200px + (100% - 200px) * ${nowPct / 100})` }}
            >
              <div className="absolute -top-1 -left-[11px] bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                LIVE
              </div>
            </div>
          </div>
          <div className="h-px bg-border/50 mx-4" />
        </div>
      )}

      {/* Channel Rows */}
      {loading ? (
        <div className="space-y-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-3 px-4 border-b border-border/30"
            >
              <Skeleton className="w-[184px] h-10 rounded-lg shrink-0" />
              <div className="flex gap-2 flex-1 overflow-hidden">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="w-40 h-16 rounded-lg shrink-0" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {q ? (
            <>
              <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">
                No programmes matching &quot;{searchQuery}&quot;
              </p>
              <button
                onClick={clearSearch}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">
                No channels match your settings
              </p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                {allData.length.toLocaleString()} channels available — adjust
                filters to see them
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/30 -mx-0">
          {searchedChannels.map((group, rowIdx) => (
            <ChannelRow
              key={group.channel_id}
              group={group}
              now={now}
              rowIndex={rowIdx}
              focusedCol={focusedRow === rowIdx ? focusedCol : -2}
              onFocusCol={(col) => {
                setFocusedRow(rowIdx);
                setFocusedCol(col);
              }}
              onPlay={() => {
                if (group.stream_id) {
                  navigate(`/watch/live/${group.stream_id}`);
                }
              }}
              isFavorite={
                group.stream_id ? favorites.has(group.stream_id) : false
              }
              onToggleFavorite={
                group.stream_id
                  ? () => toggleFavorite(group.stream_id as number)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Loading more */}
      <div ref={sentinelRef} className="h-1" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && searchedChannels.length === 0 && allData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No EPG data available</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Guide data is loaded from the IPTV provider&apos;s XMLTV feed
          </p>
        </div>
      )}
    </div>
  );
}
