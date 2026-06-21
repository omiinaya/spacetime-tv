import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, ArrowLeft, Maximize, Minimize } from "lucide-react";
import mpegts from "mpegts.js";

interface PlayerProps {
  type: "live" | "movie" | "series";
}

// Remember which streams need transcoding across retries
const transcodeCache = new Map<string, boolean>();

interface ProbeResult {
  codec: string;
  codec_long?: string;
  width?: number;
  height?: number;
  profile?: string;
}

async function probeStream(streamId: string): Promise<ProbeResult> {
  try {
    const resp = await fetch(`/api/live/probe/${streamId}`);
    return await resp.json();
  } catch {
    return { codec: "unknown" };
  }
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
  const [transcoding, setTranscoding] = useState(false);
  const [probing, setProbing] = useState(false);

  const loadingRef = useRef(true);
  const retryKey = useRef(0);
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

      player.attachMediaElement(video);
      player.load();

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
      };
    },
    [streamPath, transcodePath, setDone, setBusy]
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

  // ── Main effect — probe first, then play the right way ───────
  useEffect(() => {
    let cancelled = false;

    const startPlayback = async () => {
      setBusy();
      setError(null);
      setTranscoding(false);
      setProbing(false);

      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      // Check transcode cache first
      let needsTranscode = isLive && transcodeCache.has(id || "");

      // For live TV, probe the stream if not cached
      if (isLive && !transcodeCache.has(id || "") && id) {
        setProbing(true);
        const result = await probeStream(id);
        if (cancelled) return;
        setProbing(false);

        if (result.codec === "hevc") {
          needsTranscode = true;
          transcodeCache.set(id, true);
        } else {
          transcodeCache.set(id, false);
        }
      }

      if (cancelled) return;

      if (needsTranscode) setTranscoding(true);

      const cleanupFn = isLive ? playLive(needsTranscode) : playVod();
      // Store cleanup ref for manual retry
    };

    startPlayback();

    return () => {
      cancelled = true;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [streamPath, isLive, setBusy, playLive, playVod, id]);

  // ── Retry ─────────────────────────────────────────────────────
  const retry = () => {
    retryKey.current++;
    setError(null);
    setBusy();
    setTranscoding(false);

    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    const needsTranscode = isLive && (transcodeCache.has(id || "") ? (transcodeCache.get(id || "") || false) : false);
    if (needsTranscode) setTranscoding(true);

    const cleanupFn = isLive ? playLive(needsTranscode) : playVod();
    // Keep cleanup managed by effect
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
                {probing && (
                  <span className="text-[10px] text-blue-400">
                    Detecting stream format...
                  </span>
                )}
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
