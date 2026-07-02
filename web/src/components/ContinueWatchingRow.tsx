import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { getContinueWatching, removeSeriesProgress, type SeriesProgress } from "@/lib/continueWatching";
import { imageUrl } from "@/lib/api";

interface ContinueWatchingRowProps {
  navigate: (path: string) => void;
}

export default function ContinueWatchingRow({ navigate }: ContinueWatchingRowProps) {
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
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 pr-4 md:pr-0" style={{ touchAction: "manipulation" }}>
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
