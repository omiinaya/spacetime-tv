/**
 * useHlsPlayer — HLS VOD playback via hls.js
 *
 * Extracted from useVideoPlayer.ts to improve maintainability.
 * Handles HLS stream setup, native HLS fallback for Safari,
 * progress saving, and error recovery.
 */

import { useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import {
  tryAutoplay,
  saveProgress,
  registerProgressSync,
} from "./usePlayerUtils";
import type { PlayPhase, ErrorType, VideoSourceType } from "./usePlayerTypes";

export interface HlsPlayerCallbacks {
  onPhaseChange: (phase: PlayPhase) => void;
  onError: (type: ErrorType, msg: string) => void;
  onStall: () => void;
  onTimeUpdate: (currentTime: number, buffered: number) => void;
  onDuration: (dur: number) => void;
  onAutoplayMuted: () => void;
  clearLoadingTimeout: () => void;
  /** Called when hls.js encounters an unrecoverable fatal error.
   *  The consumer can fall back to shaka-player with the given URL. */
  onHlsFatalError?: (url: string) => void;
}

export function useHlsPlayer(
  videoRef: React.RefObject<HTMLVideoElement>,
  callbacks: HlsPlayerCallbacks,
) {
  const hlsRef = useRef<Hls | null>(null);
  const hlsCleanupRef = useRef<(() => void) | null>(null);

  const playHLS = useCallback(
    (
      playlistUrl: string,
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

      if (hlsCleanupRef.current) {
        hlsCleanupRef.current();
        hlsCleanupRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");

      let saveInterval: ReturnType<typeof setInterval> | null = null;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hlsRef.current = hls;
        hls.loadSource(playlistUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          callbacks.onPhaseChange("playing");
          callbacks.onDuration(
            hls.levels[0]?.details?.totalduration || video.duration || 0,
          );
          tryAutoplay(video, callbacks.onAutoplayMuted).then((started) => {
            if (!started) callbacks.onPhaseChange("paused");
          });
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                callbacks.onError("stream_error", "Playback error. Try again.");
                hls.destroy();
                // Try fallback to shaka-player for unrecoverable errors
                callbacks.onHlsFatalError?.(playlistUrl);
                break;
            }
          }
        });

        if (startPos && startPos > 5) {
          const resumeHandler = () => {
            video.currentTime = startPos;
            hls.off(Hls.Events.MANIFEST_PARSED, resumeHandler);
          };
          hls.on(Hls.Events.MANIFEST_PARSED, resumeHandler);
        }
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = playlistUrl;
        video.addEventListener(
          "loadedmetadata",
          () => {
            callbacks.onDuration(video.duration || 0);
            if (startPos && startPos > 5) video.currentTime = startPos;
            callbacks.onPhaseChange("playing");
            tryAutoplay(video, callbacks.onAutoplayMuted).then((started) => {
              if (!started) callbacks.onPhaseChange("paused");
            });
          },
          { once: true },
        );
      } else {
        callbacks.onError(
          "not_supported",
          "This video format is not supported by your browser.",
        );
        return;
      }

      const onTimeUpdate = () => {
        const buf = video.buffered;
        callbacks.onTimeUpdate(
          video.currentTime,
          buf.length > 0 ? buf.end(buf.length - 1) : 0,
        );
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
          if (syncCounter % 6 === 0) registerProgressSync();
        }, 5000);
      }

      const timeout = setTimeout(() => {
        callbacks.onError(
          "timeout",
          "Video is taking too long to start. Try again.",
        );
      }, 15000);

      const emptyCheck = setInterval(() => {
        if (video.readyState === 0) {
          clearInterval(emptyCheck);
          callbacks.onError(
            "empty_stream",
            "Stream returned empty data. The content may not be available on this server.",
          );
        } else if (video.readyState > 0) {
          clearInterval(emptyCheck);
        }
      }, 2000);

      hlsCleanupRef.current = () => {
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
    if (hlsCleanupRef.current) {
      hlsCleanupRef.current();
      hlsCleanupRef.current = null;
    }
    try {
      hlsRef.current?.destroy();
    } catch {} // cleanup — errors expected if already destroyed
    hlsRef.current = null;
  }, []);

  useEffect(() => () => destroy(), [destroy]);

  return { hlsRef, hlsCleanupRef, playHLS, destroy };
}
