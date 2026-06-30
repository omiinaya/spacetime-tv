import { useState, useEffect, useCallback, useRef } from "react";

interface Recording {
  id: string;
  stream_id: number;
  name: string;
  started_at: string;
  stopped_at?: string;
  status: "recording" | "completed" | "failed";
  file: string;
  size_bytes?: number;
}

interface UseRecordingReturn {
  activeRecordingId: string | null;
  isRecording: boolean;
  startRecording: (streamId: number, name?: string) => Promise<string | null>;
  stopRecording: () => Promise<void>;
}

export function useRecording(): UseRecordingReturn {
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const recordingIdRef = useRef<string | null>(null);

  const isRecording = activeRecordingId !== null;

  const startRecording = useCallback(async (sid: number, name?: string) => {
    try {
      const params = new URLSearchParams({ stream_id: String(sid) });
      if (name) params.set("stream_name", name);
      const r = await fetch(`/api/record/start?${params}`, { method: "POST" });
      if (!r.ok) {
        console.error("Failed to start recording:", r.status);
        return null;
      }
      const data = await r.json();
      recordingIdRef.current = data.recording_id;
      setActiveRecordingId(data.recording_id);
      return data.recording_id;
    } catch (e) {
      console.error("Record start error:", e);
      return null;
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const rid = recordingIdRef.current;
    if (!rid) return;
    try {
      const r = await fetch(`/api/record/stop?recording_id=${rid}`, { method: "POST" });
      if (r.ok) {
        recordingIdRef.current = null;
        setActiveRecordingId(null);
      }
    } catch (e) {
      console.error("Record stop error:", e);
    }
  }, []);

  // Auto-stop on unmount
  useEffect(() => {
    return () => {
      const rid = recordingIdRef.current;
      if (rid) {
        fetch(`/api/record/stop?recording_id=${rid}`, { method: "POST" }).catch(() => {});
      }
    };
  }, []);

  return {
    activeRecordingId,
    isRecording,
    startRecording: (sid: number, name?: string) => startRecording(sid, name),
    stopRecording,
  };
}

export function useRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecordings = useCallback(async () => {
    try {
      const r = await fetch("/api/recordings");
      if (r.ok) {
        const data = await r.json();
        setRecordings(data.recordings || []);
      }
    } catch (e) {
      console.error("Failed to fetch recordings:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const deleteRecording = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/recordings/${id}`, { method: "DELETE" });
      if (r.ok) {
        setRecordings(prev => prev.filter(rec => rec.id !== id));
      }
    } catch (e) {
      console.error("Failed to delete recording:", e);
    }
  }, []);

  return { recordings, loading, deleteRecording, refresh: fetchRecordings };
}

export type { Recording };
