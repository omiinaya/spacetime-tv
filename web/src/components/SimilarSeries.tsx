import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, imageUrl } from "@/lib/api";
import { Series } from "@/lib/types";
import { Tv2, Star } from "lucide-react";

interface SimilarSeriesProps {
  categoryId: string;
  currentId: number;
}

export default function SimilarSeries({
  categoryId,
  currentId,
}: SimilarSeriesProps) {
  const navigate = useNavigate();
  const [seriesList, setSeriesList] = useState<Series[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.series
      .list(categoryId, 12, 0)
      .then((d) => {
        if (!cancelled) {
          setSeriesList(
            d.series.filter((s) => s.series_id !== currentId).slice(0, 10),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [categoryId, currentId]);

  if (seriesList.length === 0) return null;

  const openSeries = (s: Series) => {
    navigate("/series", { state: { openSeries: s } });
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-white/50 mb-3">
        More Like This
      </h3>
      <div
        className="flex gap-3 overflow-x-auto pb-2"
        style={{ touchAction: "manipulation" }}
      >
        {seriesList.map((s) => (
          <button
            key={s.series_id}
            onClick={() => openSeries(s)}
            className="shrink-0 w-[110px] group text-left"
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5">
              {s.cover ? (
                <img
                  src={imageUrl(s.cover)}
                  alt={s.name ? `${s.name} poster` : ""}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                  <Tv2 className="h-5 w-5 text-white/10" />
                </div>
              )}
              {s.rating && (
                <span className="absolute bottom-1.5 left-1.5 text-[10px] font-medium text-white/80 flex items-center gap-0.5">
                  <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                  {parseFloat(s.rating).toFixed(1)}
                </span>
              )}
            </div>
            <p className="text-[11px] leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {s.name}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
