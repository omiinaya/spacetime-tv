import { useState } from "react";
import type { LiveStream } from "@/lib/types";

interface SlimStream {
  id: number;
  n: string;
  c: string;
  ic?: string;
}
interface SlimAllCache {
  a: SlimStream[];
  ts: number;
}

const SLIM_ALL_KEY = "stv_live_all_slim";
const CATS_KEY = "stv_live_cats";
const TTL = 900000; // 15 minutes

/** Load a field from a cached JSON object in sessionStorage */
function loadCache<T>(key: string, field: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed[field] && Date.now() - parsed.ts < TTL) return parsed[field];
  } catch {} // DOMException: storage quota or disabled
  return null;
}

/** Restore slim all-streams cache to full LiveStream[] */
function restoreAllStreams(): LiveStream[] {
  try {
    const raw = sessionStorage.getItem(SLIM_ALL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SlimAllCache;
    if (parsed.a?.length && Date.now() - parsed.ts < TTL) {
      return parsed.a.map(
        (s) =>
          ({
            stream_id: s.id,
            name: s.n,
            stream_icon: "",
            category_id: s.c,
            num: 0,
            stream_type: "live",
            epg_channel_id: "",
            added: "",
            is_adult: 0,
            category_ids: [s.c],
            custom_sid: null,
            tv_archive: 0,
            direct_source: "",
            tv_archive_duration: 0,
          }) as LiveStream,
      );
    }
  } catch {} // DOMException: storage quota or disabled
  return [];
}

export function useLiveStreamCache() {
  const [categories, setCategories] = useState<
    import("@/lib/types").Category[]
  >(() => loadCache(CATS_KEY, "categories") ?? []);
  const [allStreams, setAllStreams] = useState<LiveStream[]>(() =>
    restoreAllStreams(),
  );
  const [loading, setLoading] = useState(
    () => !loadCache(CATS_KEY, "categories"),
  );
  const [allLoading, setAllLoading] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SLIM_ALL_KEY);
      if (!raw) return true;
      const parsed = JSON.parse(raw);
      return !(parsed.a?.length && Date.now() - parsed.ts < TTL);
    } catch {
      return true;
    }
  });

  /** Save categories to both state and sessionStorage */
  const saveCategories = (cats: import("@/lib/types").Category[]) => {
    setCategories(cats);
    if (cats?.length) {
      try {
        sessionStorage.setItem(
          CATS_KEY,
          JSON.stringify({ categories: cats, ts: Date.now() }),
        );
      } catch {} // DOMException: storage quota or disabled
    }
  };

  /** Save slim all-streams to state and sessionStorage */
  const saveAllStreams = (streams: LiveStream[]) => {
    setAllStreams(streams);
    if (streams?.length) {
      try {
        const slim: SlimStream[] = streams.map((s) => ({
          id: s.stream_id,
          n: s.name,
          c: s.category_id,
        }));
        sessionStorage.setItem(
          SLIM_ALL_KEY,
          JSON.stringify({ a: slim, ts: Date.now() }),
        );
      } catch {} // DOMException
    }
  };

  return {
    categories,
    allStreams,
    loading,
    allLoading,
    setLoading,
    setAllLoading,
    setCategories: saveCategories,
    setAllStreams: saveAllStreams,
  };
}
