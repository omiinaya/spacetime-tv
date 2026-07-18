import { useEffect, useState } from "react";
import { api, Movie, imageUrl } from "@/lib/api";
import { Film, Star } from "lucide-react";

interface SimilarMoviesProps {
  categoryId: string;
  currentId: number;
}

export default function SimilarMovies({
  categoryId,
  currentId,
}: SimilarMoviesProps) {
  const [movies, setMovies] = useState<Movie[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.movies
      .list(categoryId, 12, 0)
      .then((d) => {
        if (!cancelled) {
          setMovies(
            d.movies.filter((m) => m.stream_id !== currentId).slice(0, 10),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [categoryId, currentId]);

  if (movies.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-white/50 mb-3">
        More Like This
      </h3>
      <div
        className="flex gap-3 overflow-x-auto pb-2"
        style={{ touchAction: "manipulation" }}
      >
        {movies.map((m) => (
          <button
            key={m.stream_id}
            onClick={() => {
              // Navigate to this movie — reload the page with new movie
              window.history.pushState({}, "", `/watch/movie/${m.stream_id}`);
              window.location.reload();
            }}
            className="shrink-0 w-[110px] group"
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
                  <Film className="h-5 w-5 text-white/10" />
                </div>
              )}
              {m.rating && (
                <span className="absolute bottom-1.5 left-1.5 text-[10px] font-medium text-white/80 flex items-center gap-0.5">
                  <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                  {parseFloat(m.rating).toFixed(1)}
                </span>
              )}
            </div>
            <p className="text-[11px] leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {m.name}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
