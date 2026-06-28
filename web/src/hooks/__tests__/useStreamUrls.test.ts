/**
 * Tests for useStreamUrls — derived URL builder for the video player.
 *
 * Pure useMemo-derived values — no side effects, no DOM.
 * Tests all combinations of type (live/movie/series), id, qualityIdx.
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStreamUrls } from "@/hooks/useStreamUrls";

describe("useStreamUrls", () => {
  describe("live type", () => {
    const params = { type: "live" as const, id: "55", seriesId: undefined, epId: undefined, qualityIdx: 0 };

    it("isLive=true, isVod=false", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.isLive).toBe(true);
      expect(result.current.isVod).toBe(false);
    });

    it("builds stream path", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.streamPath).toBe("/api/stream/live/55");
    });

    it("builds dashUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.dashUrl).toBe("/api/stream/live/55/manifest.mpd");
    });

    it("builds probeUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.probeUrl).toBe("/api/live/probe/55");
    });

    it("builds transcodePath for qualityIdx=0 (null height → /transcode)", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.transcodePath).toBe("/api/stream/live/55/transcode");
    });

    it("builds transcodePath with height for qualityIdx=2 (720p)", () => {
      const { result } = renderHook(() => useStreamUrls({ ...params, qualityIdx: 2 }));
      expect(result.current.transcodePath).toBe("/api/stream/live/55/quality/720");
    });

    it("returns null for remuxUrl, vodTranscodeUrl, hlsInitUrl on live", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.remuxUrl).toBeNull();
      expect(result.current.vodTranscodeUrl).toBeNull();
      expect(result.current.hlsInitUrl).toBeNull();
    });

    it("returns empty watchKey and streamId=id on live", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.watchKey).toBe("");
      expect(result.current.streamId).toBe("55");
    });
  });

  describe("movie type", () => {
    const params = { type: "movie" as const, id: "42", seriesId: undefined, epId: undefined, qualityIdx: 0 };

    it("isLive=false, isVod=true", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.isLive).toBe(false);
      expect(result.current.isVod).toBe(true);
    });

    it("builds stream path", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.streamPath).toBe("/api/stream/movie/42");
    });

    it("builds remuxUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.remuxUrl).toBe("/api/stream/movie/42/remux");
    });

    it("builds vodTranscodeUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.vodTranscodeUrl).toBe("/api/stream/movie/42/transcode");
    });

    it("builds hlsInitUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.hlsInitUrl).toBe("/api/movie/hls/42");
    });

    it("builds dashUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.dashUrl).toBe("/api/stream/movie/42/manifest.mpd");
    });

    it("builds probeUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.probeUrl).toBe("/api/movie/probe/42");
    });

    it("returns null transcodePath for VOD (qualityIdx ignored for VOD)", () => {
      const { result } = renderHook(() => useStreamUrls({ ...params, qualityIdx: 2 }));
      expect(result.current.transcodePath).toBeNull();
    });

    it("returns watchKey format vod_{id}", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.watchKey).toBe("vod_42");
    });

    it("returns streamId=id for movie", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.streamId).toBe("42");
    });
  });

  describe("series type", () => {
    const params = { type: "series" as const, id: undefined, seriesId: "7", epId: "101", qualityIdx: 0 };

    it("isLive=false, isVod=true", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.isLive).toBe(false);
      expect(result.current.isVod).toBe(true);
    });

    it("builds stream path", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.streamPath).toBe("/api/stream/series/7/101");
    });

    it("builds remuxUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.remuxUrl).toBe("/api/stream/series/7/101/remux");
    });

    it("builds vodTranscodeUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.vodTranscodeUrl).toBe("/api/stream/series/7/101/transcode");
    });

    it("builds hlsInitUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.hlsInitUrl).toBe("/api/series/hls/7/101");
    });

    it("builds dashUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.dashUrl).toBe("/api/stream/series/7/101/manifest.mpd");
    });

    it("builds probeUrl", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.probeUrl).toBe("/api/series/probe/101");
    });

    it("returns null transcodePath for VOD", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.transcodePath).toBeNull();
    });

    it("returns watchKey format ep_{seriesId}_{epId}", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.watchKey).toBe("ep_7_101");
    });

    it("returns streamId=epId for series", () => {
      const { result } = renderHook(() => useStreamUrls(params));
      expect(result.current.streamId).toBe("101");
    });
  });

  describe("edge cases", () => {
    it("handles missing seriesId/epId gracefully (series)", () => {
      const { result } = renderHook(() =>
        useStreamUrls({ type: "series", id: undefined, seriesId: undefined, epId: undefined, qualityIdx: 0 }),
      );
      expect(result.current.streamPath).toBe("/api/stream/series/undefined/undefined");
      expect(result.current.streamId).toBe("");
      expect(result.current.dashUrl).toBeNull();
    });

    it("handles missing id gracefully (movie)", () => {
      const { result } = renderHook(() =>
        useStreamUrls({ type: "movie", id: undefined, seriesId: undefined, epId: undefined, qualityIdx: 0 }),
      );
      expect(result.current.streamPath).toBe("/api/stream/movie/undefined");
      expect(result.current.watchKey).toBe("vod_undefined");
    });
  });
});
