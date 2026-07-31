/**
 * Tests for useStreamProber — stream codec probing and safety timer.
 *
 * The runProbe function uses probeStream from usePlayerUtils which we
 * mock at the module level. The useStreamProber hook wraps this with
 * a safety timer — tested here for the pure function logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock probeStream before importing the module under test
const mockProbeStream = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/usePlayerUtils", () => ({
  probeStream: mockProbeStream,
  transcodeCache: new Map<string, string>(),
  getWatchPos: vi.fn(),
  getVolume: vi.fn(() => 0.8),
  getMuted: vi.fn(() => false),
  saveVolume: vi.fn(),
  saveMuted: vi.fn(),
  tryAutoplay: vi.fn(),
  saveProgress: vi.fn(),
  fmtTime: vi.fn((s: number) => `${s}`),
  registerProgressSync: vi.fn(),
}));

import { transcodeCache } from "@/hooks/usePlayerUtils";
import { runProbe, UnavailableError } from "@/hooks/useStreamProber";

describe("UnavailableError", () => {
  it("has correct name, message, and streamId", () => {
    const err = new UnavailableError("Stream down", "stream_1");
    expect(err.name).toBe("UnavailableError");
    expect(err.message).toBe("Stream down");
    expect(err.streamId).toBe("stream_1");
  });
});

describe("runProbe", () => {
  beforeEach(() => {
    transcodeCache.clear();
    vi.clearAllMocks();
  });

  it("returns needsTranscode=true when cache says hevc", async () => {
    transcodeCache.set("stream_1", "hevc");
    const result = await runProbe(
      "/url",
      "stream_1",
      new AbortController().signal,
      true,
    );
    expect(result.needsTranscode).toBe(true);
    expect(mockProbeStream).not.toHaveBeenCalled();
  });

  it("returns needsTranscode=false when cache says native", async () => {
    transcodeCache.set("stream_1", "native");
    const result = await runProbe(
      "/url",
      "stream_1",
      new AbortController().signal,
      true,
    );
    expect(result.needsTranscode).toBe(false);
    expect(mockProbeStream).not.toHaveBeenCalled();
  });

  it("fetches probe and caches native result", async () => {
    mockProbeStream.mockResolvedValue({ codec: "h264", native: true });

    const result = await runProbe(
      "/url",
      "stream_2",
      new AbortController().signal,
      true,
    );

    expect(result.needsTranscode).toBe(false);
    expect(transcodeCache.get("stream_2")).toBe("native");
  });

  it("fetches probe and caches HEVC result", async () => {
    mockProbeStream.mockResolvedValue({ codec: "hevc", height: 2160 });

    const result = await runProbe(
      "/url",
      "stream_3",
      new AbortController().signal,
      true,
    );

    expect(result.needsTranscode).toBe(true);
    expect(result.probeHeight).toBe(2160);
    expect(transcodeCache.get("stream_3")).toBe("hevc");
  });

  it("throws UnavailableError when stream is unavailable", async () => {
    mockProbeStream.mockResolvedValue({ codec: "unavailable" });

    await expect(
      runProbe("/url", "stream_4", new AbortController().signal, false),
    ).rejects.toThrow(UnavailableError);
  });

  it("defaults to native on probe error", async () => {
    mockProbeStream.mockRejectedValue(new Error("Network error"));

    const result = await runProbe(
      "/url",
      "stream_5",
      new AbortController().signal,
      true,
    );
    expect(result.needsTranscode).toBe(false);
    expect(transcodeCache.get("stream_5")).toBe("native");
  });

  it("separates cache keys per stream ID", async () => {
    transcodeCache.set("stream_a", "hevc");
    transcodeCache.set("stream_b", "native");

    const [a, b] = await Promise.all([
      runProbe("/url", "stream_a", new AbortController().signal, true),
      runProbe("/url", "stream_b", new AbortController().signal, true),
    ]);

    expect(a.needsTranscode).toBe(true);
    expect(b.needsTranscode).toBe(false);
  });
});
