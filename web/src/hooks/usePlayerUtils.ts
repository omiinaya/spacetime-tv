/**
 * Shared utility functions for video player hooks.
 *
 * Pure functions and localStorage helpers extracted from useVideoPlayer.ts
 * to improve maintainability and testability.
 */

import { queueProgress } from "@/lib/watchProgressSync";

// ── Transcode cache (module-level) ────────────────────────────
export const transcodeCache = new Map<string, string>();

// ── localStorage helpers ─────────────────────────────────────
/**
 * Read the stored watch position for a given key.
 * Returns null if no position exists or on parse error.
 */
export function getWatchPos(key: string): number | null {
  try {
    const d = JSON.parse(localStorage.getItem("stv_watch") || "{}");
    return d[key]?.pos ?? null;
  } catch {
    return null;
  }
}

/**
 * Save watch position for a given key to localStorage and queue
 * for PWA background sync.
 */
export function saveWatchPos(key: string, pos: number) {
  try {
    const d = JSON.parse(localStorage.getItem("stv_watch") || "{}");
    d[key] = { pos, ts: Date.now() };
    localStorage.setItem("stv_watch", JSON.stringify(d));
  } catch {} // DOMException: storage quota
  // Also queue for PWA background sync (non-blocking)
  queueProgress(key, pos);
}

export function getVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem("stv_volume") || "0.8");
    return isNaN(v) ? 0.8 : v;
  } catch {
    return 0.8;
  }
}

export function saveVolume(v: number) {
  try {
    localStorage.setItem("stv_volume", String(v));
  } catch {} // DOMException: storage quota
}

export function getMuted(): boolean {
  try {
    return localStorage.getItem("stv_muted") === "true";
  } catch {
    return false;
  }
}

export function saveMuted(m: boolean) {
  try {
    localStorage.setItem("stv_muted", String(m));
  } catch {} // DOMException: storage quota
}

// ── Autoplay ──────────────────────────────────────────────────
/**
 * Try to autoplay a video element. Browsers block autoplay with sound.
 * Strategy: try unmuted first, if rejected → mute and retry.
 * Returns true if playback started (possibly muted), false if fully blocked.
 * When muted fallback is used, onMutedFallback() is called so the caller
 * can sync React state without persisting to localStorage.
 */
export async function tryAutoplay(
  video: HTMLVideoElement,
  onMutedFallback?: () => void,
): Promise<boolean> {
  try {
    await video.play();
    return true; // unmuted autoplay succeeded
  } catch {
    // Autoplay with sound was blocked — retry muted
    try {
      video.muted = true;
      await video.play();
      onMutedFallback?.();
      return true; // muted autoplay succeeded
    } catch {
      return false; // fully blocked (no user gesture at all)
    }
  }
}

// ── Stream probe ─────────────────────────────────────────────
import type { ProbeResult } from "./usePlayerTypes";

/**
 * Probe a stream to detect its codec. Uses a 10-second AbortController
 * timeout. Returns the probe result or { codec: "unknown" } on failure.
 */
export async function probeStream(
  url: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  // If an external signal fires first, forward it to our controller
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
    return await r.json();
  } catch {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
    return { codec: "unknown" };
  }
}

// ── Time formatter ────────────────────────────────────────────
/**
 * Format seconds to a human-readable time string.
 * Examples: 0→"0:00", 45→"0:45", 125→"2:05", 3661→"1:01:01"
 */
export function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = Math.floor(s % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ── Watch progress persistence helpers ────────────────────────
import { saveSeriesProgress, saveMovieProgress } from "@/lib/continueWatching";
import type { VideoSourceType } from "./usePlayerTypes";

interface SaveProgressParams {
  video: HTMLVideoElement;
  watchKey: string;
  type: VideoSourceType;
  seriesId?: string;
  epId?: string;
  id?: string;
  onAutoAdvance?: (nextUrl: string) => void;
}

/**
 * Save watch progress to localStorage and continue-watching store.
 * Handles series (with metadata from sessionStorage) and movies.
 * Also handles auto-advance to next episode at ≥95% progress.
 * Should be called from a setInterval in each playback sub-hook.
 */
export function saveProgress(params: SaveProgressParams): void {
  const { video, watchKey, type, seriesId, epId, id, onAutoAdvance } = params;
  if (video.paused) return;
  const t = video.currentTime;
  if (t <= 5) return;

  saveWatchPos(watchKey, t);

  if (type === "series" && seriesId) {
    let metaName = "",
      metaCover = "",
      metaSeason = 0,
      metaEpNum = 0,
      metaEpTitle = "";
    let metaDuration = video?.duration || 0;
    try {
      const raw = sessionStorage.getItem(`stv_series_meta_${seriesId}`);
      if (raw) {
        const m = JSON.parse(raw);
        metaName = m.name || "";
        metaCover = m.cover || m.episodeImage || "";
        metaSeason = m.seasonNumber || 0;
        metaEpNum = m.episodeNum || 0;
        metaEpTitle = m.episodeTitle || "";
        if (m.durationSeconds) metaDuration = m.durationSeconds;
      }
    } catch {} // DOMException: storage quota

    saveSeriesProgress({
      seriesId: parseInt(seriesId),
      seriesName: metaName,
      cover: metaCover,
      seasonNumber: metaSeason,
      episodeNum: metaEpNum,
      episodeId: epId || "",
      episodeTitle: metaEpTitle,
      progressSeconds: t,
      durationSeconds: metaDuration,
      updatedAt: Date.now(),
    });

    // Auto-advance: at >= 95% progress, check for next episode
    if (onAutoAdvance && metaDuration > 0 && t / metaDuration >= 0.95) {
      const autoAdvanced = sessionStorage.getItem(
        `stv_auto_advanced_${seriesId}`,
      );
      if (!autoAdvanced && seriesId) {
        sessionStorage.setItem(`stv_auto_advanced_${seriesId}`, "1");
        const currentIdx = parseInt(
          sessionStorage.getItem(`stv_series_current_idx_${seriesId}`) || "0",
          10,
        );
        const activeSeason = parseInt(
          sessionStorage.getItem(`stv_series_active_season_${seriesId}`) || "1",
          10,
        );
        const episodesRaw = sessionStorage.getItem(
          `stv_series_episodes_${seriesId}_${activeSeason}`,
        );
        if (episodesRaw) {
          try {
            const episodes = JSON.parse(episodesRaw) as {
              id: string;
              episode_num: number;
              title: string;
            }[];
            const nextEp = episodes[currentIdx + 1];
            if (nextEp) {
              sessionStorage.setItem(
                `stv_series_current_idx_${seriesId}`,
                String(currentIdx + 1),
              );
              setTimeout(() => {
                // Guard: storage can be unavailable (private mode, SSR,
                // or test env teardown after the timer was scheduled).
                try {
                  sessionStorage.removeItem(`stv_auto_advanced_${seriesId}`);
                } catch {
                  /* storage unavailable — flag stays set, harmless */
                }
              }, 1000);
              onAutoAdvance(`/watch/series/${seriesId}/${nextEp.id}`);
            }
          } catch {} // DOMException: storage quota
        }
      }
    }
  } else if (type === "movie" && id) {
    let movieName = "",
      moviePoster = "";
    try {
      const raw = sessionStorage.getItem("stv_movie_meta");
      if (raw) {
        const m = JSON.parse(raw);
        if (String(m.id) === id) {
          movieName = m.name || "";
          moviePoster = m.poster || "";
        }
      }
    } catch {} // DOMException: storage quota

    saveMovieProgress({
      movieId: parseInt(id),
      movieName,
      poster: moviePoster,
      progressSeconds: t,
      durationSeconds: video?.duration || 0,
      updatedAt: Date.now(),
    });
  }
}

/**
 * The Background Sync API (ServiceWorkerRegistration.sync) is not yet
 * declared in TypeScript's standard DOM lib. This local interface fills
 * the gap without requiring @types/background-sync.
 */
interface SyncManager {
  register(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface ServiceWorkerRegistrationWithSync extends ServiceWorkerRegistration {
  readonly sync: SyncManager;
}

/**
 * Register a PWA background sync for watch progress.
 * Should be called periodically (e.g., every ~30s).
 */
export function registerProgressSync(): void {
  navigator.serviceWorker?.ready
    .then((reg) =>
      (reg as ServiceWorkerRegistrationWithSync).sync.register(
        "sync-watch-progress",
      ),
    )
    .catch(() => {});
}
