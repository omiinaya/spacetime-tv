/**
 * Tests for usePlayerTypes — shared types and constants for video player hooks.
 *
 * Covers: QUALITIES, SPEEDS, type exports at compile time.
 */
import { describe, it, expect } from "vitest";
import { QUALITIES, SPEEDS } from "@/hooks/usePlayerTypes";

describe("QUALITIES array", () => {
  it("contains 4 quality tiers", () => {
    expect(QUALITIES).toHaveLength(4);
  });

  it("includes Original (null height)", () => {
    const original = QUALITIES.find((q) => q.label === "Original");
    expect(original).toBeDefined();
    expect(original!.height).toBeNull();
  });

  it("includes 1080p, 720p, 360p with correct heights", () => {
    expect(QUALITIES).toContainEqual({ label: "1080p", height: 1080 });
    expect(QUALITIES).toContainEqual({ label: "720p", height: 720 });
    expect(QUALITIES).toContainEqual({ label: "360p", height: 360 });
  });
});

describe("SPEEDS array", () => {
  it("contains 4 playback speeds", () => {
    expect(SPEEDS).toHaveLength(4);
  });

  it("includes 0.5, 1, 1.5, and 2", () => {
    expect(SPEEDS).toEqual([0.5, 1, 1.5, 2]);
  });
});
