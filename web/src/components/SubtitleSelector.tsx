import { useState, useEffect, useCallback } from "react";
import { Subtitles, Loader2 } from "lucide-react";

interface SubtitleTrack {
  index: number;
  language: string;
  title: string;
  codec: string;
}

interface SubtitleSelectorProps {
  mediaType: "movie" | "series";
  streamId: number | string;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function SubtitleSelector({ mediaType, streamId, videoRef }: SubtitleSelectorProps) {
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTrack, setActiveTrack] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Probe for subtitle tracks
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/subtitles/probe/${mediaType}/${streamId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          setTracks(data.tracks || []);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [mediaType, streamId]);

  // When a track is selected, load the VTT and add a <track> element
  const selectTrack = useCallback(
    (index: number | null) => {
      const video = videoRef.current;
      if (!video) return;

      // Remove all existing subtitle tracks
      Array.from(video.querySelectorAll("track")).forEach((t) => t.remove());

      // Reset active track
      setActiveTrack(null);

      // Disable subtitles
      const textTracks = video.textTracks;
      for (let i = 0; i < textTracks.length; i++) {
        textTracks[i].mode = "hidden";
      }

      if (index === null) {
        setOpen(false);
        return;
      }

      // Add a new <track> element
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = tracks.find((t) => t.index === index)?.language || "sub";
      track.srclang = tracks.find((t) => t.index === index)?.language || "und";
      track.src = `/api/subtitles/${mediaType}/${streamId}/${index}`;
      track.default = true;

      track.addEventListener("load", () => {
        track.track.mode = "showing";
        setActiveTrack(index);
      });

      track.addEventListener("error", () => {
        setError("Failed to load subtitles");
      });

      video.appendChild(track);
      setOpen(false);
    },
    [videoRef, tracks, mediaType, streamId],
  );

  const langLabel = (t: SubtitleTrack) => {
    const parts = [t.language];
    if (t.title) parts.push(t.title);
    return parts.join(" — ");
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-white/60 hover:text-white transition-colors p-2 sm:p-1 min-w-[40px] min-h-[40px] flex items-center justify-center ${
          activeTrack !== null ? "text-yellow-400" : ""
        }`}
        aria-label="Subtitles"
      >
        <Subtitles className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[8rem] shadow-xl max-h-60 overflow-y-auto">
          {/* Off */}
          <button
            onClick={() => selectTrack(null)}
            className={`block w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
              activeTrack === null ? "text-blue-400" : "text-white/70"
            }`}
          >
            Off
          </button>

          {loading && (
            <div className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Detecting…
            </div>
          )}

          {error && (
            <div className="px-4 py-2 text-xs text-red-400">{error}</div>
          )}

          {!loading && !error && tracks.length === 0 && (
            <div className="px-4 py-2 text-xs text-muted-foreground">
              No subtitles available
            </div>
          )}

          {tracks.map((t) => (
            <button
              key={t.index}
              onClick={() => selectTrack(t.index)}
              className={`block w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
                activeTrack === t.index ? "text-blue-400" : "text-white/70"
              }`}
            >
              {langLabel(t)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
