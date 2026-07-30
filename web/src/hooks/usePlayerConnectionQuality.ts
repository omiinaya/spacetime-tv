/**
 * usePlayerConnectionQuality — download speed / stall / connection health
 *
 * Tracks stall count, dropped frames, and download speed to produce
 * a ConnectionQuality rating that can be used for adaptive quality.
 *
 * Returns stable state + callbacks for sub-hook wiring.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import type { ConnectionQuality } from "./usePlayerTypes";
import { QUALITIES } from "./usePlayerTypes";

export interface UseConnectionQualityParams {
  /** Current download speed in KB/s (supplied externally) */
  downloadSpeed: number;
  /** Current quality index (for lower-quality suggestion) */
  qualityIdx: number;
}

export interface UseConnectionQualityReturn {
  connectionQuality: ConnectionQuality;
  stallCount: number;
  suggestLowerQuality: boolean;
  /** Call from sub-hook onStats callbacks */
  onStats: (speed: number, dropped: number, decoded: number) => void;
  /** Call from sub-hook onStall callbacks */
  onStall: () => void;
}

export function usePlayerConnectionQuality({
  downloadSpeed,
  qualityIdx,
}: UseConnectionQualityParams): UseConnectionQualityReturn {
  const [connectionQuality, setConnectionQuality] =
    useState<ConnectionQuality>("excellent");
  const [stallCount, setStallCount] = useState(0);
  const [suggestLowerQuality, setSuggestLowerQuality] = useState(false);

  const droppedFramesRef = useRef(0);
  const decodedFramesRef = useRef(0);
  const stallTimestampsRef = useRef<number[]>([]);

  const onStats = useCallback(
    (_speed: number, dropped: number, decoded: number) => {
      droppedFramesRef.current = dropped;
      decodedFramesRef.current = decoded;
    },
    [],
  );

  const onStall = useCallback(() => {
    stallTimestampsRef.current.push(Date.now());
  }, []);

  const computeConnectionQuality = useCallback(() => {
    const now = Date.now();
    const recentStalls = stallTimestampsRef.current.filter(
      (t) => now - t < 30000,
    );
    stallTimestampsRef.current = recentStalls;
    const recentStallCount = recentStalls.length;
    const speed = downloadSpeed;
    const dropped = droppedFramesRef.current;
    const decoded = decodedFramesRef.current || 1;
    const dropRatio = dropped / decoded;
    let quality: ConnectionQuality;
    // Don't report quality until we have actual download speed data
    if (speed <= 0) {
      quality = "excellent";
    } else if (speed > 2000 && recentStallCount < 2 && dropRatio < 0.02)
      quality = "excellent";
    else if (speed > 500 && recentStallCount < 4 && dropRatio < 0.05)
      quality = "good";
    else if (speed > 100 && recentStallCount < 8) quality = "fair";
    else quality = "poor";
    setConnectionQuality(quality);
    setStallCount(recentStallCount);
    setSuggestLowerQuality(
      quality === "poor" && qualityIdx < QUALITIES.length - 1,
    );
  }, [downloadSpeed, qualityIdx]);

  useEffect(() => {
    const interval = setInterval(computeConnectionQuality, 3000);
    return () => clearInterval(interval);
  }, [computeConnectionQuality]);

  return {
    connectionQuality,
    stallCount,
    suggestLowerQuality,
    onStats,
    onStall,
  };
}
