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

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Clean up previous player
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    let streamPath = "";
    if (type === "live") {
      streamPath = `/api/stream/live/${id}`;
    } else if (type === "movie") {
      streamPath = `/api/stream/movie/${id}`;
    } else if (type === "series") {
      streamPath = `/api/stream/series/${seriesId}/${epId}`;
    }

    const video = videoRef.current;
    if (!video || !streamPath) return;

    if (mpegts.isSupported()) {
      const player = mpegts.createPlayer({
        type: "mpegts",
        isLive: type === "live",
        url: streamPath,
      });
      playerRef.current = player;

      player.attachMediaElement(video);
      player.load();

      player.on(mpegts.Events.LOADING_COMPLETE, () => {
        setLoading(false);
        video.play().catch(() => {});
      });

      player.on(mpegts.Events.ERROR, () => {
        setLoading(false);
        setError("Stream unavailable. The channel may be offline.");
      });

      player.on(mpegts.Events.STATISTICS_INFO, () => {
        if (loading) setLoading(false);
      });
    } else {
      setError("Your browser does not support MSE (Media Source Extensions).");
      setLoading(false);
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [type, id, seriesId, epId]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setFullscreen(false));
    }
  };

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
              onClick={() => {
                setError(null);
                setLoading(true);
                if (playerRef.current) {
                  playerRef.current.destroy();
                  playerRef.current = null;
                }
                const newPath = type === "live"
                  ? `/api/stream/live/${id}`
                  : type === "movie"
                  ? `/api/stream/movie/${id}`
                  : `/api/stream/series/${seriesId}/${epId}`;
                const video = videoRef.current;
                if (video && mpegts.isSupported()) {
                  const player = mpegts.createPlayer({
                    type: "mpegts",
                    isLive: type === "live",
                    url: newPath,
                  });
                  playerRef.current = player;
                  player.attachMediaElement(video);
                  player.load();
                  player.on(mpegts.Events.LOADING_COMPLETE, () => {
                    setLoading(false);
                    video.play().catch(() => {});
                  });
                  player.on(mpegts.Events.ERROR, () => {
                    setLoading(false);
                    setError("Stream unavailable.");
                  });
                }
              }}
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
