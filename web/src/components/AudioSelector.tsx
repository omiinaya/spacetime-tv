import { useState, useEffect } from "react";
import { Volume2, Loader2 } from "lucide-react";

interface AudioTrack {
  index: number;
  language: string;
  title: string;
  codec: string;
  channels: number;
}

interface AudioSelectorProps {
  mediaType: "movie" | "series";
  streamId: number | string;
  onSwitchTrack?: (audioIndex: number) => void;
}

export function AudioSelector({
  mediaType,
  streamId,
  onSwitchTrack,
}: AudioSelectorProps) {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/audio/probe/${mediaType}/${streamId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setTracks(data.tracks || []);
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mediaType, streamId]);

  const label = (t: AudioTrack) => {
    const parts: string[] = [];
    if (t.language && t.language !== "und")
      parts.push(t.language.toUpperCase());
    if (t.title) parts.push(t.title);
    parts.push(t.codec.toUpperCase());
    if (t.channels > 0) parts.push(`${t.channels}ch`);
    return parts.join(" — ");
  };

  if (tracks.length <= 1 && !loading) return null; // hide if only one track

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-white/60 hover:text-white transition-colors p-2 sm:p-1 min-w-[40px] min-h-[40px] flex items-center justify-center"
        aria-label="Audio track"
      >
        <Volume2 className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[10rem] shadow-xl max-h-60 overflow-y-auto">
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
              Single audio track
            </div>
          )}

          {tracks.map((t) => (
            <button
              key={t.index}
              onClick={() => {
                onSwitchTrack?.(t.index);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              {label(t)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
