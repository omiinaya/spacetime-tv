import { useNavigate } from "react-router";

interface MediaCastSectionProps {
  cast: string;
  director: string;
}

/**
 * Shared Cast & Director display used by both MovieOverlay and SeriesOverlay.
 * Each cast member name is clickable and navigates to /person/{name}.
 */
export function MediaCastSection({ cast, director }: MediaCastSectionProps) {
  const navigate = useNavigate();
  if (!cast && !director) return null;

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
      {cast && (
        <div>
          <span className="text-white/30">Cast: </span>
          <span className="text-white/60">
            {cast.split(",").map((name, i) => (
              <span key={i}>
                {i > 0 && <span className="text-white/20">, </span>}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/person/${encodeURIComponent(name.trim())}`);
                  }}
                  className="hover:text-primary transition-colors cursor-pointer inline"
                >
                  {name.trim()}
                </button>
              </span>
            ))}
          </span>
        </div>
      )}
      {director && (
        <div>
          <span className="text-white/30">Director: </span>
          <span className="text-white/60">{director}</span>
        </div>
      )}
    </div>
  );
}
