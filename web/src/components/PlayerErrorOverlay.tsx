import { memo } from "react";
import { AlertCircle, Loader2, Tv } from "lucide-react";

interface PlayerErrorOverlayProps {
  phase: string;
  errorMsg: string | null;
  errorType: string | null;
  onRetry: () => void;
}

function PlayerErrorOverlay({
  phase,
  errorMsg,
  errorType,
  onRetry,
}: PlayerErrorOverlayProps) {
  if (phase !== "error") return null;

  return (
    <div
      role="alert"
      className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 gap-4"
    >
      {errorType === "retry_exhausted" ? (
        <Tv className="w-10 h-10 text-orange-400" />
      ) : errorType === "transcode_timeout" ? (
        <Loader2 className="w-10 h-10 text-yellow-400 animate-spin" />
      ) : errorType === "empty_stream" ? (
        <AlertCircle className="w-10 h-10 text-orange-400" />
      ) : errorType === "not_supported" ? (
        <AlertCircle className="w-10 h-10 text-yellow-400" />
      ) : (
        <AlertCircle className="w-10 h-10 text-red-400" />
      )}
      <p className="text-white/70 text-sm max-w-md text-center">
        {errorMsg || "Playback failed."}
      </p>
      {errorType === "retry_exhausted" && (
        <p className="text-white/40 text-xs max-w-sm text-center">
          The channel may be offline or experiencing high traffic.
        </p>
      )}
      {errorType === "not_supported" && (
        <p className="text-white/40 text-xs max-w-sm text-center">
          Try switching to transcode mode or use a different browser.
        </p>
      )}
      {errorType === "empty_stream" && (
        <p className="text-white/40 text-xs max-w-sm text-center">
          The CDN edge server does not have this content. Try again or pick a
          different source.
        </p>
      )}
      {errorType === "transcode_timeout" && (
        <p className="text-white/40 text-xs max-w-sm text-center">
          The video requires on-the-fly conversion which is taking too long.
        </p>
      )}
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

// Scalar/memo-safe props (onRetry is a useCallback in useVideoPlayer) — memo
// so it doesn't re-render on every player timeupdate while playing.
export default memo(PlayerErrorOverlay);
