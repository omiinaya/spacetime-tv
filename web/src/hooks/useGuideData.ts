import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { api, ChannelGroup } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { formatTime, parseXmltvTime } from "@/lib/guideUtils";

const PAGE_SIZE = 60;
const CACHE_KEY = "stv_guide_data";

export function useGuideData() {
  const { settings } = useSettings();

  const [allData, setAllData] = useState<ChannelGroup[]>([]);
  const [totalChannels, setTotalChannels] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchedRef = useRef(0);

  // Build stream_id → category_id map from sessionStorage
  const streamToCat = useMemo(() => {
    const map = new Map<number, string>();
    try {
      const raw = sessionStorage.getItem("stv_live_all_slim");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.a) {
          for (const s of parsed.a) {
            map.set(s.id, s.c);
          }
        }
      }
    } catch {} // DOMException: storage quota or SyntaxError: malformed stored data
    return map;
  }, []);

  const loadPage = useCallback(
    async (offset: number) => {
      if (offset === 0) {
        try {
          const cached = sessionStorage.getItem(CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.data && Date.now() - parsed.ts < 300000) {
              setAllData(parsed.data);
              setTotalChannels(parsed.total);
              setLoading(false);
              fetchedRef.current = parsed.data.length;
              // Background refresh
              api.guide.get(0, PAGE_SIZE).then((d) => {
                const groups = d.channel_groups;
                setAllData(groups);
                setTotalChannels(d.total_channels);
                fetchedRef.current = groups.length;
                sessionStorage.setItem(
                  CACHE_KEY,
                  JSON.stringify({ data: groups, total: d.total_channels, ts: Date.now() })
                );
              }).catch(() => {});
              return;
            }
          }
        } catch {} // DOMException: storage quota or SyntaxError: malformed stored data
      }

      if (offset === 0) setLoading(true);
      else setLoadingMore(true);

      try {
        const d = await api.guide.get(offset, PAGE_SIZE);
        const groups = d.channel_groups;
        setTotalChannels(d.total_channels);

        if (offset === 0) {
          setAllData(groups);
          fetchedRef.current = groups.length;
          try {
            sessionStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ data: groups, total: d.total_channels, ts: Date.now() })
            );
          } catch {} // DOMException: storage quota
        } else {
          setAllData((prev) => {
            const seen = new Set(prev.map((g) => g.channel_id));
            const newGroups = groups.filter((g) => !seen.has(g.channel_id));
            return [...prev, ...newGroups];
          });
          fetchedRef.current = offset + groups.length;
        }
      } catch (e: unknown) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => { loadPage(0); }, [loadPage]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = document.querySelector("main");
    if (!sentinel || !root || allData.length >= totalChannels || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) loadPage(allData.length);
      },
      { root, rootMargin: "600px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [allData.length, totalChannels, loading, loadingMore, loadPage]);

  // SSE: listen for EPG refresh broadcasts from server
  useEffect(() => {
    let lastPing = Date.now();
    let staleTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const evt = new EventSource("/api/epg/events");

      evt.addEventListener("update", () => {
        // Invalidate sessionStorage cache and reload
        try { sessionStorage.removeItem(CACHE_KEY); } catch {} // DOMException: storage quota
        loadPage(0);
      });

      evt.addEventListener("ping", (_e: MessageEvent) => {
        lastPing = Date.now();
      });

      evt.onerror = () => {
        // EventSource auto-reconnects — but we add our own heartbeat check below
      };

      return evt;
    }

    let evt = connect();

    // Check for stale heartbeat every 30s; reconnect if no ping in 90s
    staleTimer = setInterval(() => {
      if (Date.now() - lastPing > 90_000) {
        // No heartbeat received — connection may be stale
        evt.close();
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          evt = connect();
        }, 1000);
      }
    }, 30_000);

    return () => {
      evt.close();
      if (staleTimer) clearInterval(staleTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [loadPage]);

  // Settings-based filtering
  const filteredChannels = useMemo(() => {
    if (!settings.languages.length && !settings.hiddenCategories.length && settings.showAdult) {
      return allData;
    }
    return allData.filter((g) => {
      if (g.stream_id != null) {
        const catId = streamToCat.get(g.stream_id);
        if (catId && settings.hiddenCategories.includes(catId)) return false;
      }
      return true;
    });
  }, [allData, settings, streamToCat]);

  // Time reference
  const now = useMemo(() => new Date(), []);

  // Timeline slots: now → +4h in 30-min steps
  const timeSlots = useMemo(() => {
    const slots: Date[] = [];
    const base = new Date(now);
    base.setMinutes(0, 0, 0);
    for (let i = 0; i <= 8; i++) {
      const d = new Date(base.getTime() + i * 30 * 60 * 1000);
      slots.push(d);
    }
    return slots;
  }, [now]);

  const nowPct = useMemo(() => {
    const totalMs = 4 * 60 * 60 * 1000;
    const elapsedMs = (now.getTime() - timeSlots[0]?.getTime()) || 0;
    return Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));
  }, [now, timeSlots]);

  return {
    allData,
    filteredChannels,
    totalChannels,
    loading,
    loadingMore,
    error,
    sentinelRef,
    timeSlots,
    now,
    nowPct,
    loadPage,
  };
}

// Re-export for convenience
export { formatTime, parseXmltvTime };
