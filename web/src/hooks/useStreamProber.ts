/**
 * useStreamProber — Stream codec probing with safety timer
 *
 * Encapsulates the probe logic previously inlined in useVideoPlayer's
 * main effect. Runs ffprobe (via API call) to detect HEVC vs native
 * H.264, with an 18-second safety timer fallback.
 */
import { useRef, useCallback } from "react";
import { probeStream, transcodeCache } from "./usePlayerUtils";
import type { ProbeResult, PlayPhase, ErrorType } from "./usePlayerTypes";

export interface ProberCallbacks {
  /** Called when probe determines result */
  onProbeResult: (needsTranscode: boolean, probeHeight: number) => void;
  /** Called when probe times out (no result in 18s) */
  onProbeTimeout: () => void;
  /** Called when probe detects unavailable stream */
  onUnavailable: (msg: string) => void;
  /** Set loading step message */
  setLoadingStep: (msg: string) => void;
  /** Set phase */
  setPhase: (p: PlayPhase) => void;
  /** Set error */
  setError: (type: ErrorType, msg: string) => void;
  /** Set transcoding flag */
  setTranscoding: (t: boolean) => void;
  /** Start or clear loading timeout */
  startLoadingTimeout: () => void;
  clearLoadingTimeout: () => void;
}

/**
 * Probe a stream to detect its codec. Runs a probe via the API,
 * checks the transcode cache, and calls the appropriate callback.
 * Returns the probe result for further processing.
 */
export async function runProbe(
  probeUrl: string,
  streamId: string,
  abortSignal: AbortSignal,
  isLive: boolean,
): Promise<{
  needsTranscode: boolean;
  probeHeight: number;
}> {
  let needsTranscode = false;
  let probeHeight = 0;

  if (transcodeCache.has(streamId)) {
    needsTranscode = transcodeCache.get(streamId) === "hevc";
  } else {
    let result: ProbeResult;
    try {
      result = await probeStream(probeUrl, abortSignal);
    } catch {
      result = { codec: "unknown" };
    }

    if (result.codec === "hevc") {
      needsTranscode = true;
      probeHeight = result.height || 0;
      transcodeCache.set(streamId, "hevc");
    } else if (result.codec === "unavailable") {
      throw new UnavailableError(
        isLive
          ? "This channel is not available on the current CDN edge. Try a different channel or source."
          : "This video is not available on the current CDN edge server.",
        streamId,
      );
    } else {
      transcodeCache.set(streamId, "native");
    }
  }

  return { needsTranscode, probeHeight };
}

export class UnavailableError extends Error {
  streamId: string;
  constructor(msg: string, streamId: string) {
    super(msg);
    this.name = "UnavailableError";
    this.streamId = streamId;
  }
}

/**
 * Hook that manages the probe lifecycle with a safety timer.
 * Handles the 18-second timeout and graceful fallback.
 */
export function useStreamProber(
  probeUrl: string,
  streamId: string,
  isLive: boolean,
  callbacks: ProberCallbacks,
) {
  const {
    onProbeResult,
    onProbeTimeout,
    onUnavailable,
    setLoadingStep,
    setPhase,
    setError,
    setTranscoding,
    startLoadingTimeout,
    clearLoadingTimeout,
  } = callbacks;

  const callbackRefs = useRef(callbacks);
  callbackRefs.current = callbacks;

  const startProbe = useCallback(
    (cancelled: { current: boolean }) => {
      const abortController = new AbortController();

      const safetyTimer = setTimeout(() => {
        if (cancelled.current) return;
        transcodeCache.set(streamId, "native");
        onProbeTimeout();
      }, 18_000);

      const probe = async () => {
        setPhase("probing");
        setTranscoding(false);
        setLoadingStep("Detecting video format…");

        // Loading step update after 5s
        const probeTimer = setTimeout(() => {
          if (!cancelled.current) setLoadingStep("Analyzing video format…");
        }, 5_000);

        try {
          const result = await runProbe(probeUrl, streamId, abortController.signal, isLive);
          if (cancelled.current) return;

          clearTimeout(safetyTimer);
          clearTimeout(probeTimer);
          clearLoadingTimeout();
          onProbeResult(result.needsTranscode, result.probeHeight);
        } catch (e) {
          if (cancelled.current) return;
          clearTimeout(safetyTimer);
          clearTimeout(probeTimer);

          if (e instanceof UnavailableError) {
            onUnavailable(e.message);
          } else if ((e as Error)?.name !== "AbortError") {
            setPhase("error");
            setError("timeout", "Failed to probe stream");
          }
        }
      };

      probe();
      return () => {
        cancelled.current = true;
        clearTimeout(safetyTimer);
        abortController.abort();
      };
    },
    [
      probeUrl,
      streamId,
      isLive,
      onProbeResult,
      onProbeTimeout,
      onUnavailable,
      setLoadingStep,
      setPhase,
      setError,
      setTranscoding,
      startLoadingTimeout,
      clearLoadingTimeout,
    ],
  );

  return { startProbe };
}
