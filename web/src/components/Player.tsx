import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, ArrowLeft, Maximize, Minimize } from "lucide-react";
import mpegts from "mpegts.js";

interface PlayerProps {
  type: "live" | "movie" | "series";
}

// Remember which streams need transcoding across retries
const transcodeCache = new Map<string, boolean>();

export default function Player({ type }: PlayerProps) {
  const { id, seriesId, epId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<mpegts.Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [transcoding, setTranscoding] = useState(false);

  const loadingRef = useRef(true);
  const retryKey = useRef(0);
  const transcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triedTranscodeRef = useRef(false);

  // ── Build stream URL ──────────────────────────────────────────
  const streamPath =
    type === "live"
      ? `/api/stream/live/${id}`
      : type === "movie"
      ? `/api/stream/movie/${id}`
      : `/api/stream/series/${seriesId}/${epId}`;

  const transcodePath =
    type === "live" ? `/api/stream/live/${id}/transcode` : null;

  const isLive = type === "live";

  const setDone = useCallback(() => {
    loadingRef.current = false;
    setLoading(false);
  }, []);

  const setBusy = useCallback(() => {
    loadingRef.current = true;
    setLoading(true);
  }, []);

  // Clear transcode detection timer
  const clearTranscodeTimer = useCallback(() => {
    if (transcodeTimerRef.current) {
      clearTimeout(transcodeTimerRef.current);
      transcodeTimerRef.current = null;
    }
  }, []);

  // ── Play via mpegts.js (live MPEG-TS) ─────────────────────────
  const playLive = useCallback(
    (useTranscode: boolean) => {
      const video = videoRef.current;
      if (!video || !streamPath) return () => {};

      video.removeAttribute("src");

      const url = useTranscode && transcodePath ? transcodePath : streamPath;
      if (useTranscode) setTranscoding(true);

      const player = mpegts.createPlayer({
        type: "mpegts",
        isLive: true,
        url,
      });
      playerRef.current = player;

      let errorCount = 0;
      let timedOut = false;
      let videoDetected = false;

      player.attachMediaElement(video);
      player.load();

      // HEVC detection: check if video frames are actually rendering
      if (!useTranscode && isLive) {
        transcodeTimerRef.current = setTimeout(() => {
          if (!videoDetected && videoRef.current && videoRef.current.videoWidth === 0) {
            // No video frames — likely HEVC or unsupported codec
            // Switch to transcode
            transcodeCache.set(id || "", true);
            triedTranscodeRef.current = true;
            retryKey.current++;
            setBusy();
            setError(null);
            if (playerRef.current) {
              playerRef.current.destroy();
              playerRef.current = null;
            }
            playLive(true);
          }
        }, 4000);
      }

      player.on(mpegts.Events.LOADING_COMPLETE, () => {
        setDone();
        video.play().catch(() => {});
      });

      player.on(mpegts.Events.ERROR, (_type: string, detail: any) => {
        errorCount++;
        if (detail?.response?.code === 0 || errorCount < 3) return;
        if (!timedOut) {
          setDone();
          if (useTranscode) {
            setError("Stream unavailable even with transcoding. The channel may be offline.");
          } else {
            setError("Stream unavailable. The channel may be offline from the provider.");
          }
        }
      });

      player.on(mpegts.Events.STATISTICS_INFO, () => {
        if (loadingRef.current) setDone();
        // Check if video is actually rendering
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          videoDetected = true;
          clearTranscodeTimer();
        }
      });

      const timeout = setTimeout(() => {
        if (loadingRef.current) {
          timedOut = true;
          setDone();
          setError("Stream timed out. The channel may be offline.");
        }
      }, 12000);

      return () => {
        clearTimeout(timeout);
        clearTranscodeTimer();
      };
    },
    [streamPath, transcodePath, isLive, id, setDone, setBusy, clearTranscodeTimer]
  );

  // ── Play via native <video> (VOD: movies / series) ────────────
  const playVod = useCallback(() => {
    const video = videoRef.current;
    if (!video) return () => {};

    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    const url = `${streamPath}?_=${retryKey.current}`;

    const onLoaded = () => {
      setDone();
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
      setDone();
      setError(msg);
    };

    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });

    video.src = url;
    video.load();

    const timeout = setTimeout(() => {
      if (loadingRef.current) {
        setDone();
        setError("Stream timed out. The video may be unavailable.");
      }
    }, 20000);

    return () => {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    };
  }, [streamPath, setDone]);

  // ── Main effect ───────────────────────────────────────────────
  useEffect(() => {
    setBusy();
    setError(null);
    setTranscoding(false);
    clearTranscodeTimer();

    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    // Check if this stream previously needed transcoding
    const needsTranscode = isLive && transcodeCache.has(id || "");
    if (needsTranscode) setTranscoding(true);

    const cleanupFn = isLive ? playLive(needsTranscode) : playVod();

    return () => {
      cleanupFn?.();
      clearTranscodeTimer();
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [streamPath, isLive, setBusy, playLive, playVod, clearTranscodeTimer, id]);

  // ── Retry ─────────────────────────────────────────────────────
  const retry = () => {
    retryKey.current++;
    setError(null);
    setBusy();
    setTranscoding(false);
    clearTranscodeTimer();
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    const needsTranscode = isLive && transcodeCache.has(id || "");
    if (needsTranscode) setTranscoding(true);

    const cleanupFn = isLive ? playLive(needsTranscode) : playVod();
    // Keep cleanup stored via the effect
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
        {transcoding && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
            Transcoding H.265→H.264
          </span>
        )}
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
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                {transcoding && (
                  <span className="text-[10px] text-yellow-500">
                    Converting video codec...
                  </span>
                )}
              </div>
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
