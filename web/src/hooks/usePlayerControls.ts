/**
 * usePlayerControls — playback control callbacks (play, seek, volume, etc.)
 *
 * Extracts the stable control-surface functions from useVideoPlayer so the
 * parent hook only handles orchestration and sub-hook wiring.
 *
 * All callbacks are stable (useCallback with the correct deps).
 */
import { useCallback } from "react";
import type { PlayPhase } from "./usePlayerTypes";

export interface PlayerControlsDeps {
  videoRef: React.RefObject<HTMLVideoElement>;
  subHlsRef: React.MutableRefObject<any>;
  remuxVodUrlRef: React.MutableRefObject<string | null>;
  remuxVodTranscodeRef: React.MutableRefObject<boolean>;
  isLive: boolean;
  isVod: boolean;
  playVodRemux: (url: string, pos: number | null, tc: boolean) => void;
  destroyMpegts: () => void;
  destroyHls: () => void;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
  setPhase: (p: PlayPhase) => void;
  setVolumeState: React.Dispatch<React.SetStateAction<number>>;
  volume: number;
  muted: boolean;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  setPlaybackRate: React.Dispatch<React.SetStateAction<number>>;
  setQualityIdx: React.Dispatch<React.SetStateAction<number>>;
  setIsBehindLive: React.Dispatch<React.SetStateAction<boolean>>;
  setSecondsBehindLive: React.Dispatch<React.SetStateAction<number>>;
  clearLoadingTimeout: () => void;
  saveVolume: (val: number) => void;
  saveMuted: (muted: boolean) => void;
}

export interface PlayerControlsReturn {
  togglePlay: () => void;
  seekTo: (time: number) => void;
  seek: (delta: number) => void;
  setVolume: (val: number) => void;
  toggleMute: () => void;
  setSpeed: (rate: number) => void;
  setQuality: (idx: number) => void;
  seekToLive: () => void;
}

export function usePlayerControls(
  deps: PlayerControlsDeps,
): PlayerControlsReturn {
  const {
    videoRef,
    subHlsRef,
    remuxVodUrlRef,
    remuxVodTranscodeRef,
    isLive,
    isVod: _isVod,
    playVodRemux,
    destroyMpegts,
    destroyHls,
    setCurrentTime,
    setPhase,
    setVolumeState,
    volume,
    muted,
    setMuted,
    setPlaybackRate,
    setQualityIdx,
    setIsBehindLive,
    setSecondsBehindLive,
    clearLoadingTimeout: _clearLoadingTimeout,
    saveVolume,
    saveMuted,
  } = deps;

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPhase("playing");
    } else {
      v.pause();
      setPhase("paused");
    }
  }, [videoRef, setPhase]);

  const seekTo = useCallback(
    (time: number) => {
      const v = videoRef.current;
      if (!v) return;
      if (isLive) {
        const buf = v.buffered;
        if (buf.length === 0) return;
        const clampedTime = Math.max(
          buf.start(0),
          Math.min(time, buf.end(0) - 1),
        );
        v.currentTime = clampedTime;
        setCurrentTime(clampedTime);
        return;
      }
      if (subHlsRef.current) {
        v.currentTime = Math.max(0, time);
        setCurrentTime(v.currentTime);
        return;
      }
      if (!remuxVodUrlRef.current) return;
      try {
        v.currentTime = Math.max(0, time);
        setCurrentTime(v.currentTime);
      } catch {
        /* Remux/stream error — silent fallback */
        const url = remuxVodUrlRef.current;
        const isTC = remuxVodTranscodeRef.current;
        destroyMpegts();
        destroyHls();
        setPhase("loading");
        playVodRemux(url, Math.max(0, time), isTC);
      }
    },
    [
      videoRef,
      isLive,
      subHlsRef,
      remuxVodUrlRef,
      remuxVodTranscodeRef,
      destroyMpegts,
      destroyHls,
      setPhase,
      setCurrentTime,
      playVodRemux,
    ],
  );

  const seek = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      if (isLive) {
        const buf = v.buffered;
        if (buf.length === 0) return;
        const target = Math.max(
          buf.start(0),
          Math.min((v.currentTime || 0) + delta, buf.end(0) - 1),
        );
        v.currentTime = target;
        setCurrentTime(target);
        return;
      }
      const target = Math.max(0, (v.currentTime || 0) + delta);
      if (subHlsRef.current) {
        v.currentTime = target;
        setCurrentTime(target);
        return;
      }
      seekTo(target);
    },
    [videoRef, isLive, subHlsRef, setCurrentTime, seekTo],
  );

  const setVolume = useCallback(
    (val: number) => {
      const v = videoRef.current;
      if (v) {
        v.volume = val;
        if (val > 0 && muted) {
          v.muted = false;
          setMuted(false);
          saveMuted(false);
        }
      }
      setVolumeState(val);
      if (val === 0) setMuted(true);
      saveVolume(val);
    },
    [videoRef, muted, setMuted, setVolumeState, saveVolume, saveMuted],
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (muted) {
      v.muted = false;
      v.volume = volume || 0.8;
      setMuted(false);
      setVolumeState(v.volume);
      saveMuted(false);
    } else {
      v.muted = true;
      v.volume = 0;
      setMuted(true);
      setVolumeState(0);
      saveMuted(true);
    }
  }, [videoRef, muted, volume, setMuted, setVolumeState, saveMuted]);

  const setSpeed = useCallback(
    (rate: number) => {
      const v = videoRef.current;
      if (v) v.playbackRate = rate;
      setPlaybackRate(rate);
    },
    [videoRef, setPlaybackRate],
  );

  const setQuality = useCallback(
    (idx: number) => {
      setQualityIdx(idx);
    },
    [setQualityIdx],
  );

  const seekToLive = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const buf = v.buffered;
    if (buf.length === 0) return;
    const liveEdge = Math.max(buf.end(0) - 2, 0);
    v.currentTime = liveEdge;
    setCurrentTime(liveEdge);
    if (v.paused) v.play().catch(() => {});
    setIsBehindLive(false);
    setSecondsBehindLive(0);
  }, [videoRef, setCurrentTime, setIsBehindLive, setSecondsBehindLive]);

  return {
    togglePlay,
    seekTo,
    seek,
    setVolume,
    toggleMute,
    setSpeed,
    setQuality,
    seekToLive,
  };
}
