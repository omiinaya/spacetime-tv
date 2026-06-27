/**
 * useStreamUrls — Derived values and API URL builders for the video player
 *
 * Extracted from useVideoPlayer.ts to reduce file size and improve
 * testability. Returns all computed stream paths, watch metadata, and
 * URL strings derived from the video source type and identifiers.
 */
export type { VideoSourceType } from "./usePlayerTypes";
import { useMemo } from "react";
import { QUALITIES } from "./usePlayerTypes";
import type { VideoSourceType } from "./usePlayerTypes";

export interface UseStreamUrlsParams {
  type: VideoSourceType;
  id: string | undefined;
  seriesId: string | undefined;
  epId: string | undefined;
  qualityIdx: number;
}

export interface UseStreamUrlsReturn {
  /** Whether this is a live TV stream */
  isLive: boolean;
  /** Whether this is a VOD (movie or series episode) */
  isVod: boolean;
  /** Composite key for watch progress persistence */
  watchKey: string;
  /** Stream identifier — episode ID for series, content ID otherwise */
  streamId: string;
  /** Base stream URL (without format suffix) */
  streamPath: string;
  /** Transcode/quality override path (live only) */
  transcodePath: string | null;
  /** VOD remux stream URL */
  remuxUrl: string | null;
  /** VOD transcode URL (HEVC → H.264 fallback) */
  vodTranscodeUrl: string | null;
  /** HLS playlist initialisation URL (checks cache readiness) */
  hlsInitUrl: string | null;
  /** Stream probe URL (codec detection) */
  probeUrl: string;
  /** DASH MPD manifest URL (shaka-player fallback) */
  dashUrl: string | null;
}

export function useStreamUrls({
  type,
  id,
  seriesId,
  epId,
  qualityIdx,
}: UseStreamUrlsParams): UseStreamUrlsReturn {
  const isLive = type === "live";
  const isVod = type === "movie" || type === "series";
  const watchKey =
    type === "movie"
      ? `vod_${id}`
      : type === "series"
        ? `ep_${seriesId}_${epId}`
        : "";
  const streamId = epId || id || "";

  const dashUrl: string | null =
    type === "live"
      ? `/api/stream/live/${id}/manifest.mpd`
      : type === "movie"
        ? `/api/stream/movie/${id}/manifest.mpd`
        : type === "series" && seriesId && epId
          ? `/api/stream/series/${seriesId}/${epId}/manifest.mpd`
          : null;

  const streamPath = useMemo(() => {
    if (type === "live") return `/api/stream/live/${id}`;
    if (type === "movie") return `/api/stream/movie/${id}`;
    return `/api/stream/series/${seriesId}/${epId}`;
  }, [type, id, seriesId, epId]);

  const transcodePath = useMemo(() => {
    const qh = QUALITIES[qualityIdx].height;
    if (!isLive) return null;
    if (qh) return `/api/stream/live/${id}/quality/${qh}`;
    return `/api/stream/live/${id}/transcode`;
  }, [isLive, id, qualityIdx]);

  const remuxUrl = useMemo(() => {
    if (!isVod) return null;
    if (type === "movie") return `/api/stream/movie/${id}/remux`;
    return `/api/stream/series/${seriesId}/${epId}/remux`;
  }, [isVod, type, id, seriesId, epId]);

  const vodTranscodeUrl = useMemo(() => {
    if (!isVod) return null;
    if (type === "movie") return `/api/stream/movie/${id}/transcode`;
    return `/api/stream/series/${seriesId}/${epId}/transcode`;
  }, [isVod, type, id, seriesId, epId]);

  const hlsInitUrl = useMemo(() => {
    if (!isVod) return null;
    if (type === "movie") return `/api/movie/hls/${id}`;
    return `/api/series/hls/${seriesId}/${epId}`;
  }, [isVod, type, id, seriesId, epId]);

  const probeUrl = useMemo(() => {
    if (type === "live") return `/api/live/probe/${id}`;
    if (type === "movie") return `/api/movie/probe/${id}`;
    return `/api/series/probe/${streamId}`;
  }, [type, id, streamId]);

  return {
    isLive,
    isVod,
    watchKey,
    streamId,
    dashUrl,
    streamPath,
    transcodePath,
    remuxUrl,
    vodTranscodeUrl,
    hlsInitUrl,
    probeUrl,
  };
}
