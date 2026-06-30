import { useEffect, useRef, useState } from "react";
import { api, GuideNowResult } from "@/lib/api";

const BATCH_INTERVAL = 30000; // refresh every 30 seconds

/**
 * Hook for fetching "now playing" EPG programme info for Live TV channels.
 * Accepts a list of stream_ids and returns a Map<stream_id, programme_title>.
 * Auto-refreshes every 30 seconds.
 */
export function useNowPlaying(streamIds: number[]) {
  const [programmes, setProgrammes] = useState<Map<number, GuideNowResult>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (streamIds.length === 0) return;

    const fetchNow = async () => {
      try {
        // Only fetch first 200 to avoid huge URLs
        const batch = streamIds.slice(0, 200);
        const res = await api.guide.now(batch);
        const m = new Map<number, GuideNowResult>();
        for (const [sid, prog] of Object.entries(res.programmes)) {
          if (prog) m.set(Number(sid), prog);
        }
        setProgrammes(m);
      } catch {
        // Silently fail — EPG data is nice-to-have
      }
    };

    fetchNow();
    timerRef.current = setInterval(fetchNow, BATCH_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [streamIds.join(",")]);

  const getNowPlaying = (streamId: number): string | null => {
    const prog = programmes.get(streamId);
    return prog ? prog.title : null;
  };

  const getNowPlayingChannel = (streamId: number): string | null => {
    const prog = programmes.get(streamId);
    return prog ? prog.channel_name : null;
  };

  return { programmes, getNowPlaying, getNowPlayingChannel };
}
