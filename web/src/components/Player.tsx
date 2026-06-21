import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, ArrowLeft, Maximize, Minimize } from "lucide-react";

interface PlayerProps {
  type: "live" | "movie" | "series";
}

export default function Player({ type }: PlayerProps) {
  const { id, seriesId, epId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);

    let url = "";
    if (type === "live") {
      url = `/api/live/play/${id}`;
    } else if (type === "movie") {
      url = `/api/movies/play/${id}`;
    } else if (type === "series") {
      url = `/api/series/play/${seriesId}/${epId}`;
    }

    setStreamUrl(url);

    // The stream URL is a redirect — video.js/HLS will follow it
    if (videoRef.current) {
      videoRef.current.src = url;
      videoRef.current.load();
    }

    const timeout = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timeout);
  }, [type, id, seriesId, epId]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setFullscreen(false));
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="video-container flex items-center justify-center">
          <div className="text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                if (videoRef.current) {
                  videoRef.current.src = streamUrl;
                  videoRef.current.load();
                }
                setTimeout(() => setLoading(false), 3000);
              }}
              className="px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs hover:bg-primary/20"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back + title bar */}
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

      {/* Video */}
      <div
        ref={containerRef}
        className="video-container relative group"
      >
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
          onError={() => {
            setLoading(false);
            setError("Stream failed to load. The channel may be offline.");
          }}
          onPlaying={() => setLoading(false)}
        >
          <source src={streamUrl} type="application/x-mpegURL" />
          <source src={streamUrl} type="video/mp4" />
        </video>

        {/* Fullscreen overlay button */}
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
    </div>
  );
}
