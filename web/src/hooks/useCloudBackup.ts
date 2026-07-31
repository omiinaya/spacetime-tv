import { useState, useCallback } from "react";

const API = "/api/cloud";
const DEVICE_KEY = "stv_device_id";
const FAV_KEY = "stv_channel_favorites";
const WATCHLIST_KEY = "stv_watchlist";
const SERIES_WATCHLIST_KEY = "stv_watchlist_series";

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    const segments: string[] = [];
    for (let i = 0; i < 4; i++) {
      segments.push(Math.random().toString(36).substring(2, 10));
    }
    id = segments.join("-");
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function readLocalFavorites(): number[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (raw) return JSON.parse(raw);
  } catch {} // DOMException: storage quota or SyntaxError: malformed stored data
  return [];
}

/**
 * Normalize a stored watchlist into a number[] of IDs.
 *
 * Current storage format is a number[] (see lib/watchlist.ts). Older backups
 * may contain a record shape (`{"550": true}`) — accept both so restores
 * never corrupt the watchlist.
 */
function normalizeWatchlist(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is number => typeof v === "number");
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => Number(k))
      .filter((v) => Number.isFinite(v));
  }
  return [];
}

function readLocalWatchlist(): number[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw) return normalizeWatchlist(JSON.parse(raw));
  } catch {} // DOMException: storage quota or SyntaxError: malformed stored data
  return [];
}

function readLocalSeriesWatchlist(): number[] {
  try {
    const raw = localStorage.getItem(SERIES_WATCHLIST_KEY);
    if (raw) return normalizeWatchlist(JSON.parse(raw));
  } catch {} // DOMException: storage quota or SyntaxError: malformed stored data
  return [];
}

/**
 * Returns the device token — same as device_id for simplicity.
 * The server stores a SHA-256 hash of this token and requires it
 * on subsequent requests. This means only the device that created
 * a backup can read or modify it.
 */
function getDeviceToken(): string {
  return getDeviceId();
}

/**
 * Hook for cloud backup/restore of channel favorites and watchlists
 * (movies + series).
 *
 * Provides:
 *  - uploadBackup: saves current local state to the server
 *  - downloadBackup: fetches the most recent backup from the server
 *  - mergeFavorites: additively merges server favorites with local
 *  - backupStatus: { lastUpload, lastDownload } timestamps
 */
export function useCloudBackup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<number | null>(null);
  const [lastDownload, setLastDownload] = useState<number | null>(null);

  const uploadBackup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        device_id: getDeviceId(),
        favorites: readLocalFavorites(),
        watchlist: readLocalWatchlist(),
        series_watchlist: readLocalSeriesWatchlist(),
        timestamp: Date.now() / 1000,
      };
      const resp = await fetch(`${API}/backup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Token": getDeviceToken(),
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (data.status !== "ok") throw new Error(data.detail || "Upload failed");
      setLastUpload(Date.now() / 1000);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const downloadBackup = useCallback(async (): Promise<{
    favorites: number[];
    watchlist: number[];
    seriesWatchlist: number[];
  } | null> => {
    setLoading(true);
    setError(null);
    try {
      const deviceId = getDeviceId();
      const resp = await fetch(`${API}/backup?device_id=${deviceId}`, {
        headers: {
          "X-Device-Token": getDeviceToken(),
        },
      });
      const data = await resp.json();
      if (data.status !== "ok")
        throw new Error(data.detail || "Download failed");
      setLastDownload(Date.now() / 1000);
      return {
        favorites: Array.isArray(data.data?.favorites)
          ? data.data.favorites
          : [],
        watchlist: normalizeWatchlist(data.data?.watchlist),
        seriesWatchlist: normalizeWatchlist(data.data?.series_watchlist),
      };
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const mergeFavorites = useCallback(async (): Promise<number[] | null> => {
    setLoading(true);
    setError(null);
    try {
      const localFavs = readLocalFavorites();
      const resp = await fetch(`${API}/merge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Token": getDeviceToken(),
        },
        body: JSON.stringify({
          device_id: getDeviceId(),
          favorites: localFavs,
        }),
      });
      const data = await resp.json();
      if (data.status !== "ok") throw new Error(data.detail || "Merge failed");
      setLastDownload(Date.now() / 1000);
      return data.favorites;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Merge failed");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    uploadBackup,
    downloadBackup,
    mergeFavorites,
    backupStatus: { lastUpload, lastDownload, loading, error },
  };
}
