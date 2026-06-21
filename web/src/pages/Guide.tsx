import { useEffect, useState } from "react";
import { CalendarClock, Loader2, AlertCircle, RotateCcw, Tv } from "lucide-react";
import { api, Programme, Channel } from "@/lib/api";
import { Skeleton } from "@/components/Skeleton";

export default function Guide() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGuide = () => {
    setError(null);
    setLoading(true);
    api.guide
      .get()
      .then((d) => {
        setProgrammes(d.programmes);
        setChannels(d.channels);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadGuide();
  }, []);

  // Group programmes by channel
  const byChannel: Record<string, Programme[]> = {};
  for (const p of programmes) {
    const key = p.channel_name || p.channel;
    if (!byChannel[key]) byChannel[key] = [];
    byChannel[key].push(p);
  }

  // Build time slots (hourly)
  const now = new Date();
  const hours: string[] = [];
  for (let i = -1; i <= 4; i++) {
    const d = new Date(now);
    d.setHours(now.getHours() + i, 0, 0, 0);
    hours.push(
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {loading ? (
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="w-20 h-5" />
            <Skeleton className="w-44 h-3.5" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">TV Guide</h1>
            <p className="text-sm text-muted-foreground">
              {programmes.length.toLocaleString()} programmes ·{" "}
              {Object.keys(byChannel).length} channels
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
          <button
            onClick={loadGuide}
            className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* EPG Grid */}
      {loading ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="p-8 space-y-3">
            {/* Table header skeleton */}
            <div className="flex gap-3 pb-2 border-b border-border/50 mb-2">
              <Skeleton className="w-36 h-4" />
              {hours.map((_, i) => (
                <Skeleton key={i} className="w-20 h-4" />
              ))}
            </div>
            {/* Row skeletons */}
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-36 h-8" />
                {hours.map((_, j) => (
                  <Skeleton key={j} className="w-20 h-8 opacity-60" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="epg-container rounded-lg border border-border">
          <table className="epg-table">
            <thead>
              <tr>
                <th className="epg-channel-name">Channel</th>
                {hours.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(byChannel).map(([chName, progs]) => (
                <tr key={chName}>
                  <td className="epg-channel-name text-xs">{chName}</td>
                  {hours.map((h) => (
                    <td key={h} className="text-xs text-muted-foreground">
                      {progs
                        .filter((p) => {
                          try {
                            const start = new Date(
                              p.start.slice(0, 4) +
                                "-" +
                                p.start.slice(4, 6) +
                                "-" +
                                p.start.slice(6, 8) +
                                "T" +
                                p.start.slice(8, 10) +
                                ":" +
                                p.start.slice(10, 12) +
                                ":" +
                                p.start.slice(12, 14) +
                                "Z"
                            );
                            const slotStart = new Date(now);
                            slotStart.setHours(
                              now.getHours() + hours.indexOf(h) - 1,
                              0,
                              0,
                              0
                            );
                            const slotEnd = new Date(slotStart);
                            slotEnd.setHours(slotEnd.getHours() + 1);
                            return start >= slotStart && start < slotEnd;
                          } catch {
                            return false;
                          }
                        })
                        .slice(0, 2)
                        .map((p) => (
                          <div
                            key={p.start}
                            className={`mb-0.5 px-1 py-0.5 rounded text-[10px] leading-tight ${
                              p.is_live
                                ? "bg-primary/10 text-primary font-medium"
                                : "bg-muted/50"
                            }`}
                          >
                            {p.title}
                          </div>
                        ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {Object.keys(byChannel).length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No EPG data available</p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                Guide data is loaded from the IPTV provider&apos;s XMLTV feed
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
