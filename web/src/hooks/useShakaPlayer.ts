/**
 * useShakaPlayer — shaka-player fallback for HLS/DASH playback
 *
 * Evaluated as part of P3.45: provides robust DRM support, ManagedMediaSource
 * for iOS Safari, and DASH/CMAF capability as a complement to hls.js.
 *
 * Used as a fallback when hls.js encounters an unrecoverable error.
 */
import { useEffect, useRef, useCallback } from "react";
import shaka from "shaka-player";
import { tryAutoplay, saveProgress, registerProgressSync } from "./usePlayerUtils";
import type { PlayPhase, ErrorType, VideoSourceType } from "./usePlayerTypes";

export interface ShakaPlayerCallbacks {
  onPhaseChange: (phase: PlayPhase) => void;
  onError: (type: ErrorType, msg: string) => void;
  onStall: () => void;
  onTimeUpdate: (currentTime: number, buffered: number) => void;
  onDuration: (dur: number) => void;
  onAutoplayMuted: () => void;
  clearLoadingTimeout: () => void;
}

export function useShakaPlayer(
  videoRef: React.RefObject<HTMLVideoElement>,
  callbacks: ShakaPlayerCallbacks,
) {
  const playerRef = useRef<shaka.Player | null>(null);
  const shakaCleanupRef = useRef<(() => void) | null>(null);

  const playShaka = useCallback(
    (
      playlistUrl: string,
      mimeType: string = "application/x-mpegURL",
      startPos: number | null = null,
      type?: VideoSourceType,
      seriesId?: string,
      epId?: string,
      id?: string,
      watchKey?: string,
      onAutoAdvance?: (nextUrl: string) => void,
    ) => {
      const video = videoRef.current;
      if (!video) return;

      if (shakaCleanupRef.current) {
        shakaCleanupRef.current();
        shakaCleanupRef.current = null;
      }
      if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
      video.removeAttribute("src");

      // shaka-player may not be compiled with HLS support; polyfill if needed
      if (shaka.Player.isBrowserSupported()) {
        const player = new shaka.Player();
        playerRef.current = player;
        player.attach(video, /* preferNativeHls= */ false).then(() => {
          // Configure: prefer HLS, enable live sync
          player.configure({
            streaming: {
              alwaysStreamText: false,
              liveSync: { enabled: true, latencyTarget: 15 },
              bufferingGoal: 30,
              rebufferingGoal: 10,
            },
            preferNativeHls: false,
          });

          player.load(playlistUrl, startPos ?? undefined, mimeType).then(() => {
            callbacks.onPhaseChange("playing");
            callbacks.onDuration(video.duration || 0);
            tryAutoplay(video, callbacks.onAutoplayMuted).then((started) => {
              if (!started) callbacks.onPhaseChange("paused");
            });
          }).catch((err) => {
            callbacks.onError("stream_error", `shaka-player load failed: ${err?.message || "unknown"}`);
          });
        }).catch(() => {
          callbacks.onError("not_supported", "shaka-player failed to attach to video element.");
          return;
        });

        player.addEventListener("error", (event) => {
          const data = (event as any).detail;
          if (data && data.severity === shaka.util.Error.Severity.CRITICAL) {
            callbacks.onError("stream_error", "Playback error. Try again.");
          }
        });

        if (startPos && startPos > 5) {
          // shaka-player handles startPos via load()
        }
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Native HLS fallback (Safari)
        video.src = playlistUrl;
        video.addEventListener("loadedmetadata", () => {
          callbacks.onDuration(video.duration || 0);
          if (startPos && startPos > 5) video.currentTime = startPos;
          callbacks.onPhaseChange("playing");
          tryAutoplay(video, callbacks.onAutoplayMuted).then((started) => {
            if (!started) callbacks.onPhaseChange("paused");
          });
        }, { once: true });
      } else {
        callbacks.onError("not_supported", "This video format is not supported by your browser.");
        return;
      }

      const onTimeUpdate = () => {
        const buf = video.buffered;
        callbacks.onTimeUpdate(video.currentTime, buf.length > 0 ? buf.end(buf.length - 1) : 0);
      };
      const onDurationChange = () => {
        const d = video.duration;
        if (d && isFinite(d)) callbacks.onDuration(d);
      };
      const onEnded = () => callbacks.onPhaseChange("paused");
      const onWaiting = () => callbacks.onStall();

      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("durationchange", onDurationChange);
      video.addEventListener("ended", onEnded);
      video.addEventListener("waiting", onWaiting);

      let saveInterval: ReturnType<typeof setInterval> | null = null;
      if (watchKey) {
        let syncCounter = 0;
        saveInterval = setInterval(() => {
          saveProgress({ video, watchKey, type: type || "movie", seriesId, epId, id, onAutoAdvance });
          syncCounter++;
          if (syncCounter % 6 === 0) registerProgressSync();
        }, 5000);
      }

      const timeout = setTimeout(() => {
        callbacks.onError("timeout", "Video is taking too long to start. Try again.");
      }, 15000);

      const emptyCheck = setInterval(() => {
        if (video.readyState === 0) {
          clearInterval(emptyCheck);
          callbacks.onError("empty_stream", "Stream returned empty data. The content may not be available on this server.");
        } else if (video.readyState > 0) {
          clearInterval(emptyCheck);
        }
      }, 2000);

      shakaCleanupRef.current = () => {
        clearTimeout(timeout);
        clearInterval(emptyCheck);
        if (saveInterval) clearInterval(saveInterval);
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("durationchange", onDurationChange);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("waiting", onWaiting);
      };
    },
    [videoRef, callbacks],
  );

  const destroy = useCallback(() => {
    if (shakaCleanupRef.current) { shakaCleanupRef.current(); shakaCleanupRef.current = null; }
    try { playerRef.current?.destroy(); } catch {}
    playerRef.current = null;
  }, []);

  useEffect(() => () => destroy(), [destroy]);

  return { playerRef, shakaCleanupRef, playShaka, destroy };
}
