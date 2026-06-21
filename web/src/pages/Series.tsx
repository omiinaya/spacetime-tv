import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Tv2,
  Loader2,
  AlertCircle,
  RotateCcw,
  Star,
  Play,
  ChevronDown,
} from "lucide-react";
import { api, Category, Series } from "@/lib/api";

export default function SeriesPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string>("");
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<any>(null);
  const [epLoading, setEpLoading] = useState(false);

  useEffect(() => {
    api.series
      .categories()
      .then((d) => {
        setCategories(d.categories);
        if (d.categories.length > 0) setActiveCat(d.categories[0].category_id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeCat) return;
    setError(null);
    setExpanded(null);
    api.series
      .list(activeCat)
      .then((d) => setSeries(d.series))
      .catch((e) => setError(e.message));
  }, [activeCat]);

  const toggleExpand = async (s: Series) => {
    if (expanded === s.series_id) {
      setExpanded(null);
      return;
    }
    setExpanded(s.series_id);
    setEpLoading(true);
    try {
      const d = await api.series.details(s.series_id);
      setEpisodes(d.episodes || d.info?.episodes || {});
    } catch {
      setEpisodes(null);
    }
    setEpLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Tv2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Series</h1>
          <p className="text-sm text-muted-foreground">
            {series.length.toLocaleString()} series ·{" "}
            {categories.length} categories
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
          <button
            onClick={() => {
              setError(null);
              if (activeCat) api.series.list(activeCat).then(d => setSeries(d.series)).catch(e => setError(e.message));
            }}
            className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-2">
        {categories.map((cat) => (
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

      {/* Series grid with expandable episodes */}
      <div className="poster-grid">
        {series.map((s) => (
          <div
            key={s.series_id}
            className="bg-card rounded-lg border border-border overflow-hidden"
          >
            {/* Poster */}
            <div className="aspect-[2/3] bg-muted relative overflow-hidden">
              {s.cover ? (
                <img
                  src={s.cover}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'><rect fill='%231a1a2e' width='2' height='3'/></svg>";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Tv2 className="h-8 w-8 text-muted-foreground/30" />
                </div>
              )}
            </div>

            <div className="p-2.5">
              <p className="text-xs font-medium line-clamp-2 leading-tight mb-1">
                {s.name}
              </p>
              <div className="flex items-center gap-2 mb-2">
                {s.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    <span className="text-[11px] text-muted-foreground">
                      {s.rating}
                    </span>
                  </div>
                )}
                {s.releaseDate && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {s.releaseDate.slice(0, 4)}
                  </span>
                )}
              </div>

              {/* Episodes expander */}
              <button
                onClick={() => toggleExpand(s)}
                className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-muted hover:bg-muted/80 text-xs text-muted-foreground transition-colors"
              >
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${
                    expanded === s.series_id ? "rotate-180" : ""
                  }`}
                />
                Episodes
              </button>

              {expanded === s.series_id && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {epLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                  ) : episodes ? (
                    Object.entries(episodes).map(
                      ([season, eps]: [string, any]) => (
                        <div key={season}>
                          <p className="text-[10px] text-muted-foreground/60 px-1 py-0.5">
                            Season {season}
                          </p>
                          {Array.isArray(eps) &&
                            eps.slice(0, 8).map((ep: any) => (
                              <button
                                key={ep.id}
                                onClick={() =>
                                  navigate(
                                    `/watch/series/${s.series_id}/${ep.id}`
                                  )
                                }
                                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-left group"
                              >
                                <Play className="h-2.5 w-2.5 text-primary opacity-0 group-hover:opacity-100" />
                                <span className="text-[11px] truncate">
                                  {ep.title || `Episode ${ep.episode_num || ""}`}
                                </span>
                              </button>
                            ))}
                        </div>
                      )
                    )
                  ) : (
                    <p className="text-[10px] text-muted-foreground/50 text-center py-2">
                      No episode data
                    </p>
                  )}
                </div>
              )}

              {/* Genre */}
              {s.genre && (
                <p className="text-[10px] text-muted-foreground/50 mt-1.5 line-clamp-1">
                  {s.genre}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {series.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv2 className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No series in this category</p>
        </div>
      )}
    </div>
  );
}
