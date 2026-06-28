/**
 * useRemuxPlayer — VOD remux playback via mpegts.js
 *
 * Extracted from useVideoPlayer.ts to improve maintainability.
 * Handles VOD stream setup via mpegts.js remux, progress saving,
 * and auto-advance to next episode.
 */

import { useEffect, useRef, useCallback } from "react";
import mpegts from "mpegts.js";
import { tryAutoplay, saveProgress, registerProgressSync } from "./usePlayerUtils";
import type { PlayPhase, ErrorType, VideoSourceType } from "./usePlayerTypes";

// Stats object from mpegts.js STATISTICS_INFO events
interface MpegtsStats {
  speed?: number;
  droppedFrames?: number;
  decodedFrames?: number;
}

export interface RemuxPlayerCallbacks {
  onPhaseChange: (phase: PlayPhase) => void;
  onError: (type: ErrorType, msg: string) => void;
  onStats: (speed: number, dropped: number, decoded: number) => void;
  onStall: () => void;
  onTimeUpdate: (currentTime: number, buffered: number) => void;
  onDuration: (dur: number) => void;
  onAutoplayMuted: () => void;
  clearLoadingTimeout: () => void;
  startLoadingTimeout: () => void;
  setTranscoding: (v: boolean) => void;
}

export function useRemuxPlayer(
  videoRef: React.RefObject<HTMLVideoElement>,
  callbacks: RemuxPlayerCallbacks,
) {
  const playerRef = useRef<mpegts.Player | null>(null);
  const remuxCleanupRef = useRef<(() => void) | null>(null);
  const vodUrlRef = useRef<string | null>(null);
  const vodTranscodeRef = useRef<boolean>(false);

  // ── Playback: VOD via mpegts remux ──────────────────────────
  const playVodRemux = useCallback(
    (
      streamUrl: string,
      startPos: number | null = null,
      isTranscode: boolean = false,
      type?: VideoSourceType,
      seriesId?: string,
      epId?: string,
      id?: string,
      watchKey?: string,
      onAutoAdvance?: (nextUrl: string) => void,
    ) => {
      const video = videoRef.current;
      if (!video) return;

      // Clean up existing
      if (remuxCleanupRef.current) {
        remuxCleanupRef.current();
        remuxCleanupRef.current = null;
      }
      video.removeAttribute("src");
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      const url =
        startPos && startPos > 5 ? `${streamUrl}?start=${startPos}` : streamUrl;

      vodUrlRef.current = streamUrl;
      vodTranscodeRef.current = isTranscode;

      const player = mpegts.createPlayer(
        { type: "mpegts", isLive: false, url },
        {
          enableWorkerForMSE: true,
          autoCleanupSourceBuffer: false,
        },
      );
      playerRef.current = player;
      let errorCount = 0;
      let timedOut = false;

      player.attachMediaElement(video);
      player.load();

      player.on(mpegts.Events.LOADING_COMPLETE, () => {
        tryAutoplay(video, callbacks.onAutoplayMuted).then(() => {});
      });

      let playStarted = false;
      const tryPlay = () => {
        if (playStarted) return;
        playStarted = true;
        callbacks.clearLoadingTimeout();
        tryAutoplay(video, callbacks.onAutoplayMuted).then(() => {});
      };
      player.on(mpegts.Events.MEDIA_INFO, () => tryPlay());

      const onTimeUpdate = () => {
        const ct = video.currentTime;
        const buf = video.buffered;
        const bufferedEnd = buf.length > 0 ? buf.end(buf.length - 1) : 0;
        callbacks.onTimeUpdate(ct, bufferedEnd);

        // Transition from loading→playing once time starts advancing
        if (video.currentTime > 0.1) {
          callbacks.clearLoadingTimeout();
          callbacks.onPhaseChange("playing");
        }
      };
      const onDurationChange = () => {
        const d = video.duration;
        if (d && isFinite(d)) callbacks.onDuration(d);
      };
      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("durationchange", onDurationChange);

      player.on(mpegts.Events.MEDIA_INFO, (info: { duration?: number }) => {
        if (info.duration && isFinite(info.duration)) {
          callbacks.onDuration(info.duration);
        }
      });

      // Track mpegts.js statistics for VOD connection quality
      player.on(mpegts.Events.STATISTICS_INFO, (stats: MpegtsStats) => {
        if (typeof stats?.speed === "number") {
          callbacks.onStats(
            stats.speed,
            typeof stats?.droppedFrames === "number" ? stats.droppedFrames : 0,
            typeof stats?.decodedFrames === "number"
              ? stats.decodedFrames
              : 0,
          );
        }
      });

      // Track buffering stalls
      const onWaiting = () => callbacks.onStall();
      video.addEventListener("waiting", onWaiting);

      player.on(
        mpegts.Events.ERROR,
        (_t: string, detail: { response?: { code?: number } }) => {
          errorCount++;
          if (detail?.response?.code === 0 || errorCount < 3) return;
          if (!timedOut) {
            callbacks.onError(
              "stream_error",
              "Stream interrupted. The connection may have been lost.",
            );
          }
        },
      );

      // Progress save interval
      let saveInterval: ReturnType<typeof setInterval> | null = null;
      if (watchKey) {
        let syncCounter = 0;
        saveInterval = setInterval(() => {
          saveProgress({
            video,
            watchKey,
            type: type || "movie",
            seriesId,
            epId,
            id,
            onAutoAdvance,
          });
          syncCounter++;
          if (syncCounter % 6 === 0) {
            registerProgressSync();
          }
        }, 5000);
      }

      const timeoutMs = isTranscode ? 45000 : 12000;
      const timeout = setTimeout(() => {
        if (!timedOut) {
          timedOut = true;
          if (isTranscode) {
            callbacks.onError(
              "transcode_timeout",
              "Video conversion is taking longer than expected. Try again.",
            );
          } else {
            callbacks.onError(
              "timeout",
              "Stream is taking too long to load. The server may be slow.",
            );
          }
        }
      }, timeoutMs);

      remuxCleanupRef.current = () => {
        clearTimeout(timeout);
        if (saveInterval) clearInterval(saveInterval);
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("durationchange", onDurationChange);
        video.removeEventListener("waiting", onWaiting);
      };
    },
    [videoRef, callbacks],
  );

  // ── Destroy ─────────────────────────────────────────────────
  const destroy = useCallback(() => {
    if (remuxCleanupRef.current) {
      remuxCleanupRef.current();
      remuxCleanupRef.current = null;
    }
    try {
      playerRef.current?.destroy();
    } catch {}
    playerRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => destroy();
  }, [destroy]);

  return {
    playerRef,
    remuxCleanupRef,
    vodUrlRef,
    vodTranscodeRef,
    playVodRemux,
    destroy,
  };
}
