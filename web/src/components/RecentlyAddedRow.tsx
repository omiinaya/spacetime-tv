import { Film } from "lucide-react";
import { imageUrl } from "@/lib/api";
import type { UnifiedMovie } from "@/lib/types";

interface RecentlyAddedRowProps {
  movies: UnifiedMovie[];
  onSelect: (movie: UnifiedMovie) => void;
}

export default function RecentlyAddedRow({
  movies,
  onSelect,
}: RecentlyAddedRowProps) {
  const recent = [...movies]
    .filter((m): m is typeof m & { added: string } => !!m.added)
    .sort((a, b) => parseInt(b.added) - parseInt(a.added))
    .slice(0, 12);

  if (recent.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground mb-3">
        Recently Added
      </h2>
      <div
        className="flex gap-3 overflow-x-auto pb-2 pr-4 md:pr-0"
        style={{ touchAction: "manipulation" }}
      >
        {recent.map((m) => (
          <button
            key={`recent-${m.stream_id}`}
            onClick={() => onSelect(m)}
            className="shrink-0 w-[120px] group"
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5">
              {m.stream_icon ? (
                <img
                  src={imageUrl(m.stream_icon)}
                  alt={m.name ? `${m.name} poster` : ""}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                  <Film className="h-6 w-6 text-white/10" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
              <span className="absolute bottom-1.5 left-1.5 text-[10px] font-medium text-white/80">
                {m.rating && `★${parseFloat(m.rating).toFixed(1)}`}
              </span>
            </div>
            <p className="text-[11px] leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {m.base_name || m.name}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
