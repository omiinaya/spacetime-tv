import { useState, type ReactNode } from "react";
import { X, Star, Play, Loader2, AlertCircle, Clock, Calendar } from "lucide-react";
import { imageUrl } from "@/lib/api";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

interface MediaOverlayProps {
  onClose: () => void;
  bannerUrl?: string;
  posterUrl?: string;
  title: string;
  genres: string[];
  rating?: number;
  year?: string;
  plot?: string;
  /** Extra info items shown in the meta row (e.g. runtime, languages, seasons) */
  metaItems?: string[];
  /** Content inserted between title and the close button area (e.g. language selector) */
  titleActions?: ReactNode;
  /** Content inserted below the meta row / plot (e.g. season tabs, episode list) */
  children?: ReactNode;
  /** Play button — rendered after the meta row */
  playButton?: ReactNode;
  /** Trailer iframe embed — rendered below play button */
  trailerEmbed?: ReactNode;
  loading?: boolean;
  error?: string | null;
}

export default function MediaOverlay({
  onClose,
  bannerUrl,
  posterUrl,
  title,
  genres,
  rating,
  year,
  plot,
  metaItems,
  titleActions,
  children,
  playButton,
  trailerEmbed,
  loading = false,
  error = null,
}: MediaOverlayProps) {
  useLockBodyScroll(onClose);
  const [showFullPlot, setShowFullPlot] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md animate-in fade-in duration-300"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full h-full sm:h-auto sm:max-w-[960px] sm:max-h-[92vh] sm:rounded-2xl bg-[#0a0a0f] border-0 sm:border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 zoom-in-95 duration-300">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 p-3 sm:p-2 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* ── Hero Banner ─────────────────────────────────────── */}
        <div className="relative shrink-0 min-h-[180px] sm:h-[400px] bg-[#141420]">
          {bannerUrl ? (
            <>
              <img
                src={imageUrl(bannerUrl)}
                alt={`${title} banner`}
                className="w-full h-full object-cover opacity-60"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f]/90 via-transparent to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] via-[#101020] to-[#0a0a0f]" />
          )}

          {/* Hero content */}
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-10 flex gap-3 sm:gap-5 items-end">
            {posterUrl && (
              <div className="w-[80px] sm:w-[160px] shrink-0 rounded-lg overflow-hidden ring-1 ring-white/10 shadow-2xl -mb-2">
                <img
                  src={imageUrl(posterUrl)}
                  alt={`${title} poster`}
                  className="w-full aspect-[2/3] object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            <div className="flex-1 min-w-0 pb-1">
              {/* Genre tags */}
              {genres.length > 0 && (
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {genres.slice(0, 3).map((g) => (
                    <span
                      key={g}
                      className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-white/10 text-white/80"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <h2 className="text-lg sm:text-3xl font-bold text-white leading-tight mb-1 sm:mb-2">
                {title}
              </h2>

              {/* Title actions (e.g. language selector) */}
              {titleActions}

              {/* Meta row */}
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs sm:text-sm text-white/70">
                {rating && (
                  <span className="inline-flex items-center gap-1 font-semibold text-yellow-400">
                    <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-yellow-400 text-yellow-400" />
                    {rating}
                  </span>
                )}
                {year && <span>{year}</span>}
                {metaItems?.map((item, i) => (
                  <span key={i}>{item}</span>
                ))}
              </div>

              {/* Play button */}
              {playButton && (
                <div className="mt-2 sm:mt-3">{playButton}</div>
              )}
              {/* Trailer embed */}
              {trailerEmbed}
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:px-10 sm:py-6 space-y-4 sm:space-y-5">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-white/30" />
              </div>
            )}
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {!loading && !error && (
              <>
                {/* Plot */}
                {plot && (
                  <div>
                    <p
                      className={`text-sm text-white/60 leading-relaxed ${
                        !showFullPlot && plot.length > 200 ? "line-clamp-2" : ""
                      }`}
                    >
                      {plot}
                    </p>
                    {plot.length > 200 && (
                      <button
                        onClick={() => setShowFullPlot(!showFullPlot)}
                        className="mt-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                      >
                        {showFullPlot ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                )}

                {/* Children (season tabs, episode list, etc.) */}
                {children}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
