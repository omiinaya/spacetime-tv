/**
 * CatchupTimeline — EPG programme timeline for timeshift/catch-up TV.
 *
 * Displays a horizontal bar of programmes from the last N hours.
 * Clicking a programme starts playback from its start time.
 * A "Live" button reconnects to the live stream.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { RadioTower, Clock, History } from "lucide-react";
import { api, type CatchupProgramme } from "@/lib/api";

interface CatchupTimelineProps {
  streamId: number;
  onSelectProgramme: (startOffset: number) => void;
  onGoLive: () => void;
  isTimeshiftMode: boolean;
}

export function CatchupTimeline({
  streamId,
  onSelectProgramme,
  onGoLive,
  isTimeshiftMode,
}: CatchupTimelineProps) {
  const [programmes, setProgrammes] = useState<CatchupProgramme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredProgramme, setHoveredProgramme] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.guide
      .catchup(streamId, 4)
      .then((data) => {
        if (cancelled) return;
        setProgrammes(data.programmes || []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || "Failed to load EPG");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  const totalWindow =
    programmes.length > 0
      ? programmes[0].start_offset + programmes[0].duration
      : 14400; // fallback to 4h in seconds

  const getWidth = useCallback(
    (prog: CatchupProgramme) => {
      return Math.max((prog.duration / totalWindow) * 100, 4);
    },
    [totalWindow],
  );

  const getLeft = useCallback(
    (prog: CatchupProgramme) => {
      return (
        ((totalWindow - prog.start_offset - prog.duration) / totalWindow) * 100
      );
    },
    [totalWindow],
  );

  if (loading) {
    return (
      <div className="h-10 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/50">
        <Clock className="h-3 w-3 animate-pulse" />
        Loading EPG...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-10 flex items-center justify-center gap-2 text-[11px] text-red-400/60">
        <History className="h-3 w-3" />
        {error}
      </div>
    );
  }

  if (programmes.length === 0) return null;

  return (
    <div className="px-4 py-2 bg-black/40 backdrop-blur-sm border-t border-white/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          <History className="h-3 w-3" />
          Catch-up
        </div>
        <button
          onClick={onGoLive}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            !isTimeshiftMode
              ? "bg-green-500/15 text-green-400 border border-green-500/20"
              : "text-muted-foreground/60 hover:text-foreground border border-transparent hover:border-muted"
          }`}
          disabled={!isTimeshiftMode}
        >
          <RadioTower className="h-2.5 w-2.5" />
          Live
        </button>
      </div>

      {/* Timeline bar */}
      <div
        ref={containerRef}
        className="relative h-8 rounded-md bg-black/40 overflow-hidden cursor-pointer border border-white/5"
        onClick={(e) => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          // Convert click position to offset from now (in seconds)
          const clickedOffset = totalWindow * (1 - x);
          onSelectProgramme(Math.round(clickedOffset));
        }}
      >
        {programmes.map((prog, i) => {
          const width = getWidth(prog);
          const left = getLeft(prog);
          const isHovered = hoveredProgramme === i;
          return (
            <div
              key={i}
              className="absolute top-0 h-full rounded-sm transition-all duration-150 border-r border-black/20"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: isHovered
                  ? "rgba(59, 130, 246, 0.35)"
                  : "rgba(59, 130, 246, 0.2)",
                zIndex: isHovered ? 10 : 1,
              }}
              onMouseEnter={() => setHoveredProgramme(i)}
              onMouseLeave={() => setHoveredProgramme(null)}
              title={`${prog.title} — ${Math.round(prog.duration / 60)} min`}
            >
              {/* Programme label */}
              {width > 10 && (
                <span className="block px-1 text-[8px] leading-[32px] truncate text-blue-200/70 select-none">
                  {prog.title}
                </span>
              )}
            </div>
          );
        })}

        {/* "Now" indicator line */}
        <div className="absolute top-0 right-0 h-full w-0.5 bg-green-400/70 z-20 shadow-[0_0_4px_rgba(74,222,128,0.5)]" />
      </div>

      {/* Programme tooltip */}
      {hoveredProgramme !== null && programmes[hoveredProgramme] && (
        <div className="mt-1 text-[10px] text-muted-foreground/60 flex items-center gap-2">
          <span className="font-medium text-blue-200/80 truncate max-w-[200px]">
            {programmes[hoveredProgramme].title}
          </span>
          {programmes[hoveredProgramme].subtitle && (
            <span className="truncate max-w-[150px] italic opacity-60">
              {programmes[hoveredProgramme].subtitle}
            </span>
          )}
          <span className="shrink-0">
            {Math.round(programmes[hoveredProgramme].start_offset / 60)} min ago
          </span>
        </div>
      )}
    </div>
  );
}
