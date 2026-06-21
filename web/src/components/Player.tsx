import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, ArrowLeft, Maximize, Minimize } from "lucide-react";
import mpegts from "mpegts.js";

interface PlayerProps {
  type: "live" | "movie" | "series";
}

export default function Player({ type }: PlayerProps) {
  const { id, seriesId, epId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<mpegts.Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const retryKey = useRef(0);

  // ── Build stream URL ──────────────────────────────────────────
  const streamPath =
    type === "live"
      ? `/api/stream/live/${id}`
      : type === "movie"
      ? `/api/stream/movie/${id}`
      : `/api/stream/series/${seriesId}/${epId}`;

  const isLive = type === "live";

  // ── Play via mpegts.js (live MPEG-TS only) ────────────────────
  const playLive = () => {
    const video = videoRef.current;
    if (!video || !streamPath) return;

    // Reset source in case we were in native mode
    video.removeAttribute("src");

    const player = mpegts.createPlayer({
      type: "mpegts",
      isLive: true,
      url: streamPath,
    });
    playerRef.current = player;

    let errorCount = 0;
    let timedOut = false;

    player.attachMediaElement(video);
    player.load();

    player.on(mpegts.Events.LOADING_COMPLETE, () => {
      setLoading(false);
      video.play().catch(() => {});
    });

    player.on(mpegts.Events.ERROR, (_type: string, detail: any) => {
      errorCount++;
      if (detail?.response?.code === 0 || errorCount < 3) return;
      if (!timedOut) {
        setLoading(false);
        setError("Stream unavailable. The channel may be offline from the provider.");
      }
    });

    player.on(mpegts.Events.STATISTICS_INFO, () => {
      if (loading) setLoading(false);
    });

    const timeout = setTimeout(() => {
      if (loading) {
        timedOut = true;
        setLoading(false);
        setError("Stream timed out. The channel may be offline.");
      }
    }, 12000);

    return () => clearTimeout(timeout);
  };

  // ── Play via native <video> (VOD: movies / series) ────────────
  const playVod = () => {
    const video = videoRef.current;
    if (!video) return;

    // Destroy any mpegts player
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    // Add a cache-busting param so the browser doesn't use a stale cached response
    const url = `${streamPath}?_=${retryKey.current}`;

    const onLoaded = () => {
      setLoading(false);
      video.play().catch(() => {});
    };

    const onError = () => {
      const mediaError = video.error;
      let msg = "Playback failed.";
      if (mediaError) {
        switch (mediaError.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            msg = "Playback aborted.";
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            msg = "Network error. The stream may be unavailable.";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            msg = "Decode error. The video format may not be supported.";
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            msg = "Video format not supported by your browser.";
            break;
        }
      }
      setLoading(false);
      setError(msg);
    };

    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });

    video.src = url;
    video.load();

    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setError("Stream timed out. The video may be unavailable.");
      }
    }, 20000);

    return () => {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    };
  };

  // ── Main effect ───────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    let cleanup: (() => void) | undefined;

    if (isLive) {
      cleanup = playLive();
    } else {
      cleanup = playVod();
    }

    return () => {
      cleanup?.();
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamPath, isLive, retryKey.current]);

  // ── Retry ─────────────────────────────────────────────────────
  const retry = () => {
    retryKey.current++;
    setError(null);
    setLoading(true);
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    const video = videoRef.current;
    if (!video) return;

    if (isLive) {
      playLive();
    } else {
      playVod();
    }
  };

  // ── Fullscreen toggle ─────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setFullscreen(false));
    }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <span className="text-sm font-medium text-muted-foreground">
          {type === "live" ? "Live TV" : type === "movie" ? "Movie" : "Series"}
        </span>
      </div>

      {error ? (
        <div className="video-container flex items-center justify-center">
          <div className="text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={retry}
              className="px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs hover:bg-primary/20"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="video-container relative group">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            className="w-full h-full"
          />
          <button
            onClick={toggleFullscreen}
            className="absolute bottom-3 right-3 p-2 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
          >
            {fullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
