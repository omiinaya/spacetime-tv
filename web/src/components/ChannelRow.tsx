import { useRef } from "react";
import { Play, Tv, Circle, Clock } from "lucide-react";
import type { ChannelGroup, Programme } from "@/lib/api";
import { programmeProgress, programmeTimeRange } from "@/lib/guideUtils";

// ── ChannelRow ─────────────────────────────────────────────────

export function ChannelRow({
  group,
  now,
  onPlay,
}: {
  group: ChannelGroup;
  now: Date;
  onPlay: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasStream = group.stream_id != null;

  const liveProgramme = group.programmes.find((p) => p.is_live);
  const upcomingProgrammes = group.programmes.filter((p) => !p.is_live);

  const sorted = [
    ...(liveProgramme ? [liveProgramme] : []),
    ...upcomingProgrammes.sort((a, b) => a.start.localeCompare(b.start)),
  ];

  return (
    <div className="flex py-2 px-4 hover:bg-muted/30 transition-colors group">
      {/* Channel info */}
      <button
        onClick={onPlay}
        disabled={!hasStream}
        className={`shrink-0 w-[184px] flex items-center gap-2.5 text-left pr-3 ${
          hasStream ? "cursor-pointer hover:opacity-80" : "cursor-default opacity-60"
        }`}
        aria-label={hasStream ? `Watch ${group.channel_name}` : `${group.channel_name} — no stream available`}
      >
        <div className="shrink-0 w-9 h-9 rounded-lg bg-[#141420] flex items-center justify-center overflow-hidden">
          {group.channel_icon ? (
            <img
              src={group.channel_icon}
              alt={group.channel_name ? `${group.channel_name} icon` : ""}
              className="w-7 h-7 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Tv className="h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-tight truncate">{group.channel_name}</p>
          {hasStream && (
            <Play className="h-3 w-3 text-primary/50 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </button>

      {/* Programme cards */}
      <div ref={scrollRef} className="flex-1 flex gap-2 overflow-x-auto scrollbar-none min-w-0">
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

// ── ProgrammeCard ──────────────────────────────────────────────

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
      aria-label={`${programme.title || "Programme"}, ${timeStr}`}
      className={`shrink-0 flex flex-col justify-center min-w-[140px] max-w-[220px] px-3 py-2 rounded-lg text-left transition-all duration-200 ${
        isLive
          ? "bg-primary/10 border border-primary/15 hover:bg-primary/15 hover:border-primary/30 cursor-pointer"
          : "bg-card border border-border hover:border-primary/20 cursor-pointer"
      } ${!onPlay ? "opacity-50 cursor-default" : ""}`}
    >
      <p className={`text-xs font-medium leading-tight line-clamp-2 ${isLive ? "text-primary" : ""}`}>
        {programme.title || "No title"}
      </p>
      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeStr}</p>
      {isLive && (
        <div className="mt-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Circle className="h-1.5 w-1.5 fill-red-500 text-red-500" />
            <span className="text-[9px] font-semibold text-red-500 tracking-wide">LIVE</span>
          </div>
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
