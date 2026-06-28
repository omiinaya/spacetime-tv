/**
 * useMpegtsPlayer — Live MPEG-TS playback via mpegts.js
 *
 * Extracted from useVideoPlayer.ts to improve maintainability.
 * Handles live TV stream setup, reconnection, DVR tracking,
 * and stats collection.
 */

import { useEffect, useRef, useCallback } from "react";
import mpegts from "mpegts.js";
import { tryAutoplay } from "./usePlayerUtils";
import type { PlayPhase, ErrorType } from "./usePlayerTypes";

// Stats object from mpegts.js STATISTICS_INFO events
interface MpegtsStats {
  speed?: number;
  droppedFrames?: number;
  decodedFrames?: number;
}

export interface MpegtsPlayerCallbacks {
  onPhaseChange: (phase: PlayPhase) => void;
  onError: (type: ErrorType, msg: string) => void;
  onAutoplayMuted: () => void;
  onStats: (speed: number, dropped: number, decoded: number) => void;
  onStall: () => void;
  onPlaying: () => void;
  onLiveTimeUpdate: (
    ct: number,
    start: number,
    end: number,
    behind: number,
    isBehind: boolean,
  ) => void;
  clearLoadingTimeout: () => void;
  startLoadingTimeout: () => void;
}

export function useMpegtsPlayer(
  videoRef: React.RefObject<HTMLVideoElement>,
  callbacks: MpegtsPlayerCallbacks,
) {
  const playerRef = useRef<mpegts.Player | null>(null);
  const mpegtsCleanupRef = useRef<(() => void) | null>(null);

  // ── Playback: MPEG-TS via mpegts.js (live TV only) ──────────
  const playMPEGTS = useCallback(
    (url: string, liveFlag: boolean, isTranscode: boolean) => {
      const video = videoRef.current;
      if (!video) return;

      // Clean up any existing player
      if (mpegtsCleanupRef.current) {
        mpegtsCleanupRef.current();
        mpegtsCleanupRef.current = null;
      }
      video.removeAttribute("src");
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      callbacks.onPhaseChange("loading");
      callbacks.onError("timeout", ""); // clear error
      if (isTranscode) {
        // Signal transcoding — parent manages `transcoding` state
      }
      callbacks.startLoadingTimeout();

      const streamUrl = url;
      let reconnectAttempts = 0;
      const MAX_RECONNECTS = 100;

      const createPlayer = () => {
        const player = mpegts.createPlayer(
          {
            type: "mpegts",
            isLive: liveFlag,
            url: streamUrl,
          },
          {
            enableWorkerForMSE: false,
            liveBufferLatencyChasing: false,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 360,
            autoCleanupMinBackwardDuration: 240,
            liveSync: true,
            liveSyncMaxLatency: 2,
            liveSyncTargetLatency: 1,
            liveSyncPlaybackRate: 1.1,
          },
        );
        playerRef.current = player;

        player.attachMediaElement(video);
        player.load();

        let loadStarted = false;
        player.on(mpegts.Events.MEDIA_INFO, () => {
          if (loadStarted) return;
          loadStarted = true;
          tryAutoplay(video, callbacks.onAutoplayMuted).then((started) => {
            if (!started) {
              callbacks.clearLoadingTimeout();
              // Fully blocked — show paused state
              callbacks.onPhaseChange("paused");
            }
          });
        });

        player.on(mpegts.Events.LOADING_COMPLETE, () => {
          if (!loadStarted) {
            loadStarted = true;
            tryAutoplay(video, callbacks.onAutoplayMuted).then((started) => {
              if (!started) {
                callbacks.clearLoadingTimeout();
                callbacks.onPhaseChange("paused");
              }
            });
          }
          reconnectAttempts = 0;
        });

        let playingFired = false;
        const onPlaying = () => {
          if (!playingFired) {
            playingFired = true;
            callbacks.clearLoadingTimeout();
            callbacks.onPlaying();
          }
        };
        video.addEventListener("playing", onPlaying);

        let lastStatsTime = Date.now();
        player.on(mpegts.Events.STATISTICS_INFO, (stats: MpegtsStats) => {
          lastStatsTime = Date.now();
          if (typeof stats?.speed === "number") {
            callbacks.onStats(stats.speed, 0, 0);
          }
          if (typeof stats?.droppedFrames === "number") {
            callbacks.onStats(
              typeof stats?.speed === "number" ? stats.speed : 0,
              stats.droppedFrames,
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
            if (detail?.response?.code === 0) return;
            if (!liveFlag) return;

            if (reconnectAttempts < MAX_RECONNECTS) {
              reconnectAttempts++;
              try {
                player.destroy();
              } catch {}
              playerRef.current = null;
              video.removeEventListener("playing", onPlaying);
              setTimeout(() => {
                if (playerRef.current === null) {
                  createPlayer();
                }
              }, Math.min(reconnectAttempts * 1000, 5000));
            }
          },
        );

        // DVR time tracking
        const onTimeUpdate = () => {
          if (!video || !liveFlag) return;
          const ct = video.currentTime;
          const buf = video.buffered;
          if (buf.length > 0) {
            const s = buf.start(0);
            const e = buf.end(buf.length - 1);
            const behind = Math.max(0, e - ct);
            callbacks.onLiveTimeUpdate(ct, s, e, behind, behind > 3);
          }
        };
        video.addEventListener("timeupdate", onTimeUpdate);

        // Health check — if no stats for 15s, reconnect live
        const healthCheck = setInterval(() => {
          if (Date.now() - lastStatsTime > 15000 && liveFlag) {
            clearInterval(healthCheck);
            if (reconnectAttempts < MAX_RECONNECTS) {
              reconnectAttempts++;
              try {
                player.destroy();
              } catch {}
              playerRef.current = null;
              video.removeEventListener("playing", onPlaying);
              setTimeout(() => {
                if (playerRef.current === null) {
                  createPlayer();
                }
              }, Math.min(reconnectAttempts * 1000, 5000));
            }
          }
        }, 5000);

        mpegtsCleanupRef.current = () => {
          clearInterval(healthCheck);
          video.removeEventListener("playing", onPlaying);
          video.removeEventListener("waiting", onWaiting);
          video.removeEventListener("timeupdate", onTimeUpdate);
        };
      };

      createPlayer();
    },
    [videoRef, callbacks],
  );

  // ── Destroy ─────────────────────────────────────────────────
  const destroy = useCallback(() => {
    if (mpegtsCleanupRef.current) {
      mpegtsCleanupRef.current();
      mpegtsCleanupRef.current = null;
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
    mpegtsCleanupRef,
    playMPEGTS,
    destroy,
  };
}
