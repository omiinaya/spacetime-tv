import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Film, Loader2, AlertCircle, RotateCcw, Star, Play } from "lucide-react";
import { api, Category, Movie } from "@/lib/api";

export default function Movies() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string>("");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.movies
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
    api.movies
      .list(activeCat)
      .then((d) => setMovies(d.movies))
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
          <Film className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Movies</h1>
          <p className="text-sm text-muted-foreground">
            {movies.length.toLocaleString()} movies ·{" "}
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
              if (activeCat) api.movies.list(activeCat).then(d => setMovies(d.movies)).catch(e => setError(e.message));
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

      {/* Poster grid */}
      <div className="poster-grid">
        {movies.map((m) => (
          <button
            key={m.stream_id}
            onClick={() => navigate(`/watch/movie/${m.stream_id}`)}
            className="group bg-card rounded-lg border border-border overflow-hidden hover:border-primary/30 transition-all"
          >
            <div className="aspect-[2/3] bg-muted relative overflow-hidden">
              {m.stream_icon ? (
                <img
                  src={m.stream_icon}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'><rect fill='%231a1a2e' width='2' height='3'/></svg>";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="h-8 w-8 text-muted-foreground/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <Play className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="p-2.5">
              <p className="text-xs font-medium line-clamp-2 leading-tight mb-1.5">
                {m.name}
              </p>
              {m.rating && (
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  <span className="text-[11px] text-muted-foreground">
                    {m.rating}
                  </span>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {movies.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Film className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No movies in this category</p>
        </div>
      )}
    </div>
  );
}
