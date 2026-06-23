import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Tv,
  Loader2,
  AlertCircle,
  RotateCcw,
  Play,
  Circle,
  Clock,
} from "lucide-react";
import { api, ChannelGroup, Programme, GuideResponse } from "@/lib/api";
import { Skeleton } from "@/components/Skeleton";
import { useSettings } from "@/context/SettingsContext";

const PAGE_SIZE = 60;

/** Parse XMLTV time string "20260623043400 +0200" to Date */
function parseXmltvTime(ts: string): Date {
  // "20260623043400 +0200" → "2026-06-23T04:34:00+02:00"
  const clean = ts.trim();
  const datePart = clean.slice(0, 8);
  const timePart = clean.slice(8, 14);
  const tzPart = clean.slice(15); // after space
  const iso = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}${tzPart}`;
  return new Date(iso);
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Progress fraction of a programme (0-1). 0 if not yet started, 1 if ended. */
function programmeProgress(p: Programme, now: Date): number {
  try {
    const start = parseXmltvTime(p.start);
    const stop = parseXmltvTime(p.stop);
    if (now < start) return 0;
    if (now > stop) return 1;
    return (now.getTime() - start.getTime()) / (stop.getTime() - start.getTime());
  } catch {
    return 0;
  }
}

/** Format programme time range like "4:34 AM – 6:00 AM" */
function programmeTimeRange(p: Programme): string {
  try {
    return `${formatTime(parseXmltvTime(p.start))} – ${formatTime(parseXmltvTime(p.stop))}`;
  } catch {
    return "";
  }
}

export default function Guide() {
  const navigate = useNavigate();
  const { settings } = useSettings();

  const [allData, setAllData] = useState<ChannelGroup[]>([]);
  const [totalChannels, setTotalChannels] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchedRef = useRef(0);

  // ── Build stream_id → category_id map from sessionStorage ──────
  const streamToCat = useMemo(() => {
    const map = new Map<number, string>();
    try {
      const raw = sessionStorage.getItem("stv_live_all_slim");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.a) {
          for (const s of parsed.a) {
            map.set(s.id, s.c);
          }
        }
      }
    } catch {}
    return map;
  }, []);

  // Cache key for sessionStorage
  const CACHE_KEY = "stv_guide_data";

  const loadPage = useCallback(
    async (offset: number) => {
      // Try sessionStorage cache first
      if (offset === 0) {
        try {
          const cached = sessionStorage.getItem(CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.data && Date.now() - parsed.ts < 300000) {
              setAllData(parsed.data);
              setTotalChannels(parsed.total);
              setLoading(false);
              fetchedRef.current = parsed.data.length;
              // Background refresh
              api.guide.get(0, PAGE_SIZE).then((d) => {
                const groups = d.channel_groups;
                setAllData(groups);
                setTotalChannels(d.total_channels);
                fetchedRef.current = groups.length;
                sessionStorage.setItem(
                  CACHE_KEY,
                  JSON.stringify({ data: groups, total: d.total_channels, ts: Date.now() })
                );
              }).catch(() => {});
              return;
            }
          }
        } catch {}
      }

      if (offset === 0) setLoading(true);
      else setLoadingMore(true);

      try {
        const d = await api.guide.get(offset, PAGE_SIZE);
        const groups = d.channel_groups;
        setTotalChannels(d.total_channels);

        if (offset === 0) {
          setAllData(groups);
          fetchedRef.current = groups.length;
          // Cache
          try {
            sessionStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ data: groups, total: d.total_channels, ts: Date.now() })
            );
          } catch {}
        } else {
          setAllData((prev) => {
            // Dedupe
            const seen = new Set(prev.map((g) => g.channel_id));
            const newGroups = groups.filter((g) => !seen.has(g.channel_id));
            return [...prev, ...newGroups];
          });
          fetchedRef.current = offset + groups.length;
        }
      } catch (e: unknown) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  // Infinite scroll — observe sentinel relative to the scrollable main container
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = document.querySelector("main");
    if (!sentinel || !root || allData.length >= totalChannels || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          loadPage(allData.length);
        }
      },
      { root, rootMargin: "600px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [allData.length, totalChannels, loading, loadingMore, loadPage]);

  // ── Settings filtering ─────────────────────────────────────────
  const filteredChannels = useMemo(() => {
    if (!settings.languages.length && !settings.hiddenCategories.length && settings.showAdult) {
      return allData;
    }

    return allData.filter((g) => {
      // If stream_id exists, check category
      if (g.stream_id != null) {
        const catId = streamToCat.get(g.stream_id);
        if (catId) {
          // Hidden categories
          if (settings.hiddenCategories.includes(catId)) return false;
        }
      }
      return true;
    });
  }, [allData, settings, streamToCat]);

  // ── Time reference ─────────────────────────────────────────────
  const now = useMemo(() => new Date(), []);

  // Build timeline labels (now → +4h in 30-min steps)
  const timeSlots = useMemo(() => {
    const slots: Date[] = [];
    const base = new Date(now);
    base.setMinutes(0, 0, 0);
    for (let i = 0; i <= 8; i++) {
      const d = new Date(base.getTime() + i * 30 * 60 * 1000);
      slots.push(d);
    }
    return slots;
  }, [now]);

  // Show "NOW" position as percentage on timeline
  const nowPct = useMemo(() => {
    const totalMs = 4 * 60 * 60 * 1000; // 4h span
    const elapsedMs = (now.getTime() - timeSlots[0]?.getTime()) || 0;
    return Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));
  }, [now, timeSlots]);

  // ── Render ─────────────────────────────────────────────────────
  const showEmpty =
    !loading && filteredChannels.length === 0 && allData.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      {loading ? (
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="w-28 h-5" />
            <Skeleton className="w-44 h-3.5" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Tv className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">TV Guide</h1>
            <p className="text-sm text-muted-foreground">
              {totalChannels.toLocaleString()} channels · showing {filteredChannels.length.toLocaleString()}
              {settings.languages.length > 0 && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {settings.languages.join(", ")}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
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
            {/* NOW indicator */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
              style={{ left: `calc(200px + (100% - 200px) * ${nowPct / 100})` }}
            >
              <div className="absolute -top-1 -left-[11px] bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                LIVE
              </div>
            </div>
          </div>
          {/* Base line */}
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
          <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            No channels match your settings
          </p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            {allData.length.toLocaleString()} channels available — adjust filters to see them
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/30 -mx-0">
          {filteredChannels.map((group) => (
            <ChannelRow
              key={group.channel_id}
              group={group}
              now={now}
              onPlay={() => {
                if (group.stream_id) {
                  navigate(`/watch/live/${group.stream_id}`);
                }
              }}
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

      {!loading && filteredChannels.length === 0 && allData.length === 0 && (
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

// ── Channel Row Component ─────────────────────────────────────────────────

function ChannelRow({
  group,
  now,
  onPlay,
}: {
  group: ChannelGroup;
  now: Date;
  onPlay: () => void;
}) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasStream = group.stream_id != null;

  const liveProgramme = group.programmes.find((p) => p.is_live);
  const upcomingProgrammes = group.programmes.filter((p) => !p.is_live);

  // Sort: live first, then by start time
  const sorted = [
    ...(liveProgramme ? [liveProgramme] : []),
    ...upcomingProgrammes.sort((a, b) => a.start.localeCompare(b.start)),
  ];

  return (
    <div className="flex py-2 px-4 hover:bg-muted/30 transition-colors group">
      {/* Channel info — fixed left column */}
      <button
        onClick={onPlay}
        disabled={!hasStream}
        className={`shrink-0 w-[184px] flex items-center gap-2.5 text-left pr-3 ${
          hasStream
            ? "cursor-pointer hover:opacity-80"
            : "cursor-default opacity-60"
        }`}
        title={hasStream ? `Watch ${group.channel_name}` : "No stream available"}
      >
        {/* Channel icon */}
        <div className="shrink-0 w-9 h-9 rounded-lg bg-[#141420] flex items-center justify-center overflow-hidden">
          {group.channel_icon ? (
            <img
              src={group.channel_icon}
              alt=""
              className="w-7 h-7 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Tv className="h-4 w-4 text-muted-foreground/40" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-tight truncate">
            {group.channel_name}
          </p>
          {hasStream && (
            <Play className="h-3 w-3 text-primary/50 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </button>

      {/* Programme cards — horizontal scroll */}
      <div
        ref={scrollRef}
        className="flex-1 flex gap-2 overflow-x-auto scrollbar-none min-w-0"
      >
        {sorted.length === 0 ? (
          <div className="flex items-center h-[52px] text-[11px] text-muted-foreground/40">
            <Clock className="h-3 w-3 mr-1" />
            No upcoming programmes
          </div>
        ) : (
          sorted.map((p, i) => (
            <ProgrammeCard
              key={`${p.start}-${i}`}
              programme={p}
              now={now}
              onPlay={hasStream ? onPlay : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Programme Card ─────────────────────────────────────────────────────────

function ProgrammeCard({
  programme,
  now,
  onPlay,
}: {
  programme: Programme;
  now: Date;
  onPlay?: () => void;
}) {
  const isLive = programme.is_live;
  const progress = isLive ? programmeProgress(programme, now) : 0;
  const timeStr = programmeTimeRange(programme);

  return (
    <button
      onClick={onPlay}
      disabled={!onPlay}
      className={`shrink-0 flex flex-col justify-center min-w-[140px] max-w-[220px] px-3 py-2 rounded-lg text-left transition-all duration-200 ${
        isLive
          ? "bg-primary/10 border border-primary/15 hover:bg-primary/15 hover:border-primary/30 cursor-pointer"
          : "bg-card border border-border hover:border-primary/20 cursor-pointer"
      } ${!onPlay ? "opacity-50 cursor-default" : ""}`}
    >
      {/* Title */}
      <p
        className={`text-xs font-medium leading-tight line-clamp-2 ${
          isLive ? "text-primary" : ""
        }`}
      >
        {programme.title || "No title"}
      </p>

      {/* Time */}
      <p className="text-[10px] text-muted-foreground/60 mt-1">
        {timeStr}
      </p>

      {/* LIVE badge + progress */}
      {isLive && (
        <div className="mt-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Circle className="h-1.5 w-1.5 fill-red-500 text-red-500" />
            <span className="text-[9px] font-semibold text-red-500 tracking-wide">
              LIVE
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-0.5 bg-primary/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
}
