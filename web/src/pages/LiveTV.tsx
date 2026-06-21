import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tv, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { api, Category, LiveStream } from "@/lib/api";

export default function LiveTV() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string>("");
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.live
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
    api.live
      .streams(activeCat)
      .then((d) => setStreams(d.streams))
      .catch((e) => setError(e.message));
  }, [activeCat]);

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
          <Tv className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Live TV</h1>
          <p className="text-sm text-muted-foreground">
            {streams.length.toLocaleString()} channels ·{" "}
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
              if (activeCat) api.live.streams(activeCat).then(d => setStreams(d.streams)).catch(e => setError(e.message));
            }}
            className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
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

      {/* Channel grid */}
      <div className="channel-grid">
        {streams.map((s) => (
          <button
            key={s.stream_id}
            onClick={() => navigate(`/watch/live/${s.stream_id}`)}
            className="channel-card bg-[var(--card)] rounded-lg border border-border p-3 text-left hover:border-primary/30"
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

      {streams.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No channels in this category</p>
        </div>
      )}
    </div>
  );
}
