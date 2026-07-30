import { Calendar, Clock, ExternalLink } from "lucide-react";

interface MediaInfoBarProps {
  /** Release date or first air date */
  date?: string;
  /** Duration string (e.g. "2h 15m", "45m") */
  duration?: string;
  /** TMDB status string */
  status?: string;
  /** TMDB ID for link to themoviedb.org */
  tmdbId?: string | number;
  /** Optional content type for TMDB URL path (default: "movie") */
  mediaType?: "movie" | "tv";
  /** Optional homepage URL */
  homepage?: string;
}

/**
 * Shared metadata info bar for MovieOverlay and SeriesOverlay.
 * Shows release date, duration, status, TMDB link, and optional homepage.
 */
export function MediaInfoBar({
  date,
  duration,
  status,
  tmdbId,
  mediaType = "movie",
  homepage,
}: MediaInfoBarProps) {
  const hasAny = !!(date || duration || status || tmdbId || homepage);
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/40">
      {date && (
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {date}
        </span>
      )}
      {duration && (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {duration}
        </span>
      )}
      {status && <span>{status}</span>}
      {tmdbId && (
        <a
          href={`https://www.themoviedb.org/${mediaType}/${tmdbId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-white/70 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          TMDB
        </a>
      )}
      {homepage && (
        <a
          href={homepage}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-white/70 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Homepage
        </a>
      )}
    </div>
  );
}
