import { useNavigate } from "react-router";
import { useEffect } from "react";
import { Circle, Play, Trash2, Loader2, Video, Clock } from "lucide-react";
import { useRecordings, type Recording } from "@/hooks/useRecording";
import { cn } from "@/lib/utils";

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDuration(started: string, stopped?: string): string {
  const start = new Date(started).getTime();
  const end = stopped ? new Date(stopped).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function RecordingCard({
  rec,
  onPlay,
  onDelete,
}: {
  rec: Recording;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isActive = rec.status === "recording";

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors",
        isActive && "border-red-500/50 bg-red-500/5",
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
          isActive
            ? "bg-red-500/10 text-red-500"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isActive ? (
          <Circle className="h-5 w-5 animate-pulse" fill="currentColor" />
        ) : (
          <Video className="h-5 w-5" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm truncate">{rec.name}</h3>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(rec.started_at, rec.stopped_at)}
          </span>
          {rec.size_bytes !== undefined && rec.size_bytes > 0 && (
            <span>{formatSize(rec.size_bytes)}</span>
          )}
          <span>{formatDate(rec.started_at)}</span>
        </div>
        {isActive && (
          <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-red-500 font-medium">
            <Circle className="h-2 w-2 animate-pulse" fill="currentColor" />
            Recording…
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {!isActive && (
          <button
            onClick={() => onPlay(rec.id)}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`Play ${rec.name}`}
          >
            <Play className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => onDelete(rec.id)}
          className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
          aria-label={`Delete ${rec.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function RecordingsPage() {
  const navigate = useNavigate();
  const { recordings, loading, deleteRecording, refresh } = useRecordings();

  // Poll while any recording is active
  useEffect(() => {
    const hasActive = recordings.some((r) => r.status === "recording");
    if (!hasActive) return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [recordings, refresh]);

  const handlePlay = (recordingId: string) => {
    navigate(`/watch/recording/${recordingId}`);
  };

  const handleDelete = async (recordingId: string) => {
    if (!confirm("Delete this recording?")) return;
    await deleteRecording(recordingId);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Recordings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : recordings.length === 0 ? (
        <div className="text-center py-20">
          <Video className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">No recordings yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Press the record button while watching live TV to start recording
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recordings.map((rec) => (
            <RecordingCard
              key={rec.id}
              rec={rec}
              onPlay={handlePlay}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
