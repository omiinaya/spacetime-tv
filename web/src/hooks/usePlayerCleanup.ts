/**
 * usePlayerCleanup — Unified player cleanup utilities
 *
 * Provides a single `destroyAllPlayers()` function that cleans up all
 * sub-player instances (mpegts, HLS, remux, shaka). This replaces the
 * repeated destroy boilerplate found in playMPEGTS, playVodRemux,
 * startVod, and switchAudioTrack in useVideoPlayer.ts.
 */

import { useCallback, useRef } from "react";

export interface PlayerRefs {
  mpegtsCleanupRef: React.MutableRefObject<(() => void) | null>;
  mpegtsPlayerRef: React.MutableRefObject<{ destroy: () => void } | null>;
  hlsCleanupRef: React.MutableRefObject<(() => void) | null>;
  subHlsRef: React.MutableRefObject<{ destroy: () => void } | null>;
  remuxCleanupRef: React.MutableRefObject<(() => void) | null>;
  remuxPlayerRef: React.MutableRefObject<{ destroy: () => void } | null>;
  shakaCleanupRef: React.MutableRefObject<(() => void) | null>;
  shakaPlayerRef: React.MutableRefObject<{ destroy: () => void } | null>;
}

/**
 * Safely call an optional cleanup function, swallowing errors
 */
function safeCleanup(fn: (() => void) | null | undefined) {
  if (fn) {
    fn();
  }
}

/** Safely destroy a player instance, swallowing errors */
function safeDestroy(
  player: { destroy: () => void } | null | undefined,
) {
  if (player) {
    try {
      player.destroy();
    } catch {} // errors expected if already destroyed
  }
}

/**
 * Destroy all player instances (mpegts, HLS, remux, shaka).
 * Callback refs are cleared after destruction.
 */
export function destroyAll(refs: PlayerRefs) {
  // Cleanup callbacks first, then destroy instances
  safeCleanup(refs.mpegtsCleanupRef.current);
  refs.mpegtsCleanupRef.current = null;
  safeDestroy(refs.mpegtsPlayerRef.current);
  refs.mpegtsPlayerRef.current = null;

  safeCleanup(refs.hlsCleanupRef.current);
  refs.hlsCleanupRef.current = null;
  safeDestroy(refs.subHlsRef.current);
  refs.subHlsRef.current = null;

  safeCleanup(refs.remuxCleanupRef.current);
  refs.remuxCleanupRef.current = null;
  safeDestroy(refs.remuxPlayerRef.current);
  refs.remuxPlayerRef.current = null;

  safeCleanup(refs.shakaCleanupRef.current);
  refs.shakaCleanupRef.current = null;
  safeDestroy(refs.shakaPlayerRef.current);
  refs.shakaPlayerRef.current = null;
}

/**
 * Destroy all players EXCEPT the named exception.
 * Useful when switching to a specific player — clean up everything else.
 */
export function destroyAllExcept(
  refs: PlayerRefs,
  keep: "mpegts" | "hls" | "remux" | "shaka",
) {
  if (keep !== "mpegts") {
    safeCleanup(refs.mpegtsCleanupRef.current);
    refs.mpegtsCleanupRef.current = null;
    safeDestroy(refs.mpegtsPlayerRef.current);
    refs.mpegtsPlayerRef.current = null;
  }
  if (keep !== "hls") {
    safeCleanup(refs.hlsCleanupRef.current);
    refs.hlsCleanupRef.current = null;
    safeDestroy(refs.subHlsRef.current);
    refs.subHlsRef.current = null;
  }
  if (keep !== "remux") {
    safeCleanup(refs.remuxCleanupRef.current);
    refs.remuxCleanupRef.current = null;
    safeDestroy(refs.remuxPlayerRef.current);
    refs.remuxPlayerRef.current = null;
  }
  if (keep !== "shaka") {
    safeCleanup(refs.shakaCleanupRef.current);
    refs.shakaCleanupRef.current = null;
    safeDestroy(refs.shakaPlayerRef.current);
    refs.shakaPlayerRef.current = null;
  }
}

/**
 * Hook that provides player refs and cleanup utilities.
 * Returns the same interface as PlayerRefs for use in useVideoPlayer.
 */
export function usePlayerCleanup() {
  const mpegtsCleanupRef = useRef<(() => void) | null>(null);
  const mpegtsPlayerRef = useRef<{ destroy: () => void } | null>(null);
  const hlsCleanupRef = useRef<(() => void) | null>(null);
  const subHlsRef = useRef<{ destroy: () => void } | null>(null);
  const remuxCleanupRef = useRef<(() => void) | null>(null);
  const remuxPlayerRef = useRef<{ destroy: () => void } | null>(null);
  const shakaCleanupRef = useRef<(() => void) | null>(null);
  const shakaPlayerRef = useRef<{ destroy: () => void } | null>(null);

  const destroyAllPlayers = useCallback(() => {
    safeCleanup(mpegtsCleanupRef.current);
    mpegtsCleanupRef.current = null;
    safeDestroy(mpegtsPlayerRef.current);
    mpegtsPlayerRef.current = null;

    safeCleanup(hlsCleanupRef.current);
    hlsCleanupRef.current = null;
    safeDestroy(subHlsRef.current);
    subHlsRef.current = null;

    safeCleanup(remuxCleanupRef.current);
    remuxCleanupRef.current = null;
    safeDestroy(remuxPlayerRef.current);
    remuxPlayerRef.current = null;

    safeCleanup(shakaCleanupRef.current);
    shakaCleanupRef.current = null;
    safeDestroy(shakaPlayerRef.current);
    shakaPlayerRef.current = null;
  }, []);

  const refs: PlayerRefs = {
    mpegtsCleanupRef,
    mpegtsPlayerRef,
    hlsCleanupRef,
    subHlsRef,
    remuxCleanupRef,
    remuxPlayerRef,
    shakaCleanupRef,
    shakaPlayerRef,
  };

  return {
    ...refs,
    destroyAllPlayers,
  };
}
